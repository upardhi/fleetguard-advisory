import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { verifyPassword } from "@/app/_server/auth/password";
import { createSession } from "@/app/_server/auth/sessions";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import {
  ACCESS_COOKIE_MAX_AGE,
  REFRESH_COOKIE_MAX_AGE,
} from "@/app/_server/auth/jwt";

function normalizeRole(role: string): string {
  return role === "superadmin" ? "super_admin" : role;
}

const LoginSchema = z.object({
  email: z.string().email().max(255).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1).max(128).transform((s) => s.trim()),
});

const DUMMY_HASH =
  "$2a$12$invalidhashusedfortimingprotection00000000000000000000";

function ip(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}

function setCookies(res: NextResponse, access: string, refresh: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const base = { httpOnly: true, secure: isProd, sameSite: "lax" as const, path: "/" };
  res.cookies.set("fg_access",  access,  { ...base, maxAge: ACCESS_COOKIE_MAX_AGE });
  res.cookies.set("fg_refresh", refresh, { ...base, maxAge: REFRESH_COOKIE_MAX_AGE });
}

// Soft rate-limit: returns allowed=true if the rate_limit_counters table
// doesn't exist yet — we never want an infra gap to block all logins.
async function safeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { checkRateLimit } = await import(
      "@/app/_server/security/rateLimit"
    );
    const result = await checkRateLimit(key, limit, windowSeconds);
    return result.allowed;
  } catch {
    return true; // fail open — don't block login on infra issues
  }
}

// Non-fatal audit write — we never want audit to break the login flow.
async function safeAudit(input: {
  orgId: string;
  actorId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const { writeAuditEvent } = await import("@/app/_server/db/audit");
    await writeAuditEvent(input);
  } catch {
    // ignore — audit failures must never break auth
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = ip(req);
  const ua = req.headers.get("user-agent") ?? undefined;

  // IP-level rate limit: 20 attempts / minute (non-fatal if table missing)
  const ipAllowed = await safeRateLimit(`login:ip:${clientIp}`, 20, 60);
  if (!ipAllowed) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return applySecurityHeaders(
      NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    );
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Invalid credentials" }, { status: 422 }),
    );
  }

  const { email, password } = parsed.data;

  // Per-email rate limit (non-fatal)
  const emailAllowed = await safeRateLimit(`login:email:${email}`, 5, 300);
  if (!emailAllowed) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    );
  }

  interface UserRow {
    id: string; org_id: string; email: string; password_hash: string;
    role: string; full_name: string; mobile: string | null;
    warehouse_id: string | null; is_active: boolean; mfa_required: boolean;
    created_at: string; updated_at: string;
  }

  // Fetch user — only select columns guaranteed to exist in the schema.
  // warehouse_ids and force_password_reset are derived/defaulted in code.
  let userRows: UserRow[];
  try {
    userRows = await db`
      SELECT id, org_id, email, password_hash, role, full_name, mobile,
             warehouse_id, is_active, mfa_required,
             created_at, updated_at
      FROM   users
      WHERE  email = ${email}
      LIMIT  1
    ` as unknown as UserRow[];
  } catch (err) {
    console.error("[login] DB error fetching user:", err);
    return applySecurityHeaders(
      NextResponse.json({ error: "Server error" }, { status: 500 }),
    );
  }

  const [user] = userRows;

  // Always run bcrypt to keep response time constant (timing-safe)
  const passwordOk = user
    ? await verifyPassword(password, user.password_hash as string)
    : await verifyPassword(password, DUMMY_HASH);

  if (!user || !passwordOk || !user.is_active) {
    if (user) {
      // Non-fatal: record failed attempt
      try {
        await db`
          INSERT INTO login_attempts (id, email, ip, success)
          VALUES (${uuidv7()}, ${email}, ${clientIp}, false)
        `;
      } catch { /* ignore */ }
      void safeAudit({
        orgId: user.org_id as string,
        actorId: user.id as string,
        action: "login.failed",
        resourceType: "session",
        ip: clientIp,
        userAgent: ua,
      });
    }
    return applySecurityHeaders(
      NextResponse.json({ error: "Invalid credentials" }, { status: 401 }),
    );
  }

  // MFA required — pre-auth session
  if (user.mfa_required) {
    const sessionId = uuidv7();
    let tokens: { accessToken: string; refreshToken: string };
    try {
      tokens = await createSession({
        userId: user.id as string,
        orgId: user.org_id as string,
        role: user.role as string,
        ip: clientIp,
        userAgent: ua,
        mfaVerified: false,
        sessionId,
      });
    } catch (err) {
      console.error("[login] session create error:", err);
      return applySecurityHeaders(
        NextResponse.json({ error: "Server error" }, { status: 500 }),
      );
    }
    void safeAudit({
      orgId: user.org_id as string,
      actorId: user.id as string,
      action: "login.mfa_required",
      resourceType: "session",
      resourceId: sessionId,
      ip: clientIp,
      userAgent: ua,
    });
    const res = NextResponse.json({ mfaRequired: true }, { status: 200 });
    setCookies(res, tokens.accessToken, tokens.refreshToken);
    return applySecurityHeaders(res);
  }

  // Full login
  const sessionId = uuidv7();
  let tokens: { accessToken: string; refreshToken: string };
  try {
    tokens = await createSession({
      userId: user.id as string,
      orgId: user.org_id as string,
      role: user.role as string,
      ip: clientIp,
      userAgent: ua,
      mfaVerified: true,
      sessionId,
    });
  } catch (err) {
    console.error("[login] session create error:", err);
    return applySecurityHeaders(
      NextResponse.json({ error: "Server error" }, { status: 500 }),
    );
  }

  // Non-fatal post-login writes
  void Promise.allSettled([
    safeAudit({
      orgId: user.org_id as string,
      actorId: user.id as string,
      actorRole: user.role as string,
      action: "login.success",
      resourceType: "session",
      resourceId: sessionId,
      ip: clientIp,
      userAgent: ua,
    }),
    db`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`.catch(() => {}),
    db`INSERT INTO login_attempts (id, email, ip, success)
       VALUES (${uuidv7()}, ${email}, ${clientIp}, true)`.catch(() => {}),
  ]);

  const res = NextResponse.json({
    user: {
      uid:                user.id,
      email:              user.email,
      displayName:        user.full_name,
      role:               normalizeRole(user.role as string),
      warehouseId:        user.warehouse_id ?? "",
      warehouseIds:       [],          // not in schema, default to empty
      orgId:              user.org_id,
      isActive:           user.is_active,
      mfaRequired:        user.mfa_required,
      forcePasswordReset: false,       // not in schema, default to false
      createdAt:          user.created_at,
      updatedAt:          user.updated_at,
    },
  });
  setCookies(res, tokens.accessToken, tokens.refreshToken);
  return applySecurityHeaders(res);
}

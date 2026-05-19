import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/_server/db/client";
import { requireUser } from "@/app/_server/auth/getUser";
import { verifyTotp } from "@/app/_server/auth/mfa";
import { getVerifiedTotpSecret } from "@/app/_server/auth/mfa";
import { revokeSession, createSession } from "@/app/_server/auth/sessions";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { checkRateLimit } from "@/app/_server/security/rateLimit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import {
  ACCESS_COOKIE_MAX_AGE,
  REFRESH_COOKIE_MAX_AGE,
} from "@/app/_server/auth/jwt";

const VerifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
  credentialId: z.string().optional(), // used only during enroll confirmation
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let currentUser;
  try {
    currentUser = await requireUser(req);
  } catch {
    return applySecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? undefined;

  // 5 attempts per 60 seconds per user
  const rl = await checkRateLimit(`mfa:${currentUser.sub}`, 5, 60);
  if (!rl.allowed) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Too many attempts" }, { status: 429 }),
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

  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Invalid code format" }, { status: 422 }),
    );
  }

  const { code, credentialId } = parsed.data;

  // Enroll-confirm path: mark credential verified then upgrade session
  if (credentialId) {
    const [cred] = await db`
      SELECT id, secret FROM mfa_credentials
      WHERE  id = ${credentialId} AND user_id = ${currentUser.sub}
        AND  type = 'totp' AND verified = false
      LIMIT  1
    `;
    if (!cred) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Credential not found" }, { status: 404 }),
      );
    }
    const { decrypt } = await import("@/app/_server/db/encryption");
    const secret = decrypt(cred.secret as string, currentUser.org);
    if (!verifyTotp(code, secret)) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Invalid code" }, { status: 401 }),
      );
    }
    await db`
      UPDATE mfa_credentials SET verified = true WHERE id = ${credentialId}
    `;
    await db`UPDATE users SET mfa_required = true WHERE id = ${currentUser.sub}`;
  } else {
    // Normal login MFA step
    const secret = await getVerifiedTotpSecret(currentUser.sub, currentUser.org);
    if (!secret) {
      return applySecurityHeaders(
        NextResponse.json({ error: "No MFA credential enrolled" }, { status: 400 }),
      );
    }
    if (!verifyTotp(code, secret)) {
      return applySecurityHeaders(
        NextResponse.json({ error: "Invalid code" }, { status: 401 }),
      );
    }
  }

  // Revoke old session; issue new one with mfa=true
  await revokeSession(currentUser.sid);

  const [userRow] = await db`SELECT role FROM users WHERE id = ${currentUser.sub}`;
  const { accessToken, refreshToken, sessionId } = await createSession({
    userId: currentUser.sub,
    orgId: currentUser.org,
    role: userRow.role as string,
    ip: clientIp,
    userAgent: ua,
    mfaVerified: true,
  });

  await writeAuditEvent({
    orgId: currentUser.org,
    actorId: currentUser.sub,
    actorRole: userRow.role as string,
    action: "mfa.verified",
    resourceType: "session",
    resourceId: sessionId,
    ip: clientIp,
    userAgent: ua,
  });

  const isProd = process.env.NODE_ENV === "production";
  const base = { httpOnly: true, secure: isProd, sameSite: "lax" as const, path: "/" };
  const res = NextResponse.json({ ok: true });
  res.cookies.set("fg_access",  accessToken,  { ...base, maxAge: ACCESS_COOKIE_MAX_AGE });
  res.cookies.set("fg_refresh", refreshToken, { ...base, maxAge: REFRESH_COOKIE_MAX_AGE });
  return applySecurityHeaders(res);
}

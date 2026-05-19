/**
 * POST /api/auth/reset-password
 *
 * Consumes a reset token (issued by /api/auth/forgot-password) and sets a
 * new password. Token is single-use, short-lived, and stored only as a
 * sha256 hash.
 *
 * Body: { token: string, newPassword: string }
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/app/_server/db/client";
import {
  hashPassword,
  recordPasswordHistory,
  checkPasswordNotReused,
  validatePasswordStrength,
} from "@/app/_server/auth/password";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { token?: string; newPassword?: string };
  try {
    body = (await req.json()) as { token?: string; newPassword?: string };
  } catch {
    return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const token = body.token?.trim();
  const newPassword = body.newPassword;
  if (!token || !newPassword) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Token and new password are required" }, { status: 400 }),
    );
  }

  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) {
    return applySecurityHeaders(NextResponse.json({ error: strengthErr }, { status: 422 }));
  }

  const tokenHash = sha256Hex(token);

  const [row] = await db`
    SELECT t.id AS token_id, t.user_id, t.expires_at, t.used_at,
           u.id AS uid, u.email, u.role, u.is_active, u.org_id
    FROM   password_reset_tokens t
    JOIN   users u ON u.id = t.user_id
    WHERE  t.token_hash = ${tokenHash}
    LIMIT  1
  `;

  if (!row) {
    return applySecurityHeaders(NextResponse.json({ error: "Invalid or expired token" }, { status: 400 }));
  }
  if (row.used_at) {
    return applySecurityHeaders(NextResponse.json({ error: "This reset link has already been used" }, { status: 400 }));
  }
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return applySecurityHeaders(NextResponse.json({ error: "This reset link has expired" }, { status: 400 }));
  }
  if (row.is_active === false) {
    return applySecurityHeaders(NextResponse.json({ error: "Account is inactive" }, { status: 403 }));
  }

  if (!(await checkPasswordNotReused(row.uid as string, newPassword))) {
    return applySecurityHeaders(
      NextResponse.json({ error: "You cannot reuse a recent password" }, { status: 422 }),
    );
  }

  const hash = await hashPassword(newPassword);

  await db.begin(async (tx) => {
    await tx`UPDATE users SET password_hash = ${hash}, updated_at = now() WHERE id = ${row.uid}`;
    await tx`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${row.token_id}`;
  });
  await recordPasswordHistory(row.uid as string, hash);

  await writeAuditEvent({
    orgId: (row.org_id as string) ?? null,
    actorId: row.uid as string,
    actorRole: row.role as string,
    action: "user.password_reset_self",
    resourceType: "user",
    resourceId: row.uid as string,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    payload: { email: row.email },
  });

  return applySecurityHeaders(NextResponse.json({ ok: true }));
}

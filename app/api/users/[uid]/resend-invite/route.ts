/**
 * POST /api/users/:uid/resend-invite
 *
 * Generates a new temporary password for the target user, stores its hash,
 * forces a password reset on next login, and emails the credentials.
 *
 * Authorized to: superadmin, company_admin (scoped to their own org).
 *
 * Returns: { ok: true, email }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import {
  hashPassword,
  recordPasswordHistory,
  generateTempPassword,
} from "@/app/_server/auth/password";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { sendMail } from "@/app/_lib/sendMail";
import { emailUserOnboarding } from "@/app/_lib/userEmails";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  let actor;
  try { actor = await requireUser(req); }
  catch { return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })); }

  if (!["superadmin", "company_admin"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const { uid } = await params;
  if (!uid) {
    return applySecurityHeaders(NextResponse.json({ error: "uid is required" }, { status: 400 }));
  }

  const [user] = await db`
    SELECT id, org_id, email, full_name, is_active
    FROM   users WHERE id = ${uid} LIMIT 1
  `;
  if (!user) {
    return applySecurityHeaders(NextResponse.json({ error: "User not found" }, { status: 404 }));
  }
  if (!user.is_active) {
    return applySecurityHeaders(NextResponse.json({ error: "User is deactivated" }, { status: 409 }));
  }

  // Company admins can only resend invites within their own org. Superadmin
  // can act across orgs.
  if (actor.role === "company_admin" && user.org_id !== actor.org) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  const tempPassword = generateTempPassword();
  const hash         = await hashPassword(tempPassword);

  await db`
    UPDATE users
    SET    password_hash        = ${hash},
           password_changed_at  = now(),
           force_password_reset = true,
           updated_at           = now()
    WHERE  id = ${uid}
  `;
  await recordPasswordHistory(uid, hash);

  // Send the email — same template as initial onboarding.
  try {
    const [org] = await db`SELECT name FROM orgs WHERE id = ${user.org_id} LIMIT 1`;
    const companyName = (org?.name as string | undefined) ?? "FleetGuard";
    const { subject, html } = emailUserOnboarding({
      name:         (user.full_name as string) ?? "",
      companyName,
      email:        user.email as string,
      tempPassword,
    });
    await sendMail({ to: user.email as string, subject, html });
  } catch (err) {
    console.error("[resend-invite] email failed", err);
  }

  await writeAuditEvent({
    orgId:        user.org_id as string,
    actorId:      actor.sub,
    actorRole:    actor.role,
    action:       "user.invite_resent",
    resourceType: "user",
    resourceId:   uid,
    ip:           req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    payload:      { email: user.email },
  });

  return applySecurityHeaders(NextResponse.json({ ok: true, email: user.email }));
}

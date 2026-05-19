/**
 * POST /api/users/reset-password
 *
 * Admin-initiated password reset for a user. Accepts { uid } and generates a
 * temporary password, updates the user's hash in Supabase, and emails the new
 * credentials (or logs them if email is not configured).
 *
 * Called by: Company Admin and SuperAdmin from the user management console.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/app/_server/db/client";
import { hashPassword, recordPasswordHistory } from "@/app/_server/auth/password";
import { requireUser } from "@/app/_server/auth/getUser";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { sendMail } from "@/app/_lib/sendMail";

export interface ResetPasswordPayload {
  uid: string;
}

function generateTempPassword(): string {
  // 16-char temp password: letters + digits + special chars — always passes strength check
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let p = "";
  const bytes = crypto.randomBytes(16);
  for (const b of bytes) p += chars[b % chars.length];
  // Ensure policy: uppercase, lowercase, digit, special
  return p.slice(0, 12) + "Aa1!";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let actor;
  try {
    actor = await requireUser(req);
  } catch {
    return applySecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }

  if (!["superadmin", "company_admin"].includes(actor.role)) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  let body: ResetPasswordPayload;
  try {
    body = (await req.json()) as ResetPasswordPayload;
  } catch {
    return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const { uid } = body;
  if (!uid?.trim()) {
    return applySecurityHeaders(NextResponse.json({ error: "uid is required" }, { status: 400 }));
  }

  const [user] = await db`
    SELECT id, email, full_name, is_active, org_id
    FROM   users
    WHERE  id = ${uid}
    LIMIT  1
  `;

  if (!user) {
    return applySecurityHeaders(NextResponse.json({ error: "User not found" }, { status: 404 }));
  }

  // Superadmin can reset any user; company_admin only within their org
  if (actor.role === "company_admin" && user.org_id !== actor.org) {
    return applySecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  if (!user.is_active) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Reactivate this user before resetting their password" }, { status: 400 }),
    );
  }

  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);

  await db`
    UPDATE users
    SET    password_hash = ${hash}, updated_at = now()
    WHERE  id = ${uid}
  `;
  await recordPasswordHistory(uid as string, hash);

  await writeAuditEvent({
    orgId: user.org_id as string,
    actorId: actor.sub,
    actorRole: actor.role,
    action: "user.password_reset",
    resourceType: "user",
    resourceId: uid,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    payload: { email: user.email },
  });

  // Send email if configured
  if (process.env.MAIL_USER) {
    const { wrapEmail, emailButton, emailInfoBox, escapeHtml } = await import("@/app/_lib/emailLayout");
    const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://fleetguard.fraudcheck.ai"}/login`;
    await sendMail({
      to: user.email as string,
      subject: "FleetGuard — Your password has been reset",
      html: wrapEmail({
        preheader: "An administrator has reset your password. A temporary password is inside.",
        heading:   "Your password has been reset",
        body: `
          <p style="margin:0 0 12px;">Hi ${escapeHtml((user.full_name as string) ?? "")},</p>
          <p style="margin:0 0 16px;">An administrator has reset your FleetGuard password. Use the temporary password below to sign in, then change it immediately.</p>
          ${emailInfoBox({
            tone: "warning",
            title: "Temporary password",
            html: `<code style="font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:14px;background:#fff;padding:6px 10px;border:1px solid #fde68a;border-radius:4px;display:inline-block;">${escapeHtml(tempPassword)}</code>`,
          })}
          ${emailButton({ href: loginUrl, label: "Sign in to FleetGuard" })}
          <p style="margin:16px 0 0;font-size:13px;color:#475569;">For security, please change your password right after signing in.</p>
        `,
      }),
    });
  } else {
    console.info(`[reset-password] temp password for ${user.email}: ${tempPassword}`);
  }

  return applySecurityHeaders(NextResponse.json({ ok: true, email: user.email }));
}

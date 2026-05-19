/**
 * POST /api/support-tickets
 *
 * Creates a support ticket raised by a manager / regional_manager / cso.
 * Writes to the support_tickets table, then emails every superadmin.
 *
 * Body: { driverId, reason, description, notifyEmail, createdBy,
 *         createdByName, createdByRole }
 * Response: { ok, id, emailResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { sendMail } from "@/app/_lib/sendMail";

export interface CreateSupportTicketPayload {
  driverId: string;
  reason: string;
  description: string;
  notifyEmail: string;
  createdBy: string;
  createdByName: string;
  createdByRole: string;
}

const ALLOWED_REASONS = [
  "missing_verification", "suspicious_data", "fake_documents",
  "dl_mismatch", "bg_concern", "other",
];
const ALLOWED_CREATOR_ROLES = ["wh_manager", "regional_manager", "cso"];
const REASON_LABELS: Record<string, string> = {
  dl_mismatch: "DL mismatch", bg_concern: "Background concern", other: "Other",
  missing_verification: "Missing verification", suspicious_data: "Suspicious data",
  fake_documents: "Fake / forged documents",
};

import { wrapEmail, emailInfoBox, emailKv, emailKvTable, escapeHtml, emailButton } from "@/app/_lib/emailLayout";

async function getSuperAdminEmails(): Promise<string[]> {
  const rows = await db`SELECT email FROM users WHERE role = 'superadmin' AND is_active = true`;
  return [...new Set(rows.map((r) => (r.email as string ?? "").trim()).filter(Boolean))];
}

function renderNewTicketEmail(opts: {
  ticketId: string; driverName: string; dlNumber: string;
  reason: string; description: string; createdByName: string; createdByRole: string;
}): { subject: string; html: string } {
  const reasonLabel = REASON_LABELS[opts.reason] ?? opts.reason;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://fleetguard.fraudcheck.ai";
  const subject = `[FleetGuard] New support ticket — ${opts.driverName}`;
  const body = `
    <p style="margin:0 0 16px;">
      <strong>${escapeHtml(opts.createdByName)}</strong>
      (${escapeHtml(opts.createdByRole.replace(/_/g, " "))}) has flagged
      <strong>${escapeHtml(opts.driverName)}</strong> for cross-verification.
    </p>
    ${emailInfoBox({
      tone: "warning",
      html: emailKvTable(
        emailKv("Ticket ID",   escapeHtml(opts.ticketId)) +
        emailKv("Driver",      escapeHtml(opts.driverName)) +
        emailKv("DL Number",   `<span style="font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;">${escapeHtml(opts.dlNumber)}</span>`) +
        emailKv("Reason",      escapeHtml(reasonLabel)) +
        emailKv("Observation", `<span style="white-space:pre-wrap;">${escapeHtml(opts.description)}</span>`)
      ),
    })}
    ${emailButton({ href: `${appUrl}/superadmin/tickets`, label: "Triage in dashboard" })}
  `;
  return {
    subject,
    html: wrapEmail({
      preheader: `${opts.createdByName} flagged ${opts.driverName} — ${reasonLabel}.`,
      heading:   "New support ticket raised",
      body,
    }),
  };
}

export async function POST(req: NextRequest) {
  let body: CreateSupportTicketPayload;
  try { body = (await req.json()) as CreateSupportTicketPayload; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { driverId, reason, description, notifyEmail, createdBy, createdByName, createdByRole } = body;

  if (!driverId)
    return NextResponse.json({ error: "driverId is required" }, { status: 400 });
  if (!reason || !ALLOWED_REASONS.includes(reason))
    return NextResponse.json({ error: "invalid reason" }, { status: 400 });
  if (!description?.trim() || description.trim().length < 10)
    return NextResponse.json({ error: "description must be at least 10 characters" }, { status: 400 });
  if (!notifyEmail?.trim())
    return NextResponse.json({ error: "notifyEmail is required" }, { status: 400 });
  if (!createdBy || !createdByName)
    return NextResponse.json({ error: "creator identity is required" }, { status: 400 });
  if (!ALLOWED_CREATOR_ROLES.includes(createdByRole))
    return NextResponse.json({ error: `role ${createdByRole} cannot raise tickets` }, { status: 403 });

  const [driver] = await db`SELECT id, full_name, dl_number, org_id FROM drivers WHERE id = ${driverId} LIMIT 1`;
  if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });

  const orgId      = driver.org_id as string;
  const driverName = driver.full_name as string;
  const dlNumber   = driver.dl_number as string;

  const id    = uuidv7();
  const title = `${REASON_LABELS[reason] ?? reason} — ${driverName}`;

  // Store extra context in description as structured suffix (schema has no metadata column)
  const fullDescription = `${description.trim()}\n\n[meta:driverId=${driverId},notifyEmail=${notifyEmail.trim()},createdByRole=${createdByRole}]`;

  await db`
    INSERT INTO support_tickets (id, org_id, raised_by, title, description, priority, category)
    VALUES (${id}, ${orgId}, ${createdBy}, ${title}, ${fullDescription}, 'medium', ${reason})
  `;

  try {
    await writeAuditEvent({
      orgId, actorId: createdBy, actorRole: createdByRole as never,
      action: "support_ticket_created", resourceType: "support_ticket", resourceId: id,
      payload: { driverId, reason, createdByName },
    });
  } catch (err) {
    console.error("[support-tickets] audit log failed", err);
  }

  // Notify superadmins (best-effort)
  const emailResult: {
    attempted: boolean; recipients: string[]; sent: number;
    failed: Array<{ to: string; error: string }>;
    env: { MAIL_USER_set: boolean; MAIL_PASS_set: boolean; MAIL_FROM_set: boolean };
  } = {
    attempted: false, recipients: [], sent: 0, failed: [],
    env: {
      MAIL_USER_set: !!process.env.MAIL_USER,
      MAIL_PASS_set: !!process.env.MAIL_PASS,
      MAIL_FROM_set: !!process.env.MAIL_FROM,
    },
  };

  try {
    const recipients = await getSuperAdminEmails();
    emailResult.recipients = recipients;
    if (recipients.length > 0) {
      emailResult.attempted = true;
      const { subject, html } = renderNewTicketEmail({
        ticketId: id, driverName, dlNumber, reason,
        description: description.trim(), createdByName, createdByRole,
      });
      for (const to of recipients) {
        const res = await sendMail({ to, subject, html });
        if (res.success) { emailResult.sent += 1; }
        else { emailResult.failed.push({ to, error: res.error ?? "unknown error" }); }
      }
    }
  } catch (err) {
    emailResult.failed.push({ to: "(lookup)", error: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({ ok: true, id, emailResult });
}

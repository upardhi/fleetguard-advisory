/**
 * PATCH /api/support-tickets/[id]
 *
 * Super-admin status transition. Sends resolution email to the creator's
 * notifyEmail when status → "resolved".
 *
 * Body: { status: "open"|"in_progress"|"resolved"|"closed";
 *         resolutionNote?: string; actorId: string; actorName: string;
 *         actorRole: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_server/db/client";
import { writeAuditEvent } from "@/app/_server/db/audit";
import { sendMail } from "@/app/_lib/sendMail";

type Status = "open" | "in_progress" | "resolved" | "closed";
const ALLOWED: Status[] = ["open", "in_progress", "resolved", "closed"];
const CLOSED_STATUSES: Status[] = ["resolved", "closed"];

const REASON_LABELS: Record<string, string> = {
  missing_verification: "Missing verification", suspicious_data: "Suspicious data",
  fake_documents: "Fake / forged documents", dl_mismatch: "DL mismatch",
  bg_concern: "Background concern", other: "Other",
};

import { wrapEmail, emailInfoBox, emailKv, emailKvTable, escapeHtml } from "@/app/_lib/emailLayout";

function renderResolvedEmail(opts: {
  ticketId: string; driverName: string; reason: string;
  resolutionNote: string; resolvedByName: string;
}): { subject: string; html: string } {
  const reasonLabel = REASON_LABELS[opts.reason] ?? opts.reason;
  const subject = `[FleetGuard] Ticket resolved — ${opts.driverName}`;
  const body = `
    <p style="margin:0 0 16px;">
      The ticket about <strong>${escapeHtml(opts.driverName)}</strong>
      (${escapeHtml(reasonLabel)}) has been marked <strong>resolved</strong>.
    </p>
    ${emailInfoBox({
      tone: "success",
      html: emailKvTable(
        emailKv("Ticket ID",   escapeHtml(opts.ticketId)) +
        emailKv("Resolution",  `<span style="white-space:pre-wrap;">${escapeHtml(opts.resolutionNote)}</span>`) +
        emailKv("Resolved by", escapeHtml(opts.resolvedByName))
      ),
    })}
    <p style="margin:16px 0 0;font-size:13px;color:#475569;">
      The driver's cross-verification flag has been cleared automatically.
    </p>
  `;
  return {
    subject,
    html: wrapEmail({
      preheader: `Resolved by ${opts.resolvedByName}.`,
      heading:   "Support ticket resolved",
      body,
    }),
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing ticket id" }, { status: 400 });

  let body: { status: Status; resolutionNote?: string; actorId: string; actorName: string; actorRole: string };
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { status, resolutionNote, actorId, actorName, actorRole } = body;

  if (!actorId || !actorName || !actorRole)
    return NextResponse.json({ error: "actor identity is required" }, { status: 400 });
  if (actorRole !== "super_admin" && actorRole !== "superadmin")
    return NextResponse.json({ error: "only super admin can change ticket status" }, { status: 403 });
  if (!ALLOWED.includes(status))
    return NextResponse.json({ error: `invalid status: ${status}` }, { status: 400 });
  if (CLOSED_STATUSES.includes(status) && !resolutionNote?.trim())
    return NextResponse.json({ error: "resolutionNote is required when resolving or closing" }, { status: 400 });

  const [ticket] = await db`
    SELECT id, org_id, status, title, description, category FROM support_tickets WHERE id = ${id} LIMIT 1
  `;
  if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });

  const prevStatus = ticket.status as Status;
  if (prevStatus === status) return NextResponse.json({ ok: true, id, unchanged: true });

  const willBeClosed = CLOSED_STATUSES.includes(status);

  const update: Record<string, unknown> = { status, updated_at: new Date() };
  if (willBeClosed) {
    update.resolution  = resolutionNote!.trim();
    update.resolved_at = new Date();
  }
  if (status === "closed") update.closed_at = new Date();

  await db`UPDATE support_tickets SET ${db(update)} WHERE id = ${id}`;

  // Email on resolve — extract notifyEmail from description meta suffix
  const emailResult: {
    attempted: boolean; to: string; sent: boolean; error?: string;
    env: { MAIL_USER_set: boolean; MAIL_PASS_set: boolean; MAIL_FROM_set: boolean };
  } = {
    attempted: false, to: "", sent: false,
    env: {
      MAIL_USER_set: !!process.env.MAIL_USER,
      MAIL_PASS_set: !!process.env.MAIL_PASS,
      MAIL_FROM_set: !!process.env.MAIL_FROM,
    },
  };

  if (status === "resolved") {
    try {
      const descStr = (ticket.description as string) ?? "";
      const metaMatch = descStr.match(/\[meta:([^\]]+)\]/);
      const meta = Object.fromEntries(
        (metaMatch?.[1] ?? "").split(",").map((p) => p.split("=") as [string, string]),
      );
      const notifyEmail = meta.notifyEmail ?? "";
      // Driver name is embedded in title: "Reason — DriverName"
      const driverName = ((ticket.title as string) ?? "").split(" — ")[1] ?? "driver";

      emailResult.to = notifyEmail;
      if (notifyEmail) {
        emailResult.attempted = true;
        const { subject, html } = renderResolvedEmail({
          ticketId: id, driverName,
          reason: (ticket.category as string) ?? "other",
          resolutionNote: resolutionNote!.trim(),
          resolvedByName: actorName,
        });
        const res = await sendMail({ to: notifyEmail, subject, html });
        emailResult.sent  = res.success;
        emailResult.error = res.success ? undefined : res.error;
      }
    } catch (err) {
      emailResult.error = err instanceof Error ? err.message : String(err);
    }
  }

  try {
    await writeAuditEvent({
      orgId: ticket.org_id as string, actorId, actorRole: actorRole as never,
      action: `support_ticket_${status}`, resourceType: "support_ticket", resourceId: id,
      payload: { from: prevStatus, to: status, ...(resolutionNote ? { resolutionNote: resolutionNote.trim() } : {}) },
    });
  } catch (err) {
    console.error("[support-tickets] audit log failed", err);
  }

  return NextResponse.json({ ok: true, id, emailResult });
}

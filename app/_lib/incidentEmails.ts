/**
 * Email templates for the incident SLA pipeline.
 *
 * Pure functions — they build subject + html. The actual delivery is done by
 * sendMail() in app/_lib/sendMail.ts. All templates wrap their body in the
 * shared FleetGuard layout (header + branded footer) via wrapEmail().
 */

import {
  wrapEmail,
  emailButton,
  emailInfoBox,
  emailKv,
  emailKvTable,
  escapeHtml,
} from "./emailLayout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const TYPE_LABEL: Record<string, string> = {
  fraud_attempt:         "Fraud attempt",
  fake_pod:              "Fake POD",
  face_mismatch:         "Face mismatch",
  unauthorized_entry:    "Unauthorized entry",
  vehicle_noncompliance: "Vehicle non-compliance",
  driver_noncompliance:  "Driver non-compliance",
  invoice_mismatch:      "Invoice mismatch",
  theft:                 "Theft",
  criminal_record:       "Criminal Record Flagged",
  identity_mismatch:     "Identity Mismatch",
  other:                 "Other",
};

export function humanType(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

interface IncidentCtx {
  id:               string;
  shortId:          string;            // last 8 chars of id, uppercased
  type:             string;
  severity:         string;
  description:      string;
  warehouseName:    string;
  raisedByName:     string;
  raisedAt:         Date;
  slaDeadline:      Date;
  slaMinutes:       number;
  managerLink:      string;            // /manager/incidents/{id}
  csoLink:          string;            // /cso/incidents/{id}
}

interface PartyCtx {
  name: string;
}

interface ResolutionCtx extends IncidentCtx {
  resolverName:     string;
  resolutionNote:   string;
  durationMinutes:  number;
  withinSla:        boolean;
}

function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

function fmtDeadline(d: Date): string {
  return d.toLocaleString("en-IN", { hour12: true, timeZone: "Asia/Kolkata" });
}

export function buildIncidentCtx(input: {
  id: string;
  type: string;
  severity: string;
  description: string;
  warehouseName: string;
  raisedByName: string;
  raisedAt: Date;
  slaDeadline: Date;
  slaMinutes: number;
}): IncidentCtx {
  return {
    ...input,
    shortId:     shortId(input.id),
    managerLink: `${APP_URL}/manager/incidents/${input.id}`,
    csoLink:     `${APP_URL}/cso/incidents/${input.id}`,
  };
}

// ── L0: assigned ─────────────────────────────────────────────────────────────
export function emailIncidentAssigned(ctx: IncidentCtx, to: PartyCtx): { subject: string; html: string } {
  const subject = `New incident at ${ctx.warehouseName} — ${humanType(ctx.type)}`;
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(to.name)},</p>
    <p style="margin:0 0 16px;">A new <strong>${escapeHtml(ctx.severity)}</strong> incident has been raised at <strong>${escapeHtml(ctx.warehouseName)}</strong> and assigned to you. Please review and resolve it.</p>
    ${emailInfoBox({
      tone: ctx.severity === "critical" ? "danger" : "warning",
      html: emailKvTable(
        emailKv("Type",            escapeHtml(humanType(ctx.type))) +
        emailKv("What happened",   escapeHtml(ctx.description)) +
        emailKv("Resolve by",      `${escapeHtml(fmtDeadline(ctx.slaDeadline))} (${ctx.slaMinutes} min from now)`) +
        emailKv("Reported by",     escapeHtml(ctx.raisedByName))
      ),
    })}
    ${emailButton({ href: ctx.managerLink, label: "Open incident" })}
    <p style="margin:16px 0 0;font-size:13px;color:#475569;">If this isn't resolved in time, you'll get a reminder halfway through. After the deadline, your Regional Manager will be notified, and the CSO team will be alerted if it still isn't resolved.</p>
  `;
  return {
    subject,
    html: wrapEmail({
      preheader: `Please resolve before ${fmtDeadline(ctx.slaDeadline)}.`,
      heading:   `New incident at ${ctx.warehouseName}`,
      body,
    }),
  };
}

// ── L1: reminder at 50% SLA ──────────────────────────────────────────────────
export function emailIncidentReminder(
  ctx: IncidentCtx,
  to: PartyCtx,
  minutesRemaining: number,
): { subject: string; html: string } {
  const subject = `Reminder — please resolve the ${humanType(ctx.type)} incident at ${ctx.warehouseName}`;
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(to.name)},</p>
    <p style="margin:0 0 16px;">Half the time to resolve this incident has passed and it is still open. Please act now to avoid escalation.</p>
    ${emailInfoBox({
      tone: "warning",
      title: `${minutesRemaining} minutes left`,
      html: `If this isn't resolved soon, your Regional Manager will be notified.`,
    })}
    ${emailButton({ href: ctx.managerLink, label: "Open and resolve" })}
  `;
  return {
    subject,
    html: wrapEmail({
      preheader: `${minutesRemaining} min left before this is escalated to your Regional Manager.`,
      heading:   "Reminder — incident still open",
      body,
    }),
  };
}

// ── L2: escalation to RM at 100% SLA ─────────────────────────────────────────
export function emailIncidentEscalatedRm(
  ctx: IncidentCtx,
  to: PartyCtx,
  fromManagerName: string,
  minutesOverdue: number,
  minutesToL3: number,
): { subject: string; html: string } {
  const subject = `Action needed — ${humanType(ctx.type)} incident at ${ctx.warehouseName} is overdue`;
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(to.name)},</p>
    <p style="margin:0 0 16px;">An incident at <strong>${escapeHtml(ctx.warehouseName)}</strong> has missed its resolution deadline. As Regional Manager, please take ownership and resolve it.</p>
    ${emailInfoBox({
      tone: "danger",
      title: `${minutesOverdue} minutes past the deadline`,
      html: emailKvTable(
        emailKv("Originally assigned to", escapeHtml(fromManagerName)) +
        emailKv("Type",                   escapeHtml(humanType(ctx.type))) +
        emailKv("Severity",               escapeHtml(ctx.severity)) +
        emailKv("What happened",          escapeHtml(ctx.description)) +
        emailKv("Was due",                escapeHtml(fmtDeadline(ctx.slaDeadline)))
      ),
    })}
    ${emailButton({ href: ctx.managerLink, label: "Take ownership" })}
    <p style="margin:16px 0 0;font-size:13px;color:#475569;">If this still isn't resolved in <strong>${minutesToL3} more minutes</strong>, the CSO team will be alerted.</p>
  `;
  return {
    subject,
    html: wrapEmail({
      preheader: `Past deadline. CSO team will be alerted in ${minutesToL3} min if not resolved.`,
      heading:   "Incident escalated to you",
      body,
    }),
  };
}

// ── L3: escalation to CSO team at 150% SLA ───────────────────────────────────
export function emailIncidentEscalatedCso(
  ctx: IncidentCtx,
  to: PartyCtx,
  lastAssignedName: string,
  minutesOverdue: number,
  orgName: string,
): { subject: string; html: string } {
  const subject = `Urgent — ${humanType(ctx.type)} incident at ${ctx.warehouseName} still unresolved`;
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(to.name)},</p>
    <p style="margin:0 0 16px;">A <strong>${escapeHtml(ctx.severity)}</strong> incident at <strong>${escapeHtml(ctx.warehouseName)}</strong> (${escapeHtml(orgName)}) is well past its deadline and was not resolved by the warehouse manager or the regional manager. Please step in and close it out.</p>
    ${emailInfoBox({
      tone: "danger",
      title: "Action required from the CSO team",
      html: emailKvTable(
        emailKv("Type",            escapeHtml(humanType(ctx.type))) +
        emailKv("What happened",   escapeHtml(ctx.description)) +
        emailKv("Time to resolve", `${ctx.slaMinutes} min — overdue by ${minutesOverdue} min`) +
        emailKv("Last handled by", escapeHtml(lastAssignedName))
      ),
    })}
    ${emailButton({ href: ctx.csoLink, label: "Open and resolve" })}
  `;
  return {
    subject,
    html: wrapEmail({
      preheader: `Well past deadline — please take action now.`,
      heading:   "Urgent: incident needs CSO action",
      body,
    }),
  };
}

// ── Resolution confirmation ──────────────────────────────────────────────────
export function emailIncidentResolved(
  ctx: ResolutionCtx,
  to: PartyCtx,
): { subject: string; html: string } {
  const dur = ctx.durationMinutes >= 60
    ? `${Math.floor(ctx.durationMinutes / 60)}h ${ctx.durationMinutes % 60}m`
    : `${ctx.durationMinutes}m`;
  const subject = `Resolved — ${humanType(ctx.type)} incident at ${ctx.warehouseName}`;
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(to.name)},</p>
    <p style="margin:0 0 16px;">The ${escapeHtml(humanType(ctx.type).toLowerCase())} incident at ${escapeHtml(ctx.warehouseName)} has been resolved by ${escapeHtml(ctx.resolverName)}.</p>
    ${emailInfoBox({
      tone: ctx.withinSla ? "success" : "warning",
      html: emailKvTable(
        emailKv("How it was resolved", escapeHtml(ctx.resolutionNote)) +
        emailKv("Time taken",          `${dur} ${ctx.withinSla ? "(within deadline)" : "(past deadline)"}`)
      ),
    })}
    ${emailButton({ href: ctx.managerLink, label: "View timeline" })}
  `;
  return {
    subject,
    html: wrapEmail({
      preheader: `Resolved by ${ctx.resolverName} in ${dur}.`,
      heading:   "Incident resolved",
      body,
    }),
  };
}

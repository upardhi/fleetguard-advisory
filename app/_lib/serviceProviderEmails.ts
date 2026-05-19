/**
 * Service-provider-related emails.
 *
 * Pure functions — they build subject + html. The actual delivery happens via
 * sendMail() in app/_lib/sendMail.ts. Bodies are wrapped in the shared
 * FleetGuard layout (header + branded footer) via wrapEmail().
 */

import {
  wrapEmail,
  emailButton,
  emailInfoBox,
  emailKv,
  emailKvTable,
  escapeHtml,
} from "./emailLayout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://fleetguard.fraudcheck.ai";

// ── Manager review notification (provider added at the gate by a guard) ──────

export interface ProviderAddedAtGateCtx {
  managerName:   string;
  warehouseName: string;
  addedByName:   string;
  addedByRole:   string;     // raw role string, e.g. "guard"
  providerName:  string;
  providerCode?: string | null;
  providerType?: string | null;
  contactName?:  string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  city?:         string | null;
  state?:        string | null;
  /** /manager/contractors review link */
  reviewUrl?:    string;
}

const ROLE_LABEL: Record<string, string> = {
  guard:            "gate guard",
  wh_manager:       "warehouse manager",
  regional_manager: "regional manager",
  cso:              "CSO",
  company_admin:    "company admin",
  superadmin:       "super admin",
  super_admin:      "super admin",
};

function actorLabel(role: string): string {
  return ROLE_LABEL[role] ?? role.replace(/_/g, " ");
}

export function emailProviderAddedAtGate(
  ctx: ProviderAddedAtGateCtx,
): { subject: string; html: string } {
  const reviewUrl = ctx.reviewUrl ?? `${APP_URL}/manager/contractors`;
  const subject   = `[FleetGuard] New service provider added at gate: ${ctx.providerName}`;

  const contactValue =
    ctx.contactName || ctx.contactPhone
      ? `${escapeHtml(ctx.contactName ?? "")}${ctx.contactName && ctx.contactPhone ? " · " : ""}${escapeHtml(ctx.contactPhone ?? "")}`
      : `<em style="color:#94a3b8;">Not provided — please fill in</em>`;

  const rows =
    emailKv("Provider", `<strong>${escapeHtml(ctx.providerName)}</strong>`) +
    (ctx.providerCode ? emailKv("Code", escapeHtml(ctx.providerCode)) : "") +
    (ctx.providerType ? emailKv("Type", escapeHtml(ctx.providerType)) : "") +
    emailKv("Contact", contactValue) +
    (ctx.contactEmail ? emailKv("Email", escapeHtml(ctx.contactEmail)) : "") +
    (ctx.city ? emailKv("City", `${escapeHtml(ctx.city)}${ctx.state ? `, ${escapeHtml(ctx.state)}` : ""}`) : "");

  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(ctx.managerName)},</p>
    <p style="margin:0 0 16px;">
      <strong>${escapeHtml(ctx.addedByName)}</strong> (${escapeHtml(actorLabel(ctx.addedByRole))})
      added a new service provider at <strong>${escapeHtml(ctx.warehouseName)}</strong> while
      processing a truck entry. Please review and complete the provider record.
    </p>
    ${emailInfoBox({
      tone: "info",
      title: "Provider details",
      html: emailKvTable(rows),
    })}
    ${emailButton({ href: reviewUrl, label: "Review in manager portal" })}
    <p style="margin:16px 0 0;font-size:13px;color:#475569;">
      Only the provider name was captured at the gate. Open the provider record to fill in contact
      details, type, and approve.
    </p>
  `;

  return {
    subject,
    html: wrapEmail({
      preheader: `${ctx.addedByName} added "${ctx.providerName}" at ${ctx.warehouseName} — review needed.`,
      heading:   "New service provider — review needed",
      body,
    }),
  };
}

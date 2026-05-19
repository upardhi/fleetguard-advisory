/**
 * Shared email layout for all FleetGuard outgoing mail.
 *
 * Templates pass dynamic body HTML to `wrapEmail()` and get back a fully
 * branded message (header bar + content + footer). Components below
 * (`emailButton`, `emailDivider`, `emailInfoBox`, `emailKv`) are inline-styled
 * snippets templates can splice into the body.
 *
 * Inline CSS is the only safe option for email — most clients (Gmail web,
 * Outlook desktop) strip <style> blocks or scope them. The single <style>
 * block we ship is for the `@media` mobile rule, which most clients honor.
 *
 * Brand info is env-configurable so each deploy can point to its own domain
 * without editing this file:
 *   - NEXT_PUBLIC_APP_URL          — e.g. https://fleetguard.fraudcheck.ai
 *   - NEXT_PUBLIC_BRAND_WEBSITE    — e.g. https://fleetguard.fraudcheck.ai
 *   - NEXT_PUBLIC_BRAND_SUPPORT    — e.g. support@fleetguard.fraudcheck.ai
 */

const BRAND_NAME    = "FleetGuard";
const BRAND_WEBSITE = process.env.NEXT_PUBLIC_BRAND_WEBSITE ?? "https://fleetguard.fraudcheck.ai";
const BRAND_SUPPORT = process.env.NEXT_PUBLIC_BRAND_SUPPORT ?? "contact@fraudcheck.ai";
const BRAND_LOGO    = process.env.NEXT_PUBLIC_BRAND_LOGO    ?? "https://fleetguard.fraudcheck.ai/fleetguard-logo-dark.png";

// Brand palette — keep in sync with app/globals.css @theme tokens.
const COLORS = {
  brand:        "#0f2347",   // deep navy
  brandSoft:    "#1e3a72",
  accent:       "#f59e0b",   // amber
  text:         "#0f172a",   // slate-900
  textMuted:    "#475569",   // slate-600
  textFaint:    "#94a3b8",   // slate-400
  border:       "#e2e8f0",   // slate-200
  surface:      "#f8fafc",   // slate-50 (page background)
  surfaceCard:  "#ffffff",
  infoBg:       "#eff6ff",   // blue-50
  infoBorder:   "#bfdbfe",   // blue-200
  warnBg:       "#fffbeb",   // amber-50
  warnBorder:   "#fde68a",   // amber-200
  dangerBg:     "#fef2f2",   // red-50
  dangerBorder: "#fecaca",   // red-200
  successBg:    "#f0fdf4",   // green-50
  successBorder:"#bbf7d0",   // green-200
};

export function escapeHtml(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Components ────────────────────────────────────────────────────────────────

/** Primary CTA button. Uses table-based markup for Outlook compatibility. */
export function emailButton(opts: { href: string; label: string }): string {
  const { href, label } = opts;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
      <tr>
        <td bgcolor="${COLORS.brand}" style="border-radius:6px;">
          <a href="${escapeHtml(href)}"
             style="display:inline-block;padding:12px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/** Horizontal rule. */
export function emailDivider(): string {
  return `<hr style="border:none;border-top:1px solid ${COLORS.border};margin:24px 0;" />`;
}

export type InfoBoxTone = "info" | "warning" | "danger" | "success";

/** Tinted callout box for highlighted alert/incident details. */
export function emailInfoBox(opts: { tone?: InfoBoxTone; title?: string; html: string }): string {
  const tone = opts.tone ?? "info";
  const bg     = tone === "warning" ? COLORS.warnBg     : tone === "danger" ? COLORS.dangerBg     : tone === "success" ? COLORS.successBg     : COLORS.infoBg;
  const border = tone === "warning" ? COLORS.warnBorder : tone === "danger" ? COLORS.dangerBorder : tone === "success" ? COLORS.successBorder : COLORS.infoBorder;
  return `
    <div style="background:${bg};border:1px solid ${border};border-radius:6px;padding:16px 18px;margin:16px 0;font-size:14px;line-height:1.5;color:${COLORS.text};">
      ${opts.title ? `<div style="font-weight:600;margin-bottom:6px;">${escapeHtml(opts.title)}</div>` : ""}
      ${opts.html}
    </div>`;
}

/** Definition-list pair rendered as a single row. Use inside a kv-table. */
export function emailKv(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:6px 0;color:${COLORS.textMuted};width:160px;font-size:13px;">${escapeHtml(label)}</td>
      <td style="padding:6px 0;color:${COLORS.text};font-size:13px;">${value}</td>
    </tr>`;
}

/** Wraps emailKv() rows in a table. */
export function emailKvTable(rowsHtml: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:12px 0;">
      ${rowsHtml}
    </table>`;
}

// ── Layout wrapper ────────────────────────────────────────────────────────────

export interface EmailLayoutOpts {
  /** Visible-in-inbox preview line. Hidden in the body. */
  preheader?: string;
  /** Optional H1 inside the body. Templates can also render their own. */
  heading?:   string;
  /** Pre-rendered HTML for the message body. */
  body:       string;
  /** Override footer disclaimer line. Default: "Automated message — please don't reply." */
  footerNote?: string;
}

/**
 * Produce a fully branded HTML email (header + body + footer).
 *
 * Mobile: the `@media` rule below stacks the container to full width and
 * tightens padding under 600px. Most clients honor it; older Outlook keeps
 * the desktop layout, which is fine.
 */
export function wrapEmail(opts: EmailLayoutOpts): string {
  const { preheader, heading, body, footerNote } = opts;
  const disclaimer =
    footerNote ??
    "Automated message — please don't reply directly. For help, contact our support team.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(BRAND_NAME)}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .fg-container { width: 100% !important; padding: 16px !important; }
      .fg-card      { padding: 20px !important; }
      .fg-h1        { font-size: 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${COLORS.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${COLORS.text};">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${COLORS.surface};opacity:0;">${escapeHtml(preheader)}</div>` : ""}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.surface};">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" class="fg-container" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:${COLORS.surfaceCard};border:1px solid ${COLORS.border};border-bottom:none;border-radius:8px 8px 0 0;padding:18px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align:middle;">
                    <a href="${escapeHtml(BRAND_WEBSITE)}" style="text-decoration:none;display:inline-block;line-height:0;">
                      <img src="${escapeHtml(BRAND_LOGO)}" alt="${escapeHtml(BRAND_NAME)}" height="32" style="display:block;height:32px;width:auto;border:0;outline:none;text-decoration:none;" />
                    </a>
                  </td>
                  <td align="right" style="font-size:11px;color:${COLORS.textFaint};vertical-align:middle;">
                    Fleet security · Gate operations
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body card -->
          <tr>
            <td class="fg-card" style="background:${COLORS.surfaceCard};border:1px solid ${COLORS.border};border-top:none;border-bottom:none;padding:28px;font-size:14px;line-height:1.6;color:${COLORS.text};">
              ${heading ? `<h1 class="fg-h1" style="margin:0 0 16px;font-size:20px;font-weight:600;color:${COLORS.brand};letter-spacing:-0.3px;">${escapeHtml(heading)}</h1>` : ""}
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${COLORS.surfaceCard};border:1px solid ${COLORS.border};border-top:none;border-radius:0 0 8px 8px;padding:20px 28px;font-size:12px;line-height:1.5;color:${COLORS.textMuted};">
              <div style="margin-bottom:10px;color:${COLORS.text};font-weight:600;">${escapeHtml(BRAND_NAME)}</div>
              <div style="margin-bottom:4px;">
                <a href="mailto:${escapeHtml(BRAND_SUPPORT)}" style="color:${COLORS.brand};text-decoration:none;">${escapeHtml(BRAND_SUPPORT)}</a>
                &nbsp;·&nbsp;
                <a href="${escapeHtml(BRAND_WEBSITE)}" style="color:${COLORS.brand};text-decoration:none;">${escapeHtml(BRAND_WEBSITE.replace(/^https?:\/\//, ""))}</a>
              </div>
              <div style="color:${COLORS.textFaint};font-size:11px;margin-top:10px;">${escapeHtml(disclaimer)}</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

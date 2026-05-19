/**
 * User account emails — onboarding (new account) and reset reminder.
 *
 * Pure functions — they build subject + html. Both wrap their body in the
 * shared FleetGuard layout.
 */

import {
  wrapEmail,
  emailButton,
  emailInfoBox,
  escapeHtml,
} from "./emailLayout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://fleetguard.fraudcheck.ai";

// ── User onboarding (new account) ────────────────────────────────────────────

export interface UserOnboardingCtx {
  name:         string;
  companyName:  string;
  email:        string;
  tempPassword: string;
  loginUrl?:    string;       // defaults to ${APP_URL}/login
}

export function emailUserOnboarding(ctx: UserOnboardingCtx): { subject: string; html: string } {
  const loginUrl = ctx.loginUrl ?? `${APP_URL}/login`;
  const subject  = "Your FleetGuard Login Details";

  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(ctx.name)},</p>
    <p style="margin:0 0 12px;">Welcome to FleetGuard!</p>
    <p style="margin:0 0 16px;">Your account has been created under <strong>${escapeHtml(ctx.companyName)}</strong>. Below are your login details:</p>
    ${emailInfoBox({
      tone: "info",
      html: `
        <div style="margin-bottom:8px;">
          <span style="color:#475569;">Username:</span>
          <span style="font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-weight:600;color:#0f172a;">${escapeHtml(ctx.email)}</span>
        </div>
        <div>
          <span style="color:#475569;">Temporary Password:</span>
          <span style="font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-weight:600;color:#0f172a;background:#fff;padding:2px 8px;border:1px solid #bfdbfe;border-radius:4px;display:inline-block;">${escapeHtml(ctx.tempPassword)}</span>
        </div>`,
    })}
    ${emailButton({ href: loginUrl, label: "Login to FleetGuard" })}
    <p style="margin:16px 0 0;font-size:13px;color:#475569;">
      For security reasons, you'll be required to change your password after your first login.
    </p>
    <p style="margin:12px 0 0;font-size:13px;color:#475569;">
      If you did not expect this account, please contact your administrator.
    </p>
  `;

  return {
    subject,
    html: wrapEmail({
      preheader: `Login: ${ctx.email} · Temporary password inside.`,
      heading:   "Your FleetGuard account is ready",
      body,
    }),
  };
}


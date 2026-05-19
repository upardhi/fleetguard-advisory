/**
 * POST /api/auth/forgot-password
 *
 * Self-service password reset. Issues a single-use, short-lived reset token
 * and emails a link to /reset-password/<token>. Always returns the same
 * generic response regardless of input — this avoids leaking whether a
 * given email is on file or what role it holds.
 *
 *   • not found        → no email sent, generic OK
 *   • inactive account → no email sent, generic OK
 *   • eligible         → token row inserted in password_reset_tokens, email sent
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/app/_server/db/client";
import { uuidv7 } from "@/app/_server/db/uuidv7";
import { applySecurityHeaders } from "@/app/_server/security/headers";
import { sendMail } from "@/app/_lib/sendMail";

const RATE_LIMIT_MAX     = 5;
const RATE_LIMIT_WINDOW  = 60 * 60 * 1000;       // 1 hour
const TOKEN_TTL_MS       = 30 * 60 * 1000;       // 30 minutes
const TOKEN_BYTES        = 32;                    // 64 hex chars

const ATTEMPTS = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW;
  const recent = (ATTEMPTS.get(ip) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  ATTEMPTS.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function genericResponse() {
  return applySecurityHeaders(NextResponse.json({
    ok: true,
    message: "If your account is eligible, a password reset email has been sent.",
  }));
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return applySecurityHeaders(
      NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 }),
    );
  }

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return applySecurityHeaders(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return applySecurityHeaders(
      NextResponse.json({ error: "A valid email address is required" }, { status: 400 }),
    );
  }

  try {
    const [user] = await db`
      SELECT id, email, full_name, role, is_active
      FROM   users
      WHERE  email = ${email}
      LIMIT  1
    `;

    if (!user || user.is_active === false) {
      return genericResponse();
    }

    const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await db`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
      VALUES (${uuidv7()}, ${user.id}, ${tokenHash}, ${expiresAt})
    `;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password/${token}`;

    const smtpReady = Boolean(process.env.MAIL_USER && process.env.MAIL_PASS);
    if (smtpReady) {
      const { wrapEmail, emailButton, escapeHtml } = await import("@/app/_lib/emailLayout");
      const result = await sendMail({
        to: user.email as string,
        subject: "FleetGuard — Reset your password",
        html: wrapEmail({
          preheader: "Reset your FleetGuard password. Link expires in 30 minutes.",
          heading:   "Reset your password",
          body: `
            <p style="margin:0 0 12px;">Hi ${escapeHtml((user.full_name as string) ?? "")},</p>
            <p style="margin:0 0 16px;">You requested a password reset for your FleetGuard account. Click the button below to set a new password.</p>
            ${emailButton({ href: resetUrl, label: "Set a new password" })}
            <p style="margin:16px 0 0;font-size:13px;color:#475569;">This link expires in <strong>30 minutes</strong> and can only be used once. If you didn't request this, you can safely ignore this email.</p>
          `,
        }),
      });
      if (!result.success) {
        // Email send failed — log the link so the flow is still completable in dev.
        console.info(`[forgot-password] mail failed; reset link for ${user.email}: ${resetUrl}`);
      }
    } else {
      console.info(`[forgot-password] SMTP not configured; reset link for ${user.email}: ${resetUrl}`);
    }

    return genericResponse();
  } catch (err: unknown) {
    console.error("forgot-password error:", err);
    return genericResponse();
  }
}

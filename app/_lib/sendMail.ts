/**
 * FleetGuard — outbound email helper (server-only)
 *
 * Uses Brevo (Sendinblue) SMTP via nodemailer. Import only from API routes.
 *
 * Required env vars in .env.local:
 *   MAIL_HOST   default: smtp-relay.brevo.com
 *   MAIL_PORT   default: 587
 *   MAIL_USER   the Brevo SMTP login (e.g. 984e92001@smtp-brevo.com)
 *   MAIL_PASS   the Brevo SMTP key
 *   MAIL_FROM   sender address (e.g. "FleetGuard <support@fraudcheck.ai>")
 */

import nodemailer from "nodemailer";

const port = Number(process.env.MAIL_PORT ?? 465);

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST ?? "smtp.hostinger.com",
  port,
  // 465 = implicit TLS (SMTPS); 587 = STARTTLS upgrade after plaintext handshake.
  secure: port === 465,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendMail({ to, subject, html, from }: MailOptions) {
  const mailOptions = {
    from: from || process.env.MAIL_FROM || "FleetGuard <support@fraudcheck.ai>",
    to,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true as const };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Mail send failed", error);
    return { success: false as const, error: message };
  }
}

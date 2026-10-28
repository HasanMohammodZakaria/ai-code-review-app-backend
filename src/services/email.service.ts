import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  rawToken: string,
) {
  const link = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;

  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: "Reset your password",
    text: `Hi ${fullName},\n\nUse this link to reset your password (valid for 15 minutes):\n${link}\n\nIf you did not request this, ignore this email.`,
    html: `
      <p>Hi ${escapeHtml(fullName)},</p>
      <p>Use the button below to reset your password. The link is valid for 15 minutes.</p>
      <p><a href="${link}">Reset password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}

// Prevents HTML injection through the user's name
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

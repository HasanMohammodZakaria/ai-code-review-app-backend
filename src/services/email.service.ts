import nodemailer from "nodemailer";
import { env } from "../config/env";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER_NAME = "AI Code Reviewer";
const REQUEST_TIMEOUT_MS = 15_000;

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function buildResetEmail(fullName: string, link: string): EmailContent {
  return {
    subject: "Reset your password",
    text: `Hi ${fullName},\n\nUse this link to reset your password (valid for 15 minutes):\n${link}\n\nIf you did not request this, ignore this email.`,
    html: `
      <p>Hi ${escapeHtml(fullName)},</p>
      <p>Use the button below to reset your password. The link is valid for 15 minutes.</p>
      <p><a href="${link}">Reset password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  };
}

// EMAIL_FROM can be "name@example.com" or "Name <name@example.com>"
function parseSender(value: string): { name: string; email: string } {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    return {
      name: match[1].trim() || DEFAULT_SENDER_NAME,
      email: match[2].trim(),
    };
  }
  return { name: DEFAULT_SENDER_NAME, email: value.trim() };
}

// HTTPS API: works where outbound SMTP ports are blocked (Render free plan)
async function sendWithBrevo(
  apiKey: string,
  to: string,
  toName: string,
  content: EmailContent,
) {
  const response = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: parseSender(env.EMAIL_FROM),
      to: [{ email: to, name: toName }],
      subject: content.subject,
      htmlContent: content.html,
      textContent: content.text,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Short snippet of Brevo's message (never the API key) for the server log
    const body = await response.text().catch(() => "");
    throw new Error(
      `Brevo API HTTP ${response.status}: ${body.slice(0, 200).replace(/\s+/g, " ")}`,
    );
  }
}

// Plain SMTP, created only when it is needed (for example Mailtrap locally)
let smtpTransporter: ReturnType<typeof nodemailer.createTransport> | undefined;

function getSmtpTransporter() {
  smtpTransporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return smtpTransporter;
}

export async function sendPasswordResetEmail(
  to: string,
  fullName: string,
  rawToken: string,
) {
  const link = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;
  const content = buildResetEmail(fullName, link);

  if (env.BREVO_API_KEY) {
    await sendWithBrevo(env.BREVO_API_KEY, to, fullName, content);
    return;
  }

  await getSmtpTransporter().sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
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

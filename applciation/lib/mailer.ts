import nodemailer, { type Transporter } from "nodemailer";
import { ApiError } from "@/lib/api/errors";

let transport: Transporter | null = null;

/**
 * SMTP transport. For Gmail use an App Password (Google Account > Security > 2-Step Verification > App passwords):
 *   SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=you@gmail.com SMTP_PASS=<16-char app password> SMTP_FROM="Placement Cell <you@gmail.com>"
 * SMTP_DRY_RUN=true builds messages without sending (development and tests).
 */
export function mailer(): Transporter {
  if (transport) return transport;
  if (process.env.SMTP_DRY_RUN === "true") return (transport = nodemailer.createTransport({ jsonTransport: true }));
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS");
  const port = Number(process.env.SMTP_PORT ?? 465);
  return (transport = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS.replace(/\s+/g, "") }, pool: true, maxConnections: 3 }));
}

export const fromAddress = () => process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "placement@localhost";

export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { escapeHtml, fromAddress, mailer } from "@/lib/mailer";

export type EmailInput = {
  recipients: { email: string; studentId?: string; name?: string }[]; subject: string; body: string; purpose: string; approvalRequestId?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};
export const fill = (text: string, name?: string) => text.replace(/\{\{\s*name\s*\}\}/gi, name ?? "there");
const MAX_RECIPIENTS = 500;
const OPTIONAL: Record<string, "emailAnnouncements" | "emailReminders"> = { announcement: "emailAnnouncements", jobAlert: "emailAnnouncements", "drive.reminder": "emailReminders", "psychometrics.reminder": "emailReminders" };

/** Sends one email per recipient (no shared To line, so addresses are never exposed) and records every attempt. */
export async function sendBulkEmail(s: { collegeId: string; userId: string | null }, input: EmailInput) {
  const seen = new Set<string>();
  // Optional kinds of email respect each student's own choice; account, offer and block emails always go out.
  const optOut = OPTIONAL[input.purpose] ? new Set((await db.student.findMany({ where: { id: { in: input.recipients.flatMap((r) => (r.studentId ? [r.studentId] : [])) }, [OPTIONAL[input.purpose]]: false }, select: { id: true } })).map((x) => x.id)) : new Set<string>();
  const recipients = input.recipients.filter((r) => !(r.studentId && optOut.has(r.studentId))).filter((r) => { const k = r.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  if (!input.recipients.length) throw badRequest("There are no recipients");
  if (!recipients.length) return { sent: 0, failed: [] as { email: string; reason?: string }[] }; // everyone opted out of this kind of email
  if (recipients.length > MAX_RECIPIENTS) throw badRequest(`At most ${MAX_RECIPIENTS} recipients per send`);
  const subject = input.subject.replace(/[\r\n]+/g, " ").trim();
  const t = mailer();

  const log: { email: string; studentId?: string; ok: boolean; error?: string }[] = [];
  for (let i = 0; i < recipients.length; i += 3) {
    await Promise.all(recipients.slice(i, i + 3).map(async (r) => {
      try {
        const text = fill(input.body, r.name);
        await t.sendMail({ from: fromAddress(), to: r.email, subject: fill(subject, r.name), text, html: `<div style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(text)}</div>`, attachments: input.attachments });
        log.push({ email: r.email, studentId: r.studentId, ok: true });
      } catch (e) {
        log.push({ email: r.email, studentId: r.studentId, ok: false, error: (e as Error).message.slice(0, 300) });
      }
    }));
  }
  await db.messageLog.createMany({
    data: log.map((l) => ({ collegeId: s.collegeId, purpose: input.purpose, subject, recipientEmail: l.email, studentId: l.studentId, status: l.ok ? "SENT" as const : "FAILED" as const, error: l.error, sentById: s.userId, approvalRequestId: input.approvalRequestId })),
  });
  const failed = log.filter((l) => !l.ok);
  await audit(s, { action: "email.send", entity: "MessageLog", after: { purpose: input.purpose, sent: log.length - failed.length, failed: failed.length } });
  return { sent: log.length - failed.length, failed: failed.map((f) => ({ email: f.email, reason: f.error })) };
}

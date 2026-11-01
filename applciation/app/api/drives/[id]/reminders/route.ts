import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { evaluateEligibility } from "@/lib/eligibility";
import { getDrive } from "@/lib/drives";
import { gate } from "@/lib/approvals";
import { mailer } from "@/lib/mailer";
import { sendBulkEmail } from "@/lib/ops/email";

const body = z.object({ subject: z.string().trim().min(3).max(200).optional(), message: z.string().trim().min(3).max(5000).optional() });

/** Emails eligible students who have not applied yet. */
export const POST = route<{ id: string }>({ limit: { name: "email", max: 10, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const { subject, message } = await parseBody(req, body.default({}));
  mailer(); // fail early with a clear error if email is not configured
  const drive = await getDrive(s.collegeId, id);
  if (drive.status !== "PUBLISHED") throw new ApiError(409, "CONFLICT", "Reminders can only be sent for published drives");
  if (drive.applicationDeadline <= new Date()) throw new ApiError(409, "DEADLINE_PASSED", "The application deadline has passed");

  const company = await db.company.findUniqueOrThrow({ where: { id: drive.companyId }, select: { name: true } });
  const applied = new Set((await db.application.findMany({ where: { driveId: id }, select: { studentId: true } })).map((a) => a.studentId));
  const pending = (await evaluateEligibility(drive)).filter((r) => r.eligible && !applied.has(r.studentId));
  if (!pending.length) throw badRequest("Every eligible student has already applied");
  const emails = await db.student.findMany({ where: { id: { in: pending.map((p) => p.studentId) } }, select: { id: true, email: true } });

  const deadline = drive.applicationDeadline.toUTCString();
  const input = {
    purpose: "drive.reminder",
    subject: subject ?? `Reminder: apply to ${company.name} (${drive.role}) by ${drive.applicationDeadline.toISOString().slice(0, 10)}`,
    body: message ?? `You are eligible for the ${company.name} drive for ${drive.role}, but have not applied yet.\n\nApplication deadline: ${deadline}\n\nPlease log in to the placement portal to apply.`,
    recipients: emails.map((e) => ({ email: e.email, studentId: e.id })),
  };
  return gate(s, "BULK_EMAIL", `Email ${input.recipients.length} students a reminder for "${drive.role}" at ${company.name}`, { input }, () => sendBulkEmail(s, input));
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { gate } from "@/lib/approvals";
import { mailer } from "@/lib/mailer";
import { sendBulkEmail } from "@/lib/ops/email";

const body = z.object({
  templateId: z.uuid().optional(),
  subject: z.string().trim().min(3).max(200).optional(), message: z.string().trim().min(3).max(10_000).optional(),
  studentIds: z.array(z.uuid()).max(500).optional(), departmentId: z.uuid().optional(), batchId: z.uuid().optional(),
}).refine((v) => v.studentIds?.length || v.departmentId || v.batchId, { message: "Choose students, a department or a batch" })
  .refine((v) => v.templateId || (v.subject && v.message), { message: "Give a templateId, or both subject and message" });

/** Announcements and notices to selected students or a group. */
export const POST = route({ limit: { name: "email", max: 10, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s) => {
  const b = await parseBody(req, body);
  mailer();
  const tpl = b.templateId ? await db.messageTemplate.findFirst({ where: { id: b.templateId, collegeId: s.collegeId } }) : null;
  if (b.templateId && !tpl) throw badRequest("Template not found");
  const subject = b.subject ?? tpl!.subject, message = b.message ?? tpl!.body;
  const students = await db.student.findMany({
    where: { collegeId: s.collegeId, isActive: true, isArchived: false, ...(b.studentIds?.length ? { id: { in: b.studentIds } } : { departmentId: b.departmentId, batchId: b.batchId }) },
    select: { id: true, email: true, name: true }, take: 501,
  });
  if (!students.length) throw badRequest("No matching students");
  if (students.length > 500) throw badRequest("That group has more than 500 students; narrow it down");
  const input = { purpose: "announcement", subject, body: message, recipients: students.map((st) => ({ email: st.email, studentId: st.id, name: st.name })) };
  return gate(s, "BULK_EMAIL", `Email ${students.length} students: "${subject}"`, { input }, () => sendBulkEmail(s, input));
});

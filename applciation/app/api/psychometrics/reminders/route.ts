import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { gate } from "@/lib/approvals";
import { mailer } from "@/lib/mailer";
import { sendBulkEmail } from "@/lib/ops/email";

const body = z.object({ departmentId: z.uuid().optional(), batchId: z.uuid().optional(), studentIds: z.array(z.uuid()).max(500).optional() });

/** Emails students who have not completed the assessment yet. */
export const POST = route({ limit: { name: "email", max: 5, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "PSYCHOMETRICS" }, async (req, s) => {
  const b = await parseBody(req, body.default({}));
  mailer();
  const pending = await db.student.findMany({
    where: { collegeId: s.collegeId, isActive: true, isArchived: false, participationStatus: "REGISTERED", psychAttempt: null, departmentId: b.departmentId, batchId: b.batchId, ...(b.studentIds?.length ? { id: { in: b.studentIds } } : {}) },
    select: { id: true, email: true, name: true }, take: 501,
  });
  if (!pending.length) throw badRequest("Everyone in that group has completed the assessment");
  if (pending.length > 500) throw badRequest("More than 500 students are pending; narrow the group");
  const input = {
    purpose: "psychometrics.reminder", subject: "Please complete your personality and aptitude assessment",
    body: "Hello {{name}},\n\nYour personality and aptitude assessment is still pending. It takes about 15 minutes and helps us guide you better. It is never used to shortlist or reject you.\n\nPlease log in to the placement portal to complete it.",
    recipients: pending.map((p) => ({ email: p.email, studentId: p.id, name: p.name })),
  };
  return gate(s, "BULK_EMAIL", `Email ${pending.length} students a reminder to complete the assessment`, { input }, () => sendBulkEmail(s, input));
});

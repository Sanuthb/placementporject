import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const query = z.object({ reason: z.string().trim().min(5, "State why you need this student's result").max(300) });

/** Individual results are for the student. Staff access is limited to TPO admins, needs a stated reason, and is logged and visible in the audit log. */
export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN"], module: "PSYCHOMETRICS" }, async (req, s, { id }) => {
  const { reason } = parseQuery(req, query);
  const st = await db.student.findFirst({ where: { id, collegeId: s.collegeId }, select: { psychShareWithStaff: true } });
  if (!st) throw notFound("Student not found");
  if (!st.psychShareWithStaff) throw new ApiError(403, "NOT_SHARED", "This student has not chosen to share their individual result with the placement office");
  const a = await db.psychAttempt.findFirst({ where: { studentId: id, collegeId: s.collegeId }, select: { scores: true, completedAt: true, instrumentVersion: true } });
  if (!a) throw notFound("No result for this student");
  await db.$transaction(async (tx) => {
    await tx.psychAccessLog.create({ data: { collegeId: s.collegeId, actorId: s.userId, studentId: id, reason } });
    await audit(s, { action: "psychometrics.view", entity: "Student", entityId: id, reason }, tx);
  });
  return a;
});

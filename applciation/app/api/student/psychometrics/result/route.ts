import { studentRoute } from "@/lib/api/studentHandler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = studentRoute({ module: "PSYCHOMETRICS" }, async (_req, me) => {
  const a = await db.psychAttempt.findFirst({ where: { studentId: me.studentId, isCurrent: true } });
  if (!a) throw notFound("You have not taken the assessment yet");
  return { completedAt: a.completedAt, instrumentVersion: a.instrumentVersion, scores: a.scores };
});

/** Delete my answers and results. Consent stays as it was; the test can be taken again. */
export const DELETE = studentRoute({ module: "PSYCHOMETRICS" }, async (_req, me) => {
  const r = await db.psychAttempt.deleteMany({ where: { studentId: me.studentId } });
  if (r.count === 0) throw notFound("You have no results to delete");
  await audit({ collegeId: me.collegeId, userId: null }, { action: "psychometrics.delete", entity: "Student", entityId: me.studentId });
  return { deleted: true };
});

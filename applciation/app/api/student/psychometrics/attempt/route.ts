import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { INSTRUMENT_VERSION, RETAKE_AFTER_DAYS, answersSchema, scoreAttempt } from "@/lib/psychometrics";

/** Submit all answers. Needs my consent first. A second attempt replaces the first, but only after the waiting period. Results never affect eligibility, blocking or shortlisting. */
export const POST = studentRoute({ limit: { name: "psych", max: 10, windowSec: 3600 }, module: "PSYCHOMETRICS" }, async (req, me) => {
  const answers = await parseBody(req, answersSchema);
  const [st, prev] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { psychConsentAt: true } }),
    db.psychAttempt.findUnique({ where: { studentId: me.studentId }, select: { completedAt: true } }),
  ]);
  if (!st.psychConsentAt) throw new ApiError(409, "CONSENT_REQUIRED", "Give your consent before taking the assessment");
  if (prev && prev.completedAt.getTime() + RETAKE_AFTER_DAYS * 86_400_000 > Date.now()) throw new ApiError(409, "CONFLICT", `You can retake the assessment ${RETAKE_AFTER_DAYS} days after your last attempt`);
  const scores = scoreAttempt(answers);
  const data = { instrumentVersion: INSTRUMENT_VERSION, answers, scores, completedAt: new Date() };
  await db.$transaction(async (tx) => {
    await tx.psychAttempt.upsert({ where: { studentId: me.studentId }, update: data, create: { collegeId: me.collegeId, studentId: me.studentId, ...data } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "psychometrics.complete", entity: "Student", entityId: me.studentId }, tx);
  });
  return scores;
});

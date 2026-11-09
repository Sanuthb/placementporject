import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { INSTRUMENT_VERSION, answersSchema, scoreAttempt } from "@/lib/psychometrics";
import { retakeDecision } from "@/lib/reassessment";
import { ruleOf } from "@/lib/reassessmentRules";

/**
 * Submit all answers. Needs my consent first. A retake is allowed when the college's personality rule allows it (by default every 180 days);
 * the earlier attempt is kept as history and the new one becomes current. Results never affect eligibility, blocking or shortlisting.
 */
export const POST = studentRoute({ limit: { name: "psych", max: 10, windowSec: 3600 }, module: "PSYCHOMETRICS" }, async (req, me) => {
  const answers = await parseBody(req, answersSchema);
  const [st, past, rule] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { psychConsentAt: true } }),
    db.psychAttempt.findMany({ where: { studentId: me.studentId }, select: { completedAt: true }, orderBy: { completedAt: "asc" } }),
    ruleOf(me.collegeId, "PERSONALITY"),
  ]);
  if (!st.psychConsentAt) throw new ApiError(409, "CONSENT_REQUIRED", "Give your consent before taking the assessment");
  const d = retakeDecision({ rule, attempts: past.map((p, i) => ({ attemptNumber: i + 1, status: "SUBMITTED", submittedAt: p.completedAt })) });
  if (d.kind === "refuse") throw new ApiError(409, "CONFLICT", d.message);
  const scores = scoreAttempt(answers);
  await db.$transaction(async (tx) => {
    await tx.psychAttempt.updateMany({ where: { studentId: me.studentId, isCurrent: true }, data: { isCurrent: false } });
    await tx.psychAttempt.create({ data: { collegeId: me.collegeId, studentId: me.studentId, instrumentVersion: INSTRUMENT_VERSION, answers, scores, completedAt: new Date(), isCurrent: true } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "psychometrics.complete", entity: "Student", entityId: me.studentId, after: { attempt: past.length + 1 } }, tx);
  });
  return scores;
});

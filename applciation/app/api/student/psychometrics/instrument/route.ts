import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { instrumentForStudent } from "@/lib/psychometrics";
import { retakeDecision } from "@/lib/reassessment";
import { ruleOf } from "@/lib/reassessmentRules";

export const GET = studentRoute({ module: "PSYCHOMETRICS" }, async (_req, me) => {
  const [past, st, rule] = await Promise.all([
    db.psychAttempt.findMany({ where: { studentId: me.studentId }, select: { completedAt: true }, orderBy: { completedAt: "asc" } }),
    db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { psychConsentAt: true, psychShareWithStaff: true } }),
    ruleOf(me.collegeId, "PERSONALITY"),
  ]);
  const d = past.length ? retakeDecision({ rule, attempts: past.map((p, i) => ({ attemptNumber: i + 1, status: "SUBMITTED", submittedAt: p.completedAt })) }) : null;
  return {
    completed: past.length > 0, attempts: past.length, consentAt: st.psychConsentAt, sharedWithStaff: st.psychShareWithStaff,
    canRetake: d?.kind === "start", retakeAt: d?.kind === "refuse" ? d.nextAt ?? null : null, retakeBlockedReason: d?.kind === "refuse" ? d.message : null,
    ...instrumentForStudent(),
  };
});

import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { RETAKE_AFTER_DAYS, instrumentForStudent } from "@/lib/psychometrics";

export const GET = studentRoute({ module: "PSYCHOMETRICS" }, async (_req, me) => {
  const [attempt, st] = await Promise.all([
    db.psychAttempt.findUnique({ where: { studentId: me.studentId }, select: { completedAt: true } }),
    db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { psychConsentAt: true, psychShareWithStaff: true } }),
  ]);
  const retakeAt = attempt ? new Date(attempt.completedAt.getTime() + RETAKE_AFTER_DAYS * 86_400_000) : null;
  return {
    completed: !!attempt, consentAt: st.psychConsentAt, sharedWithStaff: st.psychShareWithStaff,
    canRetake: !!retakeAt && retakeAt <= new Date(), retakeAt,
    ...instrumentForStudent(),
  };
});

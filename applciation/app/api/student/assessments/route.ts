import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { retakeDecision, ruleFor } from "@/lib/reassessment";

/** Assessments scheduled for me, with the window and my attempt status. */
export const GET = studentRoute({ module: "ASSESSMENTS" }, async (_req, me) => {
  const list = await db.assessmentSchedule.findMany({
    where: { collegeId: me.collegeId, endsAt: { gt: new Date(Date.now() - 30 * 86_400_000) } },
    include: { paper: { select: { title: true, durationMin: true, instructions: true, questions: true, category: true } }, attempts: { where: { studentId: me.studentId }, select: { status: true, submittedAt: true, attemptNumber: true, startedAt: true }, orderBy: { attemptNumber: "desc" } } },
    orderBy: { startsAt: "asc" }, take: 100,
  });
  const now = new Date();
  const rules = await db.reassessmentRule.findMany({ where: { collegeId: me.collegeId }, select: { category: true, maxAttempts: true, cooldownDays: true } });
  return list.filter((s) => (!s.targetDepartmentIds.length || s.targetDepartmentIds.includes(me.departmentId)) && (!s.targetBatchIds.length || s.targetBatchIds.includes(me.batchId))).map((s) => ({
    id: s.id, title: s.title, isBaseline: s.isBaseline, isPractice: s.isPractice, startsAt: s.startsAt, endsAt: s.endsAt, durationMin: s.paper.durationMin, instructions: s.paper.instructions, questions: (s.paper.questions as unknown[]).length,
    state: s.attempts[0] ? s.attempts[0].status : now < s.startsAt ? "UPCOMING" : now > s.endsAt ? "MISSED" : "OPEN",
    category: s.paper.category, attempts: s.attempts.length,
    // A finished test can be taken again while it is open, when the category's rule (or practice) allows it.
    retake: (() => {
      if (!s.attempts.length || s.attempts[0].status === "IN_PROGRESS" || now < s.startsAt || now > s.endsAt) return null;
      const d = retakeDecision({ rule: ruleFor(rules, s.paper.category), attempts: s.attempts, isPractice: s.isPractice, now });
      return d.kind === "start" ? { allowed: true, reason: null } : d.kind === "refuse" ? { allowed: false, reason: d.message } : null;
    })(),
  }));
});

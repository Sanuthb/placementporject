import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

/** Assessments scheduled for me, with the window and my attempt status. */
export const GET = studentRoute({ module: "ASSESSMENTS" }, async (_req, me) => {
  const list = await db.assessmentSchedule.findMany({
    where: { collegeId: me.collegeId, endsAt: { gt: new Date(Date.now() - 30 * 86_400_000) } },
    include: { paper: { select: { title: true, durationMin: true, instructions: true, questions: true } }, attempts: { where: { studentId: me.studentId }, select: { status: true, submittedAt: true } } },
    orderBy: { startsAt: "asc" }, take: 100,
  });
  const now = new Date();
  return list.filter((s) => (!s.targetDepartmentIds.length || s.targetDepartmentIds.includes(me.departmentId)) && (!s.targetBatchIds.length || s.targetBatchIds.includes(me.batchId))).map((s) => ({
    id: s.id, title: s.title, isBaseline: s.isBaseline, isPractice: s.isPractice, startsAt: s.startsAt, endsAt: s.endsAt, durationMin: s.paper.durationMin, instructions: s.paper.instructions, questions: (s.paper.questions as unknown[]).length,
    state: s.attempts[0] ? s.attempts[0].status : now < s.startsAt ? "UPCOMING" : now > s.endsAt ? "MISSED" : "OPEN",
  }));
});

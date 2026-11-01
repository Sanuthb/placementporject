import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { paperQuestions } from "@/lib/assessments";
import { visibleSchedule } from "@/lib/studentAssessments";
import { MIN_GROUP } from "@/lib/psychCohort";

export const GET = studentRoute<{ id: string }>({ module: "ASSESSMENTS" }, async (_req, me, { id }) => {
  const sch = await visibleSchedule(me, id);
  const a = await db.assessmentAttempt.findUnique({ where: { scheduleId_studentId: { scheduleId: id, studentId: me.studentId } } });
  if (!a || a.status === "IN_PROGRESS") throw new ApiError(409, "NOT_FINISHED", "You have not finished this assessment");
  const percent = Number(a.maxScore) ? Math.round((Number(a.score) / Number(a.maxScore)) * 1000) / 10 : 0;
  const qs = paperQuestions(sch.paper.questions);

  // Practice tests show every answer with its explanation straight away.
  const mine = (a.answers ?? {}) as Record<string, number[]>;
  const review = sch.isPractice ? qs.map((q) => ({ id: q.id, text: q.text, options: q.options, correct: q.correct, mine: mine[q.id] ?? [], explanation: q.explanation ?? null })) : null;

  // The baseline diagnostic shows where I stand among students of my batch. Hidden when the group is too small to be anonymous.
  let cohort: { averagePercent: number; betterThanPercent: number } | null = null;
  if (sch.isBaseline) {
    const others = await db.assessmentAttempt.findMany({ where: { status: { not: "IN_PROGRESS" }, score: { not: null }, schedule: { collegeId: me.collegeId, isBaseline: true }, student: { batchId: me.batchId } }, select: { score: true, maxScore: true, studentId: true } });
    const pct = others.map((o) => (Number(o.maxScore) ? (Number(o.score) / Number(o.maxScore)) * 100 : 0));
    if (pct.length >= MIN_GROUP) {
      cohort = { averagePercent: Math.round((pct.reduce((x, y) => x + y, 0) / pct.length) * 10) / 10, betterThanPercent: Math.round((pct.filter((p) => p < percent).length / pct.length) * 100) };
    }
  }
  return { title: sch.title, isPractice: sch.isPractice, isBaseline: sch.isBaseline, score: Number(a.score), maxScore: Number(a.maxScore), percent, passed: sch.paper.passPercent ? percent >= sch.paper.passPercent : null, questions: qs.length, status: a.status, submittedAt: a.submittedAt, review, cohort };
});

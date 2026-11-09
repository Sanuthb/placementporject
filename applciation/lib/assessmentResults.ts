import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import { finalizeOverdue, paperQuestions } from "@/lib/assessments";
import { latestBy } from "@/lib/reassessment";

const BANDS = [[0, 40], [40, 60], [60, 80], [80, 101]] as const;
export const bandLabel = ([lo, hi]: readonly [number, number]) => (hi > 100 ? `${lo}-100` : `${lo}-${hi - 1}`);
export const distribution = (percents: number[]) => BANDS.map((b) => ({ band: bandLabel(b), count: percents.filter((p) => p >= b[0] && p < b[1]).length }));

/** Scores for a schedule. Overdue in-progress attempts are closed first, so results are complete. */
export async function scheduleResults(collegeId: string, scheduleId: string) {
  const sch = await db.assessmentSchedule.findFirst({ where: { id: scheduleId, collegeId }, include: { paper: true } });
  if (!sch) throw notFound("Schedule not found");
  await finalizeOverdue(scheduleId, paperQuestions(sch.paper.questions));
  const attempts = await db.assessmentAttempt.findMany({ where: { scheduleId }, include: { student: { select: { id: true, name: true, enrollmentNo: true, departmentId: true, batchId: true } } }, orderBy: { score: "desc" } });
  // Each student counts once, with their newest finished attempt; earlier attempts stay in their history.
  const done = latestBy(attempts.filter((a) => a.status !== "IN_PROGRESS" && a.score !== null), (a) => a.studentId).sort((x, y) => Number(y.score) - Number(x.score));
  const students = new Set(attempts.map((a) => a.studentId)).size;
  const pct = (a: (typeof done)[number]) => (Number(a.maxScore) ? Math.round((Number(a.score) / Number(a.maxScore)) * 1000) / 10 : 0);
  const percents = done.map(pct);
  return {
    schedule: { id: sch.id, title: sch.title, isBaseline: sch.isBaseline, paper: sch.paper.title, passPercent: sch.paper.passPercent },
    summary: { attempted: students, attempts: attempts.length, submitted: done.length, inProgress: new Set(attempts.filter((a) => a.status === "IN_PROGRESS").map((a) => a.studentId)).size, average: percents.length ? Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 10) / 10 : null, highest: percents.length ? Math.max(...percents) : null, flagged: attempts.filter((a) => a.flagged).length, passed: sch.paper.passPercent ? percents.filter((p) => p >= sch.paper.passPercent!).length : null },
    distribution: distribution(percents),
    results: done.map((a) => ({ student: a.student, attemptNumber: a.attemptNumber, score: Number(a.score), maxScore: Number(a.maxScore), percent: pct(a), status: a.status, violations: a.violations, flagged: a.flagged, submittedAt: a.submittedAt })),
  };
}

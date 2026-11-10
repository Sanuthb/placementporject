import { db } from "@/lib/db";
import { trend, type HistoryPoint } from "@/lib/reassessment";
import { TRAITS, type PsychScores } from "@/lib/psychometrics";

const pct = (score: unknown, max: unknown) => (Number(max) ? Math.round((Number(score) / Number(max)) * 1000) / 10 : 0);

/** Every finished attempt at every scheduled test, grouped per test, oldest first, with the change between attempts. */
export async function testHistory(collegeId: string, studentId: string) {
  const rows = await db.assessmentAttempt.findMany({
    where: { studentId, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null }, schedule: { collegeId } },
    select: { id: true, attemptNumber: true, score: true, maxScore: true, submittedAt: true, status: true, scheduleId: true, schedule: { select: { title: true, isPractice: true, isBaseline: true, paper: { select: { category: true } } } } },
    orderBy: [{ submittedAt: "asc" }],
  });
  const byTest = new Map<string, { scheduleId: string; title: string; category: string; isPractice: boolean; isBaseline: boolean; attempts: (HistoryPoint & { status: string })[] }>();
  for (const r of rows) {
    const t = byTest.get(r.scheduleId) ?? byTest.set(r.scheduleId, { scheduleId: r.scheduleId, title: r.schedule.title, category: r.schedule.paper.category, isPractice: r.schedule.isPractice, isBaseline: r.schedule.isBaseline, attempts: [] }).get(r.scheduleId)!;
    t.attempts.push({ id: r.id, attemptNumber: r.attemptNumber, at: (r.submittedAt ?? new Date(0)).toISOString(), percent: pct(r.score, r.maxScore), status: r.status });
  }
  return [...byTest.values()].map((t) => ({ ...t, attempts: t.attempts.sort((a, b) => a.attemptNumber - b.attemptNumber), latest: t.attempts.at(-1)?.percent ?? null, ...trend(t.attempts) }));
}

/** The student's own personality and aptitude results over time (every attempt, oldest first). Only for the student themselves. */
export async function personalityHistory(studentId: string) {
  const rows = await db.psychAttempt.findMany({ where: { studentId }, select: { completedAt: true, scores: true, instrumentVersion: true, isCurrent: true }, orderBy: { completedAt: "asc" } });
  const points = rows.map((r, i) => {
    const s = r.scores as unknown as PsychScores;
    return { attemptNumber: i + 1, at: r.completedAt.toISOString(), isCurrent: r.isCurrent, version: r.instrumentVersion, aptitude: s.aptitude.overall, aptitudeByArea: s.aptitude.byArea, traits: Object.fromEntries(TRAITS.map((t) => [t, s.personality[t].score])) };
  });
  return { attempts: points, aptitudeTrend: trend(points.map((p) => ({ attemptNumber: p.attemptNumber, at: p.at, percent: p.aptitude }))) };
}

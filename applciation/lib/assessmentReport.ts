import { db } from "@/lib/db";
import { departmentScope, type Session } from "@/lib/auth/session";
import { latestBy } from "@/lib/reassessment";
import { MIN_GROUP } from "@/lib/psychCohort";
import { INSTRUMENTS } from "@/lib/instruments/index";
import type { Result } from "@/lib/instruments/types";

const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
const dist = (xs: number[]) => ({ low: xs.filter((x) => x < 40).length, moderate: xs.filter((x) => x >= 40 && x < 70).length, high: xs.filter((x) => x >= 70).length });
export type Filters = { departmentId?: string; batchId?: string };

/**
 * How a group is doing, by kind of test. Scheduled tests use each student's newest attempt only. Career tests are reported as group figures
 * only (average score per skill; for the private tests, how many students lean each way), never one student at a time, and any group smaller
 * than MIN_GROUP is reported as hidden so no individual can be picked out.
 */
export async function assessmentReport(s: Session, f: Filters) {
  const scope = departmentScope(s);
  const student = { isArchived: false, ...scope, departmentId: scope.departmentId ?? f.departmentId, batchId: f.batchId };
  const [attempts, instr] = await Promise.all([
    db.assessmentAttempt.findMany({
      where: { status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null }, schedule: { collegeId: s.collegeId, isPractice: false }, student },
      select: { studentId: true, scheduleId: true, attemptNumber: true, score: true, maxScore: true, schedule: { select: { title: true, paper: { select: { category: true } } } } },
    }),
    db.instrumentAttempt.findMany({ where: { collegeId: s.collegeId, isCurrent: true, student }, select: { studentId: true, instrumentKey: true, scores: true } }),
  ]);
  const pct = (a: { score: unknown; maxScore: unknown }) => (Number(a.maxScore) ? (Number(a.score) / Number(a.maxScore)) * 100 : 0);
  const latest = latestBy(attempts, (a) => `${a.studentId}:${a.scheduleId}`);

  const categories = [...new Set(latest.map((a) => a.schedule.paper.category))].sort().map((category) => {
    const rows = latest.filter((a) => a.schedule.paper.category === category);
    const students = new Set(rows.map((a) => a.studentId)).size;
    if (students < MIN_GROUP) return { category, hidden: true as const, reason: `Fewer than ${MIN_GROUP} students` };
    const tests = [...new Set(rows.map((r) => r.scheduleId))].map((id) => {
      const t = rows.filter((r) => r.scheduleId === id);
      return t.length < MIN_GROUP ? { title: t[0].schedule.title, hidden: true as const } : { title: t[0].schedule.title, hidden: false as const, students: t.length, average: mean(t.map(pct)), distribution: dist(t.map(pct)) };
    });
    return { category, hidden: false as const, students, average: mean(rows.map(pct)), distribution: dist(rows.map(pct)), tests };
  });

  const careerTests = INSTRUMENTS.map((inst) => {
    const rows = instr.filter((r) => r.instrumentKey === inst.key);
    if (rows.length < MIN_GROUP) return { key: inst.key, title: inst.title, private: inst.private, hidden: true as const, reason: `Fewer than ${MIN_GROUP} students` };
    const results = rows.map((r) => r.scores as unknown as Result);
    const scales = inst.scales.map((sc) => { const v = results.map((r) => r.scales[sc.key]?.score).filter((x): x is number => typeof x === "number"); return { key: sc.key, label: sc.label, average: v.length ? mean(v) : null }; });
    // For the personality-style tests, show where students lean (their strongest scale), as counts by group.
    const leaning = inst.private ? inst.scales.map((sc) => ({ key: sc.key, label: sc.label, students: results.filter((r) => r.ranking[0] === sc.key).length })) : null;
    return { key: inst.key, title: inst.title, private: inst.private, hidden: false as const, students: rows.length, scales, leaning };
  });
  return { minGroup: MIN_GROUP, categories, careerTests };
}

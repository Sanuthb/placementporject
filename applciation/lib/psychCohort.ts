import { db } from "@/lib/db";
import { TRAITS, type PsychScores } from "@/lib/psychometrics";
import { departmentScope, type Session } from "@/lib/auth/session";

export const MIN_GROUP = 5; // groups smaller than this are hidden so no individual can be picked out
const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
const dist = (xs: number[]) => ({ low: xs.filter((x) => x < 40).length, moderate: xs.filter((x) => x >= 40 && x < 70).length, high: xs.filter((x) => x >= 70).length });
const summarise = (list: PsychScores[]) => ({
  personality: Object.fromEntries(TRAITS.map((t) => { const v = list.map((s) => s.personality[t].score); return [t, { average: mean(v), distribution: dist(v) }]; })),
  aptitude: { average: mean(list.map((s) => s.aptitude.overall)), distribution: dist(list.map((s) => s.aptitude.overall)) },
});

/** Cohort-level results by department or batch (averages and distributions). Any group under MIN_GROUP is replaced by a "hidden" marker, without its size. */
export async function cohortResults(s: Session, f: { departmentId?: string; batchId?: string; groupBy: "none" | "department" | "batch" }) {
  const scope = departmentScope(s);
  const rows = await db.psychAttempt.findMany({
    where: { collegeId: s.collegeId, isCurrent: true, student: { isArchived: false, ...scope, departmentId: scope.departmentId ?? f.departmentId, batchId: f.batchId } },
    select: { scores: true, student: { select: { departmentId: true, batchId: true } } },
  });
  const [depts, batches] = await Promise.all([db.department.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }), db.batch.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } })]);
  const group = (name: string, list: typeof rows) => (list.length < MIN_GROUP ? { name, hidden: true, reason: `Fewer than ${MIN_GROUP} students` } : { name, hidden: false, students: list.length, ...summarise(list.map((r) => r.scores as unknown as PsychScores)) });
  const overall = group("All selected students", rows);
  if (f.groupBy === "none") return { overall, groups: [] };
  const key = f.groupBy === "department" ? "departmentId" : "batchId", names = new Map((f.groupBy === "department" ? depts : batches).map((x) => [x.id, x.name]));
  const ids = [...new Set(rows.map((r) => r.student[key]))];
  return { overall, groups: ids.map((id) => group(names.get(id) ?? "?", rows.filter((r) => r.student[key] === id))) };
}

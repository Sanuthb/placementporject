import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { distribution } from "@/lib/assessmentResults";
import { MIN_GROUP } from "@/lib/psychCohort";

const query = z.object({ batchId: z.uuid().optional(), departmentId: z.uuid().optional() });

/** Score distribution of baseline diagnostic tests by department, for the chosen cohort. Groups smaller than the privacy minimum are hidden. */
export const GET = route({ module: "ASSESSMENTS" }, async (req, s) => {
  const q = parseQuery(req, query);
  const scope = departmentScope(s);
  const attempts = await db.assessmentAttempt.findMany({
    where: { status: { not: "IN_PROGRESS" }, score: { not: null }, schedule: { collegeId: s.collegeId, isBaseline: true }, student: { ...scope, departmentId: scope.departmentId ?? q.departmentId, batchId: q.batchId } },
    select: { score: true, maxScore: true, student: { select: { departmentId: true } } },
  });
  const pct = (a: (typeof attempts)[number]) => (Number(a.maxScore) ? (Number(a.score) / Number(a.maxScore)) * 100 : 0);
  const depts = await db.department.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } });
  const view = (name: string, list: typeof attempts) => list.length < MIN_GROUP ? { name, hidden: true, reason: `Fewer than ${MIN_GROUP} students` } : { name, hidden: false, students: list.length, average: Math.round((list.map(pct).reduce((a, b) => a + b, 0) / list.length) * 10) / 10, distribution: distribution(list.map(pct)) };
  return { overall: view("All selected students", attempts), byDepartment: depts.map((d) => ({ id: d.id, ...view(d.name, attempts.filter((a) => a.student.departmentId === d.id)) })).filter((d) => d.hidden === false || attempts.some((a) => a.student.departmentId === d.id)) };
});

import { route } from "@/lib/api/handler";
import { isCoordinatorOnly } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDrive } from "@/lib/drives";
import { jdData } from "@/lib/jd";
import { pipelineCounts } from "@/lib/placementStatus";
import { statusesFor } from "@/lib/placementStatusService";
import { jobFor } from "@/lib/readinessService";

/**
 * Where every applicant stands, as the placement status steps, with counts per step. When the drive has an approved job description, each applicant's job readiness is shown
 * beside their eligibility (the readiness score is for coaching and review, not a filter). Coordinators see their own department's students, without readiness.
 */
export const GET = route<{ id: string }>({ module: "DRIVES" }, async (_req, s, { id }) => {
  await getDrive(s.collegeId, id);
  const scoped = isCoordinatorOnly(s);
  const all = await statusesFor({ collegeId: s.collegeId, driveId: id }, "staff");
  const students = await db.student.findMany({ where: { id: { in: all.map((x) => x.studentId) }, ...(scoped ? { departmentId: s.departmentId ?? "none" } : {}) }, select: { id: true, name: true, enrollmentNo: true } });
  const st = new Map(students.map((x) => [x.id, x]));
  const rows = all.filter((x) => st.has(x.studentId));
  let ready = new Map<string, { score: number; coverage: number; gate: string; gateLabel: string }>();
  const jd = !scoped ? await db.jobDescription.findFirst({ where: { driveId: id, collegeId: s.collegeId, status: "APPROVED" } }) : null;
  if (jd && rows.length && rows.length <= 500) {
    const res = await jobFor(jd, jdData.parse(jd.data), rows.map((r) => r.studentId), "staff");
    ready = new Map([...res].map(([k, v]) => [k, { score: v.score, coverage: v.coverage, gate: v.gate, gateLabel: v.gateLabel }]));
  }
  return {
    counts: pipelineCounts(rows.map((r) => r.status)), readiness: !!jd && rows.length <= 500 && !scoped,
    rows: rows.map((r) => ({ applicationId: r.applicationId, student: st.get(r.studentId)!, stage: { key: r.status.current, label: r.status.label, next: r.status.next }, readiness: ready.get(r.studentId) ?? null })).sort((a, b) => a.student.name.localeCompare(b.student.name)),
  };
});

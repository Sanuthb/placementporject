import { db } from "@/lib/db";
import { notFound, ApiError } from "@/lib/api/errors";
import type { StudentSession } from "@/lib/auth/student";
import { departmentScope, type Session } from "@/lib/auth/session";
import { paperQuestions } from "@/lib/assessments";
import { cleanFeedback, weakCategories, type Turn } from "@/lib/interviewEngine";
import { comparisonFor } from "@/lib/interviewService";
import { buildReport, shapeReport, visibilityOf, compareAttempts, type Answer, type Marks } from "@/lib/mockTest";
import { cohortDoc, cohortTopics, interviewDoc, performanceDoc, testDoc, type Person } from "@/lib/reportBuilders";
import type { ReportDoc } from "@/lib/reportDoc";
import { testHistory } from "@/lib/assessmentHistory";
import { improvementPlan, myReport, reportOfAttempt } from "@/lib/testReportService";
import { scopedFullStudent } from "@/lib/student360";

/**
 * Loads what a report needs and hands it to the pure builders. Two kinds of viewer:
 *  - the student, who gets what the test's result-visibility allows and their own interviews (private ones included);
 *  - staff within their scope, who get full test reports but only interviews the placement office assigned (a student's own practice stays private).
 */
type StudentRow = Awaited<ReturnType<typeof scopedFullStudent>>;
const collegeName = async (collegeId: string) => (await db.college.findUnique({ where: { id: collegeId }, select: { name: true } }))?.name ?? "College";
const personOf = (s: StudentRow): Person => ({ name: s.name, enrollmentNo: s.enrollmentNo, department: s.department?.name, batch: s.batch?.name });
const sessionOf = (s: StudentRow): StudentSession => ({ studentId: s.id, userId: s.userId ?? "", collegeId: s.collegeId, departmentId: s.departmentId, batchId: s.batchId, name: s.name, email: s.email });
const jobTitle = async (collegeId: string, jdId: string | null) => (jdId ? (await db.jobDescription.findFirst({ where: { id: jdId, collegeId }, select: { title: true, companyName: true } })) : null);
const jobLabel = (j: { title: string; companyName: string } | null) => (j ? `${j.title} at ${j.companyName}` : null);

export type Viewer = { kind: "student"; me: StudentSession } | { kind: "staff"; s: Session };

async function studentFor(v: Viewer, studentId?: string): Promise<StudentRow> {
  if (v.kind === "staff") return scopedFullStudent(v.s, studentId!);
  return db.student.findFirstOrThrow({ where: { id: v.me.studentId, collegeId: v.me.collegeId }, include: { department: { select: { id: true, name: true, code: true } }, batch: { select: { id: true, name: true } }, program: { select: { id: true, name: true } } } });
}

/** A mock test report. For a student `ref` is the schedule id (their newest finished attempt); for staff it is an attempt id. */
export async function testReportDoc(v: Viewer, ref: string): Promise<ReportDoc> {
  let r: Awaited<ReturnType<typeof myReport>>, st: StudentRow;
  if (v.kind === "student") {
    r = await myReport(v.me, ref); st = await studentFor(v);
  } else {
    const a = await db.assessmentAttempt.findFirst({ where: { id: ref, status: { not: "IN_PROGRESS" }, schedule: { collegeId: v.s.collegeId } }, include: { schedule: { include: { paper: true } } } });
    if (!a) throw notFound("Attempt not found");
    st = await scopedFullStudent(v.s, a.studentId);
    const prevRow = await db.assessmentAttempt.findFirst({ where: { scheduleId: a.scheduleId, studentId: a.studentId, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, attemptNumber: { lt: a.attemptNumber } }, orderBy: { attemptNumber: "desc" } });
    const sch = a.schedule, full = reportOfAttempt(sch, a), vis = visibilityOf(sch.resultVisibility, sch.isPractice);
    r = { sch, attempt: a, full, prev: prevRow ? reportOfAttempt(sch, prevRow) : null, vis, shaped: shapeReport(full, "IMMEDIATE", new Date(), sch.endsAt) } as typeof r;
  }
  const canPlan = r.vis !== "SCORE_ONLY" && !r.full.provisional;
  const plan = canPlan ? await improvementPlan(sessionOf(st), r.sch.id, r).catch(() => null) : null;
  const jd = await jobTitle(st.collegeId, r.sch.paper.jdId ?? null);
  const comparison = r.prev && (v.kind === "staff" || r.shaped.topics.length > 0 || r.vis !== "SCORE_ONLY") ? compareAttempts(r.full, r.prev) : null;
  return testDoc({
    college: await collegeName(st.collegeId), student: personOf(st), comparison,
    test: { title: r.sch.title, category: r.sch.paper.category, kind: r.sch.paper.testKind ?? null, practice: r.sch.isPractice, jobTitle: jobLabel(jd), attemptNumber: r.attempt.attemptNumber, submittedAt: r.attempt.submittedAt, durationMin: r.sch.paper.durationMin },
    report: r.shaped as never,
    plan: plan ? { materials: plan.materials, uncovered: plan.uncovered, exercises: plan.exercises, reassessAt: plan.reassessAt, nextTest: plan.nextTest } : null,
  });
}

/** A mock interview report. Staff may open only interviews the placement office assigned. */
export async function interviewReportDoc(v: Viewer, id: string): Promise<ReportDoc> {
  const m = await db.mockInterview.findFirst({ where: v.kind === "student" ? { id, studentId: v.me.studentId } : { id, collegeId: v.s.collegeId, assignmentId: { not: null } } });
  if (!m) throw notFound("Interview not found");
  const st = v.kind === "staff" ? await scopedFullStudent(v.s, m.studentId) : await studentFor(v);
  const f = cleanFeedback(m.feedback);
  const cmp = await comparisonFor(m);
  const jd = await jobTitle(m.collegeId, m.jdId);
  return interviewDoc({
    college: await collegeName(m.collegeId), student: personOf(st), transcript: m.transcript as Turn[], feedback: f, comparison: cmp,
    interview: { role: m.role, type: m.type as never, mode: m.mode, difficulty: m.difficulty, language: m.language, durationMin: m.durationMin, startedAt: m.createdAt, completedAt: m.completedAt, jobTitle: jobLabel(jd) },
  });
}

/** The newest finished, fully marked attempt of each test, with its report, for a student (most recent tests first). */
async function latestReports(studentId: string, collegeId: string, take = 30) {
  const rows = await db.assessmentAttempt.findMany({ where: { studentId, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null }, schedule: { collegeId } }, orderBy: { submittedAt: "desc" }, take: take * 3, include: { schedule: { include: { paper: true } } } });
  const seen = new Set<string>(), out: ReturnType<typeof buildReport>[] = [];
  for (const a of rows) { if (seen.has(a.scheduleId) || out.length >= take) continue; seen.add(a.scheduleId); out.push(buildReport({ qs: paperQuestions(a.schedule.paper.questions), answers: (a.answers ?? {}) as Record<string, Answer>, marks: (a.marks ?? {}) as Marks, startedAt: a.startedAt, submittedAt: a.submittedAt, passPercent: a.schedule.paper.passPercent, sectionCutoffs: (a.schedule.paper.sectionCutoffs ?? {}) as Record<string, number> })); }
  return out;
}

/** One student's consolidated performance report: tests, interviews (staff see only assigned ones) and the topics to work on. */
export async function performanceReportDoc(v: Viewer, studentId?: string): Promise<ReportDoc> {
  const st = await studentFor(v, studentId);
  const [tests, reports, ivs] = await Promise.all([
    testHistory(st.collegeId, st.id), latestReports(st.id, st.collegeId),
    db.mockInterview.findMany({ where: { studentId: st.id, status: "COMPLETED", ...(v.kind === "staff" ? { assignmentId: { not: null } } : {}) }, orderBy: { completedAt: "desc" }, take: 50, select: { role: true, type: true, feedback: true, completedAt: true, createdAt: true } }),
  ]);
  const weak = cohortTopics(reports.map((r) => r.weakTopics)).slice(0, 10).map((t) => ({ topic: t.topic, percent: t.averagePercent }));
  return performanceDoc({
    college: await collegeName(st.collegeId), student: personOf(st), viewer: v.kind === "staff" ? "STAFF" : "STUDENT",
    tests: tests.map((t) => ({ title: t.title, category: t.category, attempts: t.attempts.length, latest: t.latest, sinceFirst: t.sinceFirst ?? null })),
    interviews: ivs.map((x) => { const f = cleanFeedback(x.feedback); return { role: x.role, type: x.type, date: x.completedAt ?? x.createdAt, score: f?.score ?? null, weak: f ? weakCategories(f).map((c) => c.label) : [] }; }),
    weakTopics: weak,
  });
}

const CAP = 2000;
/** A group report for a batch and/or department the viewer may see. Includes the topics the group finds hardest (the cohort topic report). */
export async function cohortReportDoc(s: Session, q: { batchId?: string; departmentId?: string }): Promise<ReportDoc> {
  const [dept, batch] = await Promise.all([q.departmentId ? db.department.findFirst({ where: { id: q.departmentId, collegeId: s.collegeId }, select: { name: true } }) : null, q.batchId ? db.batch.findFirst({ where: { id: q.batchId, collegeId: s.collegeId }, select: { name: true } }) : null]);
  if ((q.departmentId && !dept) || (q.batchId && !batch)) throw notFound("Department or batch not found");
  const students = await db.student.findMany({ where: { collegeId: s.collegeId, isActive: true, ...departmentScope(s), ...(q.departmentId ? { departmentId: q.departmentId } : {}), ...(q.batchId ? { batchId: q.batchId } : {}) }, select: { id: true, name: true, enrollmentNo: true }, orderBy: { name: "asc" }, take: CAP + 1 });
  if (students.length > CAP) throw new ApiError(400, "TOO_LARGE", `This group has more than ${CAP} students. Choose a department and a batch to narrow it`);
  const ids = students.map((x) => x.id);
  const [attempts, ivs] = await Promise.all([
    ids.length ? db.assessmentAttempt.findMany({ where: { studentId: { in: ids }, status: { not: "IN_PROGRESS" }, reviewStatus: { not: "PENDING" }, score: { not: null }, schedule: { collegeId: s.collegeId } }, orderBy: { submittedAt: "desc" }, take: 6000, include: { schedule: { include: { paper: true } } } }) : [],
    ids.length ? db.mockInterview.findMany({ where: { studentId: { in: ids }, status: "COMPLETED", assignmentId: { not: null } }, select: { studentId: true, feedback: true } }) : [],
  ]);
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!latest.has(`${a.studentId}:${a.scheduleId}`)) latest.set(`${a.studentId}:${a.scheduleId}`, a);
  const per = new Map<string, { pct: number[]; topics: { topic: string; percent: number }[] }>();
  for (const a of latest.values()) {
    const rep = buildReport({ qs: paperQuestions(a.schedule.paper.questions), answers: (a.answers ?? {}) as Record<string, Answer>, marks: (a.marks ?? {}) as Marks, startedAt: a.startedAt, submittedAt: a.submittedAt, passPercent: null });
    const x = per.get(a.studentId) ?? { pct: [], topics: [] }; x.pct.push(rep.percent); x.topics.push(...rep.topics.map((t) => ({ topic: t.topic, percent: t.percent }))); per.set(a.studentId, x);
  }
  const score = new Map<string, number[]>();
  for (const i of ivs) { const f = cleanFeedback(i.feedback); if (f) score.set(i.studentId, [...(score.get(i.studentId) ?? []), f.score]); }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, c) => a + c, 0) / xs.length) * 10) / 10 : null);
  const scope = [dept?.name, batch ? `Batch ${batch.name}` : null].filter(Boolean).join(", ") || "All students";
  return cohortDoc({
    college: await collegeName(s.collegeId), scope, generatedFor: s.name ?? s.email ?? "Placement office",
    students: students.map((x) => ({ name: x.name, enrollmentNo: x.enrollmentNo, testsTaken: per.get(x.id)?.pct.length ?? 0, averagePercent: avg(per.get(x.id)?.pct ?? []), interviews: score.get(x.id)?.length ?? 0, averageInterview: avg(score.get(x.id) ?? []) })),
    topics: cohortTopics([...per.values()].map((x) => x.topics), 2),
  });
}

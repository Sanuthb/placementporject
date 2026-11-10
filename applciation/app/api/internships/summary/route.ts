import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { INT_ADMIN } from "@/lib/internshipService";
import { attendanceSummary, ppoStats, type Ppo } from "@/lib/internships";

/** Internships at a glance: the application funnel, who is running, completion, attendance, evaluation scores, certificates and pre-placement offers. */
export const GET = route(INT_ADMIN, async (_req, s) => {
  const [postings, apps, internships] = await Promise.all([
    db.internshipPosting.groupBy({ by: ["status"], where: { collegeId: s.collegeId }, _count: true }),
    db.internshipApplication.groupBy({ by: ["status"], where: { collegeId: s.collegeId }, _count: true }),
    db.internship.findMany({ where: { collegeId: s.collegeId }, select: { id: true, status: true, startDate: true, endDate: true, workDays: true, certificateStatus: true, ppoStatus: true, student: { select: { name: true } }, attendance: { select: { date: true, status: true, verified: true } }, evaluations: { select: { score: true } }, logs: { where: { status: "SUBMITTED" }, select: { id: true } }, tasks: { where: { status: "SUBMITTED" }, select: { id: true } } } }),
  ]);
  const n = (rows: { status: string; _count: number }[], st: string) => rows.find((r) => r.status === st)?._count ?? 0;
  const running = internships.filter((i) => i.status === "ONGOING" || i.status === "ALLOTTED");
  const atts = running.filter((i) => i.status === "ONGOING").map((i) => ({ name: i.student.name, id: i.id, a: attendanceSummary({ start: i.startDate, end: i.endDate, workDays: i.workDays, today: new Date(), marks: i.attendance.map((m) => ({ date: m.date.toISOString().slice(0, 10), status: m.status, verified: m.verified })) }) }));
  const withPct = atts.filter((x) => x.a.percent !== null);
  const done = internships.filter((i) => i.status === "COMPLETED");
  const scores = internships.flatMap((i) => i.evaluations.map((e) => e.score));
  return {
    postings: { open: n(postings, "OPEN"), draft: n(postings, "DRAFT"), closed: n(postings, "CLOSED") },
    applications: { waitingForCollege: n(apps, "APPLIED"), waitingForCompany: n(apps, "COLLEGE_APPROVED"), selected: n(apps, "ALLOTTED"), rejected: n(apps, "COLLEGE_REJECTED") + n(apps, "COMPANY_REJECTED"), withdrawn: n(apps, "WITHDRAWN") },
    internships: { allotted: internships.filter((i) => i.status === "ALLOTTED").length, ongoing: internships.filter((i) => i.status === "ONGOING").length, completed: done.length, terminated: internships.filter((i) => i.status === "TERMINATED").length },
    averageAttendancePercent: withPct.length ? Math.round(withPct.reduce((a, x) => a + (x.a.percent ?? 0), 0) / withPct.length) : null,
    lowAttendance: atts.filter((x) => x.a.percent !== null && x.a.percent < 75).slice(0, 20).map((x) => ({ id: x.id, name: x.name, percent: x.a.percent })),
    averageEvaluation: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    toReview: { logs: internships.reduce((a, i) => a + i.logs.length, 0), tasks: internships.reduce((a, i) => a + i.tasks.length, 0), certificates: internships.filter((i) => i.certificateStatus === "PENDING").length },
    certificatesVerifiedPercent: done.length ? Math.round((done.filter((i) => i.certificateStatus === "VERIFIED").length / done.length) * 100) : null,
    ppo: ppoStats(done.map((i) => ({ ppo: i.ppoStatus as Ppo }))),
  };
});

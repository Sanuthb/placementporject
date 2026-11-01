import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { ProfileSection } from "@/generated/prisma/client";

/** How ready I am, from things the platform already knows: profile, assessments, drives attended, mock interviews. */
export const GET = studentRoute({ module: "STUDENT_PREP" }, async (_req, me) => {
  const [mods, settings, sections, attempts, attendance, mocks] = await Promise.all([
    db.collegeModule.findMany({ where: { collegeId: me.collegeId, enabled: true }, select: { module: true } }),
    db.collegeSettings.findUnique({ where: { collegeId: me.collegeId }, select: { requiredSections: true } }),
    db.studentSection.findMany({ where: { studentId: me.studentId }, select: { section: true, status: true } }),
    db.assessmentAttempt.findMany({ where: { studentId: me.studentId, status: { not: "IN_PROGRESS" }, score: { not: null }, schedule: { isPractice: false } }, select: { score: true, maxScore: true } }),
    db.attendanceRecord.findMany({ where: { studentId: me.studentId, status: "PRESENT" }, select: { driveId: true } }),
    db.mockInterview.findMany({ where: { studentId: me.studentId, status: "COMPLETED" }, select: { feedback: true } }),
  ]);
  const has = new Set(mods.map((m) => m.module));
  const required = settings?.requiredSections?.length ? settings.requiredSections : Object.values(ProfileSection);
  const verified = required.filter((r) => sections.some((s) => s.section === r && s.status === "VERIFIED")).length;
  const pcts = attempts.map((a) => (Number(a.maxScore) ? (Number(a.score) / Number(a.maxScore)) * 100 : 0));
  const scores = mocks.map((m) => (m.feedback as { score?: number } | null)?.score).filter((x): x is number => typeof x === "number");
  const avg = (x: number[]) => (x.length ? Math.round((x.reduce((a, b) => a + b, 0) / x.length) * 10) / 10 : null);
  return {
    profile: { verified, required: required.length },
    assessments: has.has("ASSESSMENTS") ? { taken: pcts.length, averagePercent: avg(pcts) } : null,
    drivesAttended: has.has("ATTENDANCE_BLOCKING") ? new Set(attendance.map((a) => a.driveId)).size : null,
    mockInterviews: { done: scores.length, averageScore: avg(scores) },
  };
});

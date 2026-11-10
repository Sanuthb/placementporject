import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

/** The reports I can open: my finished tests and interviews. */
export const GET = studentRoute({ module: "ASSESSMENTS" }, async (_req, me) => {
  const [attempts, interviews] = await Promise.all([
    db.assessmentAttempt.findMany({ where: { studentId: me.studentId, status: { not: "IN_PROGRESS" }, schedule: { collegeId: me.collegeId } }, orderBy: { submittedAt: "desc" }, take: 100, select: { scheduleId: true, attemptNumber: true, submittedAt: true, reviewStatus: true, schedule: { select: { title: true } } } }),
    db.mockInterview.findMany({ where: { studentId: me.studentId, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 100, select: { id: true, role: true, type: true, completedAt: true } }),
  ]);
  const seen = new Set<string>();
  return { tests: attempts.filter((a) => !seen.has(a.scheduleId) && !!seen.add(a.scheduleId)).map((a) => ({ scheduleId: a.scheduleId, title: a.schedule.title, submittedAt: a.submittedAt, provisional: a.reviewStatus === "PENDING" })), interviews };
});

import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import type { StudentSession } from "@/lib/auth/student";
import { paperQuestions } from "@/lib/assessments";
import { buildReport, shapeReport, visibilityOf, type Answer, type Marks, type Report } from "@/lib/mockTest";
import { markOpenAnswers } from "@/lib/openMarking";
import { visibleSchedule } from "@/lib/studentAssessments";

type Sch = Awaited<ReturnType<typeof visibleSchedule>>;
type Att = NonNullable<Awaited<ReturnType<typeof db.assessmentAttempt.findFirst>>>;

export const reportOfAttempt = (sch: Sch, a: Att): Report =>
  buildReport({ qs: paperQuestions(sch.paper.questions), answers: (a.answers ?? {}) as Record<string, Answer>, marks: (a.marks ?? {}) as Marks, startedAt: a.startedAt, submittedAt: a.submittedAt, passPercent: sch.paper.passPercent, sectionCutoffs: (sch.paper.sectionCutoffs ?? {}) as Record<string, number> });

/** My newest finished attempt of a test, its full report, and the one before it (for comparison). Open answers still waiting get one AI marking pass first. */
export async function myReport(me: StudentSession, scheduleId: string) {
  const sch = await visibleSchedule(me, scheduleId);
  let finished = await db.assessmentAttempt.findMany({ where: { scheduleId, studentId: me.studentId, status: { not: "IN_PROGRESS" } }, orderBy: { attemptNumber: "desc" }, take: 2 });
  if (!finished.length) throw new ApiError(409, "NOT_FINISHED", "You have not finished this assessment");
  if (finished[0].reviewStatus === "PENDING") {
    await markOpenAnswers(finished[0].id).catch(() => undefined);
    finished = await db.assessmentAttempt.findMany({ where: { scheduleId, studentId: me.studentId, status: { not: "IN_PROGRESS" } }, orderBy: { attemptNumber: "desc" }, take: 2 });
  }
  const [a, prev] = finished;
  const full = reportOfAttempt(sch, a);
  const vis = visibilityOf(sch.resultVisibility, sch.isPractice);
  return { sch, attempt: a, full, prev: prev && prev.reviewStatus !== "PENDING" ? reportOfAttempt(sch, prev) : null, vis, shaped: shapeReport(full, vis, new Date(), sch.endsAt) };
}

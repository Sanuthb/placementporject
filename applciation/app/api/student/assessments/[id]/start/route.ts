import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { orderFor, paperQuestions, proctoringOf } from "@/lib/assessments";
import { visibleSchedule } from "@/lib/studentAssessments";

/** Starts (or resumes) my attempt. Questions come without answers; the clock runs from the first start. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "exam-start", max: 30, windowSec: 3600 }, module: "ASSESSMENTS" }, async (_req, me, { id }) => {
  const sch = await visibleSchedule(me, id);
  const now = new Date();
  let a = await db.assessmentAttempt.findUnique({ where: { scheduleId_studentId: { scheduleId: id, studentId: me.studentId } } });
  if (a && a.status !== "IN_PROGRESS") throw new ApiError(409, "ALREADY_SUBMITTED", "You have already taken this assessment");
  if (!a) {
    if (now < sch.startsAt) throw new ApiError(409, "NOT_OPEN", "This assessment has not opened yet");
    if (now > sch.endsAt) throw new ApiError(409, "CLOSED", "This assessment has closed");
    const deadlineAt = new Date(Math.min(now.getTime() + sch.paper.durationMin * 60_000, sch.endsAt.getTime()));
    try { a = await db.assessmentAttempt.create({ data: { scheduleId: id, studentId: me.studentId, deadlineAt } }); }
    catch (e) { if ((e as { code?: string }).code !== "P2002") throw e; a = await db.assessmentAttempt.findUniqueOrThrow({ where: { scheduleId_studentId: { scheduleId: id, studentId: me.studentId } } }); }
  } else if (Date.now() > a.deadlineAt.getTime() + 10_000) throw new ApiError(409, "TIME_UP", "Your time ran out");
  const qs = orderFor(paperQuestions(sch.paper.questions), a.id, sch.paper.shuffle);
  return {
    attemptId: a.id, deadlineAt: a.deadlineAt, secondsLeft: Math.max(0, Math.floor((a.deadlineAt.getTime() - Date.now()) / 1000)), proctoring: proctoringOf(sch.paper.proctoring), instructions: sch.paper.instructions,
    questions: qs.map(({ id: qid, text, options, marks }) => ({ id: qid, text, options, marks })), savedAnswers: a.answers,
  };
});

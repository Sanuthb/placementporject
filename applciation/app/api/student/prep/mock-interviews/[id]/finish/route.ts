import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { interviewFeedback, type Turn } from "@/lib/mockInterview";

/** End the interview early and get feedback on the answers given so far. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "mock-interview-answer", max: 60, windowSec: 3600 }, module: "STUDENT_PREP" }, async (_req, me, { id }) => {
  const m = await db.mockInterview.findFirst({ where: { id, studentId: me.studentId } });
  if (!m) throw notFound("Interview not found");
  if (m.status !== "IN_PROGRESS") throw new ApiError(409, "CONFLICT", "This interview is finished");
  const turns = m.transcript as Turn[];
  if (!turns.some((t) => t.role === "student")) throw new ApiError(409, "CONFLICT", "Answer at least one question first");
  const answered = turns.at(-1)?.role === "interviewer" ? turns.slice(0, -1) : turns; // the unanswered last question is left out
  const feedback = await interviewFeedback(m.role, m.topic, answered);
  await db.mockInterview.update({ where: { id }, data: { status: "COMPLETED", feedback, completedAt: new Date() } });
  return { done: true, feedback };
});

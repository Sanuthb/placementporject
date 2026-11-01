import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { QUESTIONS_PER_INTERVIEW, interviewFeedback, nextQuestion, type Turn } from "@/lib/mockInterview";

const body = z.object({ text: z.string().trim().min(1).max(4000) });

/** Answer the current question. Returns the next question, or the feedback once the last answer is in. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "mock-interview-answer", max: 60, windowSec: 3600 }, module: "STUDENT_PREP" }, async (req, me, { id }) => {
  const { text } = await parseBody(req, body);
  const m = await db.mockInterview.findFirst({ where: { id, studentId: me.studentId } });
  if (!m) throw notFound("Interview not found");
  if (m.status !== "IN_PROGRESS") throw new ApiError(409, "CONFLICT", "This interview is finished");
  const turns = [...(m.transcript as Turn[]), { role: "student", text } satisfies Turn];
  const asked = turns.filter((t) => t.role === "interviewer").length;
  if (turns.at(-2)?.role !== "interviewer") throw new ApiError(409, "CONFLICT", "Wait for the next question");

  if (asked >= QUESTIONS_PER_INTERVIEW) {
    const feedback = await interviewFeedback(m.role, m.topic, turns);
    await db.mockInterview.update({ where: { id }, data: { transcript: turns, status: "COMPLETED", feedback, completedAt: new Date() } });
    return { done: true, feedback };
  }
  const q = await nextQuestion(m.role, m.topic, turns);
  const all = [...turns, { role: "interviewer", text: q } satisfies Turn];
  await db.mockInterview.update({ where: { id }, data: { transcript: all } });
  return { done: false, question: q };
});

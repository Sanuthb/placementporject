import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { askedCount, awaitingAnswer, currentQuestion, isExpired, type Turn } from "@/lib/interviewEngine";
import { configOf, finishInterview, myInterview } from "@/lib/interviewService";
import { improveAnswer, nextQuestion } from "@/lib/mockInterview";

const body = z.object({ text: z.string().trim().min(1).max(4000), voice: z.boolean().default(false) });

/**
 * Answer the current question. Returns the next question (and, in learning mode, a coach's note on this answer), or the report once the last answer is in.
 * In assessment mode an answer that arrives after the time is not taken: the interview ends with the answers already given.
 */
export const POST = studentRoute<{ id: string }>({ limit: { name: "mock-interview-answer", max: 60, windowSec: 3600 }, module: "STUDENT_PREP" }, async (req, me, { id }) => {
  const b = await parseBody(req, body);
  const m = await myInterview(me, id);
  if (m.status !== "IN_PROGRESS") throw new ApiError(409, "CONFLICT", "This interview is finished");
  const before = m.transcript as Turn[];
  if (!awaitingAnswer(before)) throw new ApiError(409, "CONFLICT", "Wait for the next question");
  if (isExpired(m.mode, m.createdAt, m.durationMin)) {
    if (!before.some((t) => t.role === "student")) throw new ApiError(409, "TIME_UP", "The time for this interview has run out");
    return { done: true, expired: true, feedback: await finishInterview(m, before) };
  }
  const question = currentQuestion(before)!;
  const turns: Turn[] = [...before, { role: "student", text: b.text, ...(b.voice ? { voice: true } : {}) }];
  const cfg = await configOf(m);
  if (b.voice && !m.voiceUsed) await db.mockInterview.update({ where: { id }, data: { voiceUsed: true } });

  if (askedCount(turns) >= m.questionCount) {
    await db.mockInterview.update({ where: { id }, data: { transcript: turns } });
    const coach = m.mode === "LEARNING" ? await improveAnswer(cfg, question, b.text).catch(() => null) : null;
    const all: Turn[] = coach ? [...turns, { role: "coach", kind: "improve", text: coach }] : turns;
    return { done: true, feedback: await finishInterview(m, all), coach };
  }
  const [q, coach] = await Promise.all([nextQuestion(cfg, turns), m.mode === "LEARNING" ? improveAnswer(cfg, question, b.text).catch(() => null) : Promise.resolve(null)]);
  const all: Turn[] = [...turns, ...(coach ? [{ role: "coach", kind: "improve", text: coach } as Turn] : []), { role: "interviewer", text: q }];
  await db.mockInterview.update({ where: { id }, data: { transcript: all } });
  return { done: false, question: q, coach };
});

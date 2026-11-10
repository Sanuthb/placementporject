import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError } from "@/lib/api/errors";
import type { Turn } from "@/lib/interviewEngine";
import { finishInterview, myInterview } from "@/lib/interviewService";

/** End the interview early and get the report on the answers given so far. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "mock-interview-answer", max: 60, windowSec: 3600 }, module: "STUDENT_PREP" }, async (_req, me, { id }) => {
  const m = await myInterview(me, id);
  if (m.status !== "IN_PROGRESS") throw new ApiError(409, "CONFLICT", "This interview is finished");
  const turns = m.transcript as Turn[];
  if (!turns.some((t) => t.role === "student")) throw new ApiError(409, "CONFLICT", "Answer at least one question first");
  return { done: true, feedback: await finishInterview(m, turns) };
});

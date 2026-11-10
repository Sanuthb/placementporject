import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { currentQuestion, type Turn } from "@/lib/interviewEngine";
import { configOf, myInterview } from "@/lib/interviewService";
import { hintFor } from "@/lib/mockInterview";

/** Learning mode only: a hint on the current question. Assessment mode gives none. The hint is kept in the transcript, labelled as the coach's. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "mock-interview-hint", max: 40, windowSec: 3600 }, module: "STUDENT_PREP" }, async (_req, me, { id }) => {
  const m = await myInterview(me, id);
  if (m.mode !== "LEARNING") throw new ApiError(409, "NO_HINTS", "Hints are not available in assessment mode");
  if (m.status !== "IN_PROGRESS") throw new ApiError(409, "CONFLICT", "This interview is finished");
  const turns = m.transcript as Turn[];
  const q = currentQuestion(turns);
  if (!q) throw new ApiError(409, "CONFLICT", "There is no question waiting");
  const text = await hintFor(await configOf(m), q);
  await db.mockInterview.update({ where: { id }, data: { transcript: [...turns, { role: "coach", kind: "hint", text }] } });
  return { hint: text };
});

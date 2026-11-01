import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { nextQuestion } from "@/lib/mockInterview";

const body = z.object({ role: z.string().trim().min(2).max(100), topic: z.string().trim().min(2).max(200) });

/** My past and current practice interviews. */
export const GET = studentRoute({ module: "STUDENT_PREP" }, (_req, me) =>
  db.mockInterview.findMany({ where: { studentId: me.studentId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, role: true, topic: true, status: true, createdAt: true, feedback: true } })
    .then((rows) => rows.map(({ feedback, ...r }) => ({ ...r, score: (feedback as { score?: number } | null)?.score ?? null }))),
);

/** Start a practice interview by role and topic. The interviewer asks the first question straight away. */
export const POST = studentRoute({ limit: { name: "mock-interview", max: 10, windowSec: 3600 }, module: "STUDENT_PREP" }, async (req, me) => {
  const { role, topic } = await parseBody(req, body);
  const first = await nextQuestion(role, topic, []);
  const m = await db.mockInterview.create({ data: { collegeId: me.collegeId, studentId: me.studentId, role, topic, transcript: [{ role: "interviewer", text: first }] }, select: { id: true } });
  return m;
});

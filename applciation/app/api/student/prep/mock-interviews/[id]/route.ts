import { studentRoute } from "@/lib/api/studentHandler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { QUESTIONS_PER_INTERVIEW } from "@/lib/mockInterview";

export const GET = studentRoute<{ id: string }>({ module: "STUDENT_PREP" }, async (_req, me, { id }) => {
  const m = await db.mockInterview.findFirst({ where: { id, studentId: me.studentId } });
  if (!m) throw notFound("Interview not found");
  return { id: m.id, role: m.role, topic: m.topic, status: m.status, transcript: m.transcript, feedback: m.feedback, createdAt: m.createdAt, totalQuestions: QUESTIONS_PER_INTERVIEW };
});

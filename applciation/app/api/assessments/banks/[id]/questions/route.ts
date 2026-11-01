import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { questionInput } from "@/lib/assessments";

const body = z.object({ questions: z.array(questionInput).min(1).max(200) });
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

export const GET = route<{ id: string }>(R, async (_req, s, { id }) => {
  if (!(await db.questionBank.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Question bank not found");
  return db.question.findMany({ where: { bankId: id }, orderBy: { createdAt: "asc" }, take: 1000 });
});

/** Add one or many questions at once. */
export const POST = route<{ id: string }>(R, async (req, s, { id }) => {
  const { questions } = await parseBody(req, body);
  if (!(await db.questionBank.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Question bank not found");
  return db.$transaction(async (tx) => {
    const r = await tx.question.createMany({ data: questions.map((q) => ({ ...q, bankId: id, collegeId: s.collegeId })) });
    await audit(s, { action: "questions.add", entity: "QuestionBank", entityId: id, after: { added: r.count } }, tx);
    return { added: r.count };
  });
});

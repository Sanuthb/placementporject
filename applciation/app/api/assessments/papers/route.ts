import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { PaperQuestion } from "@/lib/assessments";

const create = z.object({
  title: z.string().trim().min(3).max(200), instructions: z.string().trim().max(5000).optional(), durationMin: z.number().int().min(5).max(480), shuffle: z.boolean().default(true), passPercent: z.number().int().min(1).max(100).optional(),
  proctoring: z.object({ requireFullscreen: z.boolean().default(false), maxViolations: z.number().int().min(0).max(50).default(3) }).default({ requireFullscreen: false, maxViolations: 3 }),
  questionIds: z.array(z.uuid()).max(300).optional(), random: z.object({ bankId: z.uuid(), count: z.number().int().min(1).max(300), tag: z.string().trim().optional() }).optional(),
}).refine((v) => v.questionIds?.length || v.random, { message: "Give questionIds or a random pick from a bank", path: ["questionIds"] });
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

export const GET = route(R, async (_req, s) => (await db.assessmentPaper.findMany({ where: { collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 100 })).map((p) => ({ id: p.id, title: p.title, durationMin: p.durationMin, questions: (p.questions as unknown[]).length, createdAt: p.createdAt })));

/** Builds a paper from chosen questions or a random pick from a bank. Questions are copied into the paper, so later edits to the bank never change a paper already scheduled. */
export const POST = route(R, async (req, s) => {
  const { questionIds, random, ...b } = await parseBody(req, create);
  let rows = questionIds?.length
    ? await db.question.findMany({ where: { id: { in: questionIds }, collegeId: s.collegeId } })
    : await db.question.findMany({ where: { bankId: random!.bankId, collegeId: s.collegeId, ...(random!.tag ? { tags: { has: random!.tag } } : {}) } });
  if (questionIds?.length && rows.length !== new Set(questionIds).size) throw badRequest("Some questions were not found");
  if (random) {
    if (rows.length < random.count) throw badRequest(`Only ${rows.length} matching questions in that bank`);
    rows = rows.map((r) => [Math.random(), r] as const).sort((a, c) => a[0] - c[0]).slice(0, random.count).map(([, r]) => r);
  }
  const snapshot: PaperQuestion[] = rows.map((q) => ({ id: q.id, text: q.text, options: q.options as string[], correct: q.correct, marks: q.marks, negativeMarks: Number(q.negativeMarks), explanation: q.explanation }));
  return db.$transaction(async (tx) => {
    const p = await tx.assessmentPaper.create({ data: { ...b, collegeId: s.collegeId, createdById: s.userId, questions: snapshot } });
    await audit(s, { action: "paper.create", entity: "AssessmentPaper", entityId: p.id, after: { title: p.title, questions: snapshot.length } }, tx);
    return { id: p.id, title: p.title, questions: snapshot.length, totalMarks: snapshot.reduce((a, q) => a + q.marks, 0) };
  });
});

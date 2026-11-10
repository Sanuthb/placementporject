import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { PaperQuestion } from "@/lib/assessments";
import { AssessmentCategory } from "@/generated/prisma/client";

const pick = z.object({ bankId: z.uuid(), count: z.number().int().min(1).max(300), tag: z.string().trim().optional(), difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(), section: z.string().trim().optional(), type: z.string().trim().optional() });
const create = z.object({
  title: z.string().trim().min(3).max(200), category: z.enum(AssessmentCategory).default("OTHER"), instructions: z.string().trim().max(5000).optional(), durationMin: z.number().int().min(5).max(480), shuffle: z.boolean().default(true), passPercent: z.number().int().min(1).max(100).optional(),
  proctoring: z.object({ requireFullscreen: z.boolean().default(false), maxViolations: z.number().int().min(0).max(50).default(3) }).default({ requireFullscreen: false, maxViolations: 3 }),
  jdId: z.uuid().optional(), testKind: z.string().trim().max(60).optional(), sectionCutoffs: z.record(z.string(), z.number().int().min(1).max(100)).default({}),
  questionIds: z.array(z.uuid()).max(300).optional(), random: pick.omit({ difficulty: true, section: true, type: true }).optional(), picks: z.array(pick).max(12).optional(),
}).refine((v) => v.questionIds?.length || v.random || v.picks?.length, { message: "Give questionIds or a random pick from a bank", path: ["questionIds"] });
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

export const GET = route(R, async (_req, s) => (await db.assessmentPaper.findMany({ where: { collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 100 })).map((p) => ({ id: p.id, title: p.title, category: p.category, durationMin: p.durationMin, questions: (p.questions as unknown[]).length, createdAt: p.createdAt })));

/**
 * Builds a paper from chosen questions, a random pick from a bank, or several picks (each from a bank, optionally by topic, difficulty, section or type). Questions are copied
 * into the paper with everything the engine needs, so later edits to the bank never change a paper already scheduled. A paper can name the job it prepares for, a test
 * category, and a minimum per section on top of the overall pass mark.
 */
export const POST = route(R, async (req, s) => {
  const { questionIds, random, picks, ...b } = await parseBody(req, create);
  if (b.jdId && !(await db.jobDescription.findFirst({ where: { id: b.jdId, collegeId: s.collegeId }, select: { id: true } }))) throw badRequest("Job description not found");
  const sample = <T,>(xs: T[], n: number) => xs.map((r) => [Math.random(), r] as const).sort((a, c) => a[0] - c[0]).slice(0, n).map(([, r]) => r);
  let rows: Awaited<ReturnType<typeof db.question.findMany>> = [];
  if (questionIds?.length) {
    rows = await db.question.findMany({ where: { id: { in: questionIds }, collegeId: s.collegeId } });
    if (rows.length !== new Set(questionIds).size) throw badRequest("Some questions were not found");
  } else {
    const wanted = picks?.length ? picks : [random!];
    const seen = new Set<string>();
    for (const p of wanted) {
      const full = p as z.infer<typeof pick>;
      const pool = (await db.question.findMany({ where: { bankId: p.bankId, collegeId: s.collegeId, ...(p.tag ? { tags: { has: p.tag } } : {}), ...(full.difficulty ? { difficulty: full.difficulty } : {}), ...(full.section ? { section: full.section } : {}), ...(full.type ? { type: full.type } : {}) } })).filter((q) => !seen.has(q.id));
      if (pool.length < p.count) throw badRequest(`Only ${pool.length} matching questions are left in that bank for a pick of ${p.count}`);
      for (const q of sample(pool, p.count)) { seen.add(q.id); rows.push(q); }
    }
  }
  const snapshot: PaperQuestion[] = rows.map((q) => ({ id: q.id, text: q.text, options: q.options as string[], correct: q.correct, marks: q.marks, negativeMarks: Number(q.negativeMarks), explanation: q.explanation, type: q.type as PaperQuestion["type"], context: q.context, section: q.section, tags: q.tags, difficulty: q.difficulty, acceptedAnswers: q.acceptedAnswers, modelAnswer: q.modelAnswer, rubric: q.rubric, language: q.language }));
  return db.$transaction(async (tx) => {
    const p = await tx.assessmentPaper.create({ data: { ...b, collegeId: s.collegeId, createdById: s.userId, questions: snapshot } });
    await audit(s, { action: "paper.create", entity: "AssessmentPaper", entityId: p.id, after: { title: p.title, questions: snapshot.length } }, tx);
    return { id: p.id, title: p.title, questions: snapshot.length, totalMarks: snapshot.reduce((a, q) => a + q.marks, 0) };
  });
});

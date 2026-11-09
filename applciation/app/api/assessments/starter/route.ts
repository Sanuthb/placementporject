import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { PaperQuestion } from "@/lib/assessments";
import { STARTER_BANKS, starterByKey } from "@/lib/starterBanks";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

/** The ready-made banks and whether this college already has each one. */
export const GET = route(R, async (_req, s) => {
  const names = new Set((await db.questionBank.findMany({ where: { collegeId: s.collegeId }, select: { name: true } })).map((b) => b.name));
  return STARTER_BANKS.map((b) => ({ key: b.key, name: b.name, category: b.category, description: b.description, questions: b.questions.length, durationMin: b.durationMin, imported: names.has(b.name) }));
});

const body = z.object({ keys: z.array(z.string()).min(1).max(20) });

/**
 * Import ready-made banks. Each becomes a normal question bank (editable, extendable) plus a ready paper tagged with its category.
 * A bank the college already has (same name) is skipped, never overwritten, so staff edits are safe.
 */
export const POST = route(R, async (req, s) => {
  const { keys } = await parseBody(req, body);
  const picks = keys.map((k) => starterByKey(k) ?? (() => { throw badRequest(`Unknown starter bank "${k}"`); })());
  return db.$transaction(async (tx) => {
    const out: { key: string; imported: boolean; questions: number }[] = [];
    for (const b of picks) {
      if (await tx.questionBank.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name: b.name } }, select: { id: true } })) { out.push({ key: b.key, imported: false, questions: 0 }); continue; }
      const bank = await tx.questionBank.create({ data: { collegeId: s.collegeId, name: b.name, topic: b.topic } });
      const rows = await Promise.all(b.questions.map((x) => tx.question.create({ data: { collegeId: s.collegeId, bankId: bank.id, text: x.text, options: x.options, correct: [x.answer], marks: 1, negativeMarks: 0, explanation: x.explanation, difficulty: x.difficulty, tags: [x.tag] } })));
      const snapshot: PaperQuestion[] = rows.map((r) => ({ id: r.id, text: r.text, options: r.options as string[], correct: r.correct, marks: r.marks, negativeMarks: 0, explanation: r.explanation }));
      await tx.assessmentPaper.create({ data: { collegeId: s.collegeId, title: b.paperTitle, category: b.category, instructions: "Choose the best answer for each question. Each question has one correct answer. There is no negative marking.", durationMin: b.durationMin, questions: snapshot, shuffle: true, proctoring: { requireFullscreen: false, maxViolations: 3 }, passPercent: b.passPercent, createdById: s.userId } });
      await audit(s, { action: "assessment.starter.import", entity: "QuestionBank", entityId: bank.id, after: { key: b.key, questions: rows.length } }, tx);
      out.push({ key: b.key, imported: true, questions: rows.length });
    }
    return out;
  });
});

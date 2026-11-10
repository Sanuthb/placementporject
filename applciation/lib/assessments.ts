import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import type { AssessmentAttempt, Prisma } from "@/generated/prisma/client";

import { QTYPES, SECTIONS, scoreAttempt, type Answer, type Marks, type PaperQuestion } from "@/lib/mockTest";
export type { PaperQuestion };
export type Proctoring = { requireFullscreen: boolean; maxViolations: number };
export const paperQuestions = (json: unknown) => json as PaperQuestion[];
export const proctoringOf = (json: unknown) => json as Proctoring;

const sectionKeys = SECTIONS.map(([k]) => k) as [string, ...string[]];
const base = {
  text: z.string().trim().min(5).max(2000), marks: z.number().int().min(1).max(100).default(1), negativeMarks: z.number().min(0).max(100).default(0), explanation: z.string().trim().max(2000).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(), tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  context: z.string().trim().max(6000).optional(), section: z.enum(sectionKeys).optional(),
};
/** A question of any type. Choice questions need options and the position(s) of the right one(s); a fill-in-the-blank needs the answers that count; descriptive, coding and SQL questions need a model answer or what to look for. */
export const questionInput = z.object({
  ...base, type: z.enum(["CHOICE", ...QTYPES]).default("CHOICE"),
  options: z.array(z.string().trim().min(1).max(500)).max(8).default([]), correct: z.array(z.number().int().min(0)).default([]),
  acceptedAnswers: z.array(z.string().trim().min(1).max(200)).max(20).default([]), modelAnswer: z.string().trim().max(6000).optional(), rubric: z.string().trim().max(3000).optional(), language: z.string().trim().max(30).optional(),
}).superRefine((q, ctx) => {
  const t = q.type;
  const choice = t === "CHOICE" || t === "SINGLE" || t === "MULTIPLE" || t === "TRUE_FALSE";
  if (choice) {
    const need = t === "TRUE_FALSE" ? 2 : 2;
    if (q.options.length < need) ctx.addIssue({ code: "custom", path: ["options"], message: "Give at least two options" });
    if (t === "TRUE_FALSE" && q.options.length !== 2) ctx.addIssue({ code: "custom", path: ["options"], message: "True or false has exactly two options" });
    if (q.correct.length < 1 || !q.correct.every((c) => c < q.options.length) || new Set(q.correct).size !== q.correct.length) ctx.addIssue({ code: "custom", path: ["correct"], message: "correct must be distinct valid option positions" });
    if ((t === "SINGLE" || t === "TRUE_FALSE") && q.correct.length !== 1) ctx.addIssue({ code: "custom", path: ["correct"], message: "A single-choice question has exactly one right answer" });
    if (t === "MULTIPLE" && q.correct.length < 2) ctx.addIssue({ code: "custom", path: ["correct"], message: "A multiple-choice question has two or more right answers" });
  } else if (t === "FILL_BLANK") { if (q.acceptedAnswers.length === 0) ctx.addIssue({ code: "custom", path: ["acceptedAnswers"], message: "Give at least one accepted answer" }); }
  else if (!q.modelAnswer && !q.rubric) ctx.addIssue({ code: "custom", path: ["modelAnswer"], message: "Give a model answer or what to look for, so answers can be marked" });
});

const GRACE_MS = 10_000;

/** Marks of an attempt so far: objective questions at once, open ones from `marks` (provisional until every open answer has one). Kept under the old name for callers that only need the totals. */
export function scoreAnswers(qs: PaperQuestion[], answers: Record<string, Answer>, marks: Marks = {}) {
  const r = scoreAttempt(qs, answers, marks);
  return { score: r.score, max: r.max, pending: r.pending };
}

/** Same student always sees the same order; different students see different orders. */
export function orderFor(qs: PaperQuestion[], seed: string, shuffle: boolean) {
  if (!shuffle) return qs;
  const key = (id: string) => createHash("sha1").update(seed + id).digest("hex");
  return [...qs].sort((a, b) => key(a.id).localeCompare(key(b.id)));
}

/** What a student sends: the chosen option positions, or text for a fill-in-the-blank, descriptive, coding or SQL answer. */
export const answersSchema = z.record(z.string(), z.union([z.array(z.number().int().min(0).max(7)).max(8), z.string().max(8000)]));

/**
 * Closes an attempt with whatever answers were saved. If an open answer (descriptive, coding, SQL) is waiting for a mark the attempt is PENDING review and its score
 * is provisional until it is marked.
 */
export async function finalize(tx: Prisma.TransactionClient | typeof db, a: AssessmentAttempt, status: "SUBMITTED" | "AUTO_SUBMITTED", qs: PaperQuestion[]) {
  const answers = a.answers as Record<string, Answer>;
  const { score, max, pending } = scoreAnswers(qs, answers, (a.marks ?? {}) as Marks);
  const r = await tx.assessmentAttempt.updateMany({ where: { id: a.id, status: "IN_PROGRESS" }, data: { status, submittedAt: new Date(), score, maxScore: max, reviewStatus: pending > 0 ? "PENDING" : "NONE" } });
  return r.count === 1 ? { score, max, pending } : null;
}

/** Throws TIME_UP (after auto-submitting) if the attempt's time has run out. */
export async function enforceTime(a: AssessmentAttempt, qs: PaperQuestion[]) {
  if (a.status !== "IN_PROGRESS") throw new ApiError(409, "ALREADY_SUBMITTED", "This attempt is already submitted");
  if (Date.now() > a.deadlineAt.getTime() + GRACE_MS) {
    await finalize(db, a, "AUTO_SUBMITTED", qs);
    throw new ApiError(409, "TIME_UP", "Time is up. Your saved answers were submitted");
  }
}

/** Auto-submits attempts whose time ran out without the student returning, so results are complete. */
export async function finalizeOverdue(scheduleId: string, qs: PaperQuestion[]) {
  const overdue = await db.assessmentAttempt.findMany({ where: { scheduleId, status: "IN_PROGRESS", deadlineAt: { lt: new Date(Date.now() - GRACE_MS) } } });
  for (const a of overdue) await finalize(db, a, "AUTO_SUBMITTED", qs);
  return overdue.length;
}

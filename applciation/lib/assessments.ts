import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import type { AssessmentAttempt, Prisma } from "@/generated/prisma/client";

export type PaperQuestion = { id: string; text: string; options: string[]; correct: number[]; marks: number; negativeMarks: number; explanation?: string | null };
export type Proctoring = { requireFullscreen: boolean; maxViolations: number };
export const paperQuestions = (json: unknown) => json as PaperQuestion[];
export const proctoringOf = (json: unknown) => json as Proctoring;

export const questionInput = z.object({
  text: z.string().trim().min(5).max(2000), options: z.array(z.string().trim().min(1).max(500)).min(2).max(8), correct: z.array(z.number().int().min(0)).min(1),
  marks: z.number().int().min(1).max(100).default(1), negativeMarks: z.number().min(0).max(100).default(0), explanation: z.string().trim().max(2000).optional(), difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(), tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
}).refine((q) => q.correct.every((c) => c < q.options.length) && new Set(q.correct).size === q.correct.length, { message: "correct must be distinct valid option positions", path: ["correct"] });

const GRACE_MS = 10_000;
const same = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** All-or-nothing per question: the selected options must match the correct set exactly. Wrong answers cost negative marks; skipped ones cost nothing. */
export function scoreAnswers(qs: PaperQuestion[], answers: Record<string, number[]>) {
  let score = 0, max = 0;
  for (const q of qs) {
    max += q.marks;
    const given = answers[q.id];
    if (!given?.length) continue;
    score += same(given, q.correct) ? q.marks : -q.negativeMarks;
  }
  return { score: Math.max(0, Math.round(score * 100) / 100), max };
}

/** Same student always sees the same order; different students see different orders. */
export function orderFor(qs: PaperQuestion[], seed: string, shuffle: boolean) {
  if (!shuffle) return qs;
  const key = (id: string) => createHash("sha1").update(seed + id).digest("hex");
  return [...qs].sort((a, b) => key(a.id).localeCompare(key(b.id)));
}

export const answersSchema = z.record(z.string(), z.array(z.number().int().min(0).max(7)).max(8));

/** Closes an attempt with whatever answers were saved. */
export async function finalize(tx: Prisma.TransactionClient | typeof db, a: AssessmentAttempt, status: "SUBMITTED" | "AUTO_SUBMITTED", qs: PaperQuestion[]) {
  const { score, max } = scoreAnswers(qs, a.answers as Record<string, number[]>);
  const r = await tx.assessmentAttempt.updateMany({ where: { id: a.id, status: "IN_PROGRESS" }, data: { status, submittedAt: new Date(), score, maxScore: max } });
  return r.count === 1 ? { score, max } : null;
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

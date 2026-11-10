import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { DIFFICULTIES, DURATIONS, KINDS, LANGUAGES, type Kind } from "@/lib/discussionEngine";
import { assignedTo } from "@/lib/interviewEngine";
import { startSession } from "@/lib/discussionService";

const body = z.object({
  kind: z.enum(KINDS.map(([k]) => k) as [Kind, ...Kind[]]).default("GD"), topic: z.string().trim().min(8).max(240).optional(), stance: z.enum(["FOR", "AGAINST"]).optional(),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"), language: z.enum(LANGUAGES).default("English"), durationMin: z.number().int().refine((n) => (DURATIONS as readonly number[]).includes(n), "Choose 5, 10, 15 or 20 minutes").default(10),
  participants: z.number().int().min(2).max(4).optional(), assignmentId: z.uuid().optional(), voiceConsent: z.boolean().default(false),
}).refine((v) => v.assignmentId || v.topic, { message: "Choose a topic" });

/** My discussion sessions. */
export const GET = studentRoute({ module: "STUDENT_PREP" }, (_req, me) =>
  db.discussionSession.findMany({ where: { studentId: me.studentId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, kind: true, topic: true, status: true, createdAt: true, feedback: true, assignmentId: true } })
    .then((rows) => rows.map(({ feedback, ...r }) => ({ ...r, status: r.status === "FINISHING" ? "IN_PROGRESS" : r.status, score: (feedback as { score?: number } | null)?.score ?? null }))),
);

/** Start a session. Self-started ones are private. One from an assignment takes its settings from the placement office and is visible to staff. */
export const POST = studentRoute({ limit: { name: "discussion-start", max: 10, windowSec: 3600 }, module: "STUDENT_PREP" }, async (req, me) => {
  const b = await parseBody(req, body);
  let s = { kind: b.kind, topic: b.topic ?? "", stance: b.stance, difficulty: b.difficulty as string, language: b.language as string, durationMin: b.durationMin, participants: b.participants, assignmentId: null as string | null };
  if (b.assignmentId) {
    const a = await db.discussionAssignment.findFirst({ where: { id: b.assignmentId, collegeId: me.collegeId } });
    if (!a || !assignedTo({ ...a, targetStudentIds: [] }, me) || (a.dueAt && a.dueAt < new Date())) throw notFound("Session not found");
    s = { kind: a.kind as Kind, topic: a.topic, stance: b.stance, difficulty: a.difficulty, language: a.language, durationMin: a.durationMin, participants: b.participants, assignmentId: a.id };
  }
  return startSession(me, { ...s, voiceConsent: b.voiceConsent });
});

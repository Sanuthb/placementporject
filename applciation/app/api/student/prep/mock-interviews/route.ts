import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { DIFFICULTIES, DURATIONS, INTERVIEW_TYPES, LANGUAGES, assignedTo, questionCountFor, type InterviewType } from "@/lib/interviewEngine";
import { configOf } from "@/lib/interviewService";
import { nextQuestion } from "@/lib/mockInterview";

const body = z.object({
  role: z.string().trim().min(2).max(100).optional(), topic: z.string().trim().min(2).max(200).optional(),
  type: z.enum(INTERVIEW_TYPES.map(([k]) => k) as [InterviewType, ...InterviewType[]]).default("TECHNICAL"), mode: z.enum(["LEARNING", "ASSESSMENT"]).default("LEARNING"),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"), language: z.enum(LANGUAGES).default("English"), durationMin: z.number().int().refine((n) => (DURATIONS as readonly number[]).includes(n), "Choose 10, 15, 20, 30 or 45 minutes").default(20),
  assignmentId: z.uuid().optional(), voiceConsent: z.boolean().default(false),
}).refine((v) => v.assignmentId || (v.role && v.topic), { message: "Give a role and a topic" });

/** My past and current practice interviews. */
export const GET = studentRoute({ module: "STUDENT_PREP" }, (_req, me) =>
  db.mockInterview.findMany({ where: { studentId: me.studentId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, role: true, topic: true, status: true, createdAt: true, feedback: true, type: true, mode: true, assignmentId: true } })
    .then((rows) => rows.map(({ feedback, ...r }) => ({ ...r, score: (feedback as { score?: number } | null)?.score ?? null }))),
);

/**
 * Start an interview. Self-started ones are private to the student. One from an assignment takes its settings (type, mode, difficulty, length, language, job) from the placement
 * office and its report is visible to staff. The interviewer asks the first question straight away.
 */
export const POST = studentRoute({ limit: { name: "mock-interview", max: 10, windowSec: 3600 }, module: "STUDENT_PREP" }, async (req, me) => {
  const b = await parseBody(req, body);
  let cfg = { role: b.role ?? "", topic: b.topic ?? "", type: b.type, mode: b.mode, difficulty: b.difficulty, language: b.language as string, durationMin: b.durationMin, jdId: null as string | null, assignmentId: null as string | null };
  if (b.assignmentId) {
    const a = await db.interviewAssignment.findFirst({ where: { id: b.assignmentId, collegeId: me.collegeId } });
    if (!a || !assignedTo(a, me) || (a.dueAt && a.dueAt < new Date())) throw notFound("Interview not found");
    cfg = { role: a.role, topic: a.topic, type: a.type as InterviewType, mode: a.mode as "LEARNING" | "ASSESSMENT", difficulty: a.difficulty as (typeof DIFFICULTIES)[number], language: a.language, durationMin: a.durationMin, jdId: a.jdId, assignmentId: a.id };
  }
  const data = { collegeId: me.collegeId, studentId: me.studentId, ...cfg, questionCount: questionCountFor(cfg.durationMin), voiceConsentAt: b.voiceConsent ? new Date() : null };
  const draft = { ...data, id: "", status: "IN_PROGRESS", transcript: [], feedback: null, createdAt: new Date(), completedAt: null, voiceUsed: false } as Parameters<typeof configOf>[0];
  const first = await nextQuestion(await configOf(draft), []);
  return db.mockInterview.create({ data: { ...data, transcript: [{ role: "interviewer", text: first }] }, select: { id: true } });
});

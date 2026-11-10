import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { cleanFeedback } from "@/lib/interviewEngine";
import { comparisonFor } from "@/lib/interviewService";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

/** One assigned interview in full. A student's own practice interviews (not assigned) are private and are never found here. Opening one is recorded. */
export const GET = route<{ interviewId: string }>(R, async (_req, s, { interviewId }) => {
  const m = await db.mockInterview.findFirst({ where: { id: interviewId, collegeId: s.collegeId, assignmentId: { not: null } }, include: { student: { select: { name: true, enrollmentNo: true } }, assignment: { select: { title: true } } } });
  if (!m) throw notFound("Interview not found");
  await audit(s, { action: "interview.view", entity: "MockInterview", entityId: m.id });
  return { id: m.id, student: m.student, title: m.assignment?.title, role: m.role, topic: m.topic, type: m.type, mode: m.mode, difficulty: m.difficulty, language: m.language, durationMin: m.durationMin, status: m.status, transcript: m.transcript, feedback: cleanFeedback(m.feedback), comparison: await comparisonFor(m), startedAt: m.createdAt, completedAt: m.completedAt, voiceUsed: m.voiceUsed };
});

import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { weakCategories, cleanFeedback } from "@/lib/interviewEngine";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

/** Every interview students took from this assignment: who, how far, the score, the categories, and the weakest ones. Transcripts are opened one at a time. */
export const GET = route<{ id: string }>(R, async (_req, s, { id }) => {
  const a = await db.interviewAssignment.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!a) throw notFound("Assignment not found");
  const rows = await db.mockInterview.findMany({ where: { assignmentId: id, collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 500, include: { student: { select: { name: true, enrollmentNo: true } } } });
  const items = rows.map((m) => { const f = cleanFeedback(m.feedback); return { id: m.id, student: m.student, status: m.status === "FINISHING" ? "IN_PROGRESS" : m.status, startedAt: m.createdAt, completedAt: m.completedAt, voiceUsed: m.voiceUsed, score: f?.score ?? null, weak: f ? weakCategories(f).map((c) => c.label) : [] }; });
  const scores = items.flatMap((i) => (i.score === null ? [] : [i.score]));
  return { assignment: a, interviews: items, completed: scores.length, averageScore: scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : null };
});

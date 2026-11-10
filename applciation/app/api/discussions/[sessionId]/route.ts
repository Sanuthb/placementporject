import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { comparisonFor, view } from "@/lib/discussionService";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

/** One assigned session in full. A student's own practice sessions (not assigned) are private and are never found here. Opening one is recorded. */
export const GET = route<{ sessionId: string }>(R, async (_req, s, { sessionId }) => {
  const m = await db.discussionSession.findFirst({ where: { id: sessionId, collegeId: s.collegeId, assignmentId: { not: null } }, include: { student: { select: { name: true, enrollmentNo: true } }, assignment: { select: { title: true } } } });
  if (!m) throw notFound("Session not found");
  await audit(s, { action: "discussion.view", entity: "DiscussionSession", entityId: m.id });
  return { ...view(m), student: m.student, title: m.assignment?.title, comparison: await comparisonFor(m) };
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { forbidden, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { isFacultyOnly } from "@/lib/auth/session";
import { reviewableStudent } from "@/lib/roadmapAccess";
import { recordEvent } from "@/lib/roadmapService";

const body = z.object({ body: z.string().trim().min(2, "Write a comment").max(1000) });

/** A note to the student on their roadmap. From their mentor, or from placement staff; a faculty member who is not their mentor can read but not comment. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY"], module: "ONBOARDING", limit: { name: "roadmap-comment", max: 100, windowSec: 3600 } }, async (req, s, { id }) => {
  const st = await reviewableStudent(s, id);
  const isMentor = st.mentorId === s.userId;
  if (isFacultyOnly(s) && !isMentor) throw forbidden("Only the student's mentor can comment on their roadmap");
  const roadmap = await db.studentRoadmap.findUnique({ where: { studentId: id } });
  if (!roadmap) throw notFound("The student has not opened their roadmap yet");
  const { body: text } = await parseBody(req, body);
  const me = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { name: true } });
  const c = await db.$transaction(async (tx) => {
    const row = await tx.roadmapComment.create({ data: { roadmapId: roadmap.id, collegeId: s.collegeId, authorId: s.userId, authorName: me.name, authorRole: isMentor ? "MENTOR" : "STAFF", body: text } });
    await recordEvent(tx, roadmap, { actor: isMentor ? "MENTOR" : "STAFF", actorId: s.userId }, "comment.added", { commentId: row.id });
    return row;
  });
  await notifyStudent(s.collegeId, id, { type: "roadmap.comment", title: `${me.name} left a note on your career roadmap`, link: "/student/roadmap" }).catch(() => undefined);
  return { id: c.id };
});

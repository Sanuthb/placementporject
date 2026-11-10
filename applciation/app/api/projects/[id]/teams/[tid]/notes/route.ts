import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { PROJ_STAFF, teamOf } from "@/lib/projectService";

/** A note from the guide or staff on the team's timeline. The members are told. */
export const POST = route<{ id: string; tid: string }>(PROJ_STAFF, async (req, s, { id, tid }) => {
  const { project } = await teamOf(s, id, tid);
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(3).max(3000) }));
  const u = await db.projectUpdate.create({ data: { teamId: tid, authorUserId: s.userId, text } });
  const ms = await db.projectMember.findMany({ where: { teamId: tid }, select: { studentId: true } });
  await Promise.all(ms.map((m) => notifyStudent(s.collegeId, m.studentId, { type: "project.note", title: `New feedback on "${project.title}"`, body: text.slice(0, 140), link: `/student/projects/team/${tid}` })));
  return { id: u.id };
});

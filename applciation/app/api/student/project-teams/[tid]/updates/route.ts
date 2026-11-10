import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { notifyUserIds } from "@/lib/projectNotify";
import { myTeam } from "@/lib/projectStudent";

/** A progress update from me, on the team's timeline. Also allowed after submitting, to answer feedback. */
export const POST = studentRoute<{ tid: string }>({ module: "LEARNING", limit: { name: "project-write", max: 100, windowSec: 3600 } }, async (req, me, { tid }) => {
  const { team, project } = await myTeam(me, tid);
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(3).max(3000) }));
  const u = await db.projectUpdate.create({ data: { teamId: tid, studentId: me.studentId, text } });
  if (project.guideId) await notifyUserIds(me.collegeId, [project.guideId], { type: "project.update", title: `${me.name} posted an update in "${project.title}" (${team.name})`, body: text.slice(0, 140), link: `/staff/projects/${project.id}/teams/${tid}` });
  return { id: u.id };
});

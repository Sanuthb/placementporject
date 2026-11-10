import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { workableTeam } from "@/lib/projectStudent";

export const taskFields = z.object({ title: z.string().trim().min(3).max(200), description: z.string().trim().max(2000).nullish(), assigneeId: z.uuid().nullish(), milestoneId: z.uuid().nullish(), dueAt: z.coerce.date().nullish() });

/** Any member adds a task and may assign it to a teammate. */
export const POST = studentRoute<{ tid: string }>({ module: "LEARNING", limit: { name: "project-write", max: 200, windowSec: 3600 } }, async (req, me, { tid }) => {
  await workableTeam(me, tid);
  const b = await parseBody(req, taskFields);
  if (b.assigneeId && !(await db.projectMember.findFirst({ where: { teamId: tid, studentId: b.assigneeId }, select: { id: true } }))) throw badRequest("The task can only go to a member of the team");
  if (b.milestoneId && !(await db.projectMilestone.findFirst({ where: { id: b.milestoneId, teamId: tid }, select: { id: true } }))) throw badRequest("Milestone not found");
  return db.projectTask.create({ data: { ...b, teamId: tid, createdByStudentId: me.studentId } });
});

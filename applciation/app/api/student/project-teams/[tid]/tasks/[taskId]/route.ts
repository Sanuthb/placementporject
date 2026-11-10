import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { workableTeam } from "@/lib/projectStudent";
import { taskFields } from "../route";

type P = { tid: string; taskId: string };
async function mine(tid: string, taskId: string) {
  const t = await db.projectTask.findFirst({ where: { id: taskId, teamId: tid } });
  if (!t) throw notFound("Task not found");
  return t;
}

/** Change a task or move it (TODO, IN_PROGRESS, DONE). Finishing a task counts as work by whoever it is assigned to (or by the person who finishes it when nobody is). */
export const PATCH = studentRoute<P>({ module: "LEARNING", limit: { name: "project-write", max: 400, windowSec: 3600 } }, async (req, me, { tid, taskId }) => {
  await workableTeam(me, tid);
  const t = await mine(tid, taskId);
  const b = await parseBody(req, taskFields.partial().extend({ status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional() }));
  if (b.assigneeId && !(await db.projectMember.findFirst({ where: { teamId: tid, studentId: b.assigneeId }, select: { id: true } }))) throw badRequest("The task can only go to a member of the team");
  const done = b.status === "DONE" && t.status !== "DONE";
  return db.projectTask.update({ where: { id: taskId }, data: { ...b, ...(done ? { completedAt: new Date(), ...(t.assigneeId || b.assigneeId ? {} : { assigneeId: me.studentId }) } : b.status && b.status !== "DONE" ? { completedAt: null } : {}) } });
});

export const DELETE = studentRoute<P>({ module: "LEARNING" }, async (_req, me, { tid, taskId }) => {
  await workableTeam(me, tid);
  await mine(tid, taskId);
  await db.projectTask.delete({ where: { id: taskId } });
  return { ok: true };
});

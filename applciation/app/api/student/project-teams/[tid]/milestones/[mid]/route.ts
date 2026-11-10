import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { workableTeam } from "@/lib/projectStudent";

/** Any member marks a milestone done (or not done again), or changes its title or date. */
export const PATCH = studentRoute<{ tid: string; mid: string }>({ module: "LEARNING", limit: { name: "project-write", max: 200, windowSec: 3600 } }, async (req, me, { tid, mid }) => {
  await workableTeam(me, tid);
  if (!(await db.projectMilestone.findFirst({ where: { id: mid, teamId: tid }, select: { id: true } }))) throw notFound("Milestone not found");
  const b = await parseBody(req, z.object({ done: z.boolean().optional(), title: z.string().trim().min(2).max(200).optional(), dueAt: z.coerce.date().nullish() }));
  return db.projectMilestone.update({ where: { id: mid }, data: { ...(b.title ? { title: b.title } : {}), ...(b.dueAt !== undefined ? { dueAt: b.dueAt } : {}), ...(b.done !== undefined ? { doneAt: b.done ? new Date() : null } : {}) } });
});

import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { forbidden } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { workableTeam } from "@/lib/projectStudent";

/** The leader adds a milestone to the team's plan. */
export const POST = studentRoute<{ tid: string }>({ module: "LEARNING", limit: { name: "project-write", max: 100, windowSec: 3600 } }, async (req, me, { tid }) => {
  const { isLeader } = await workableTeam(me, tid);
  if (!isLeader) throw forbidden("Only the team leader can add milestones");
  const b = await parseBody(req, z.object({ title: z.string().trim().min(2).max(200), dueAt: z.coerce.date().nullish() }));
  const last = await db.projectMilestone.aggregate({ where: { teamId: tid }, _max: { sortOrder: true } });
  return db.projectMilestone.create({ data: { teamId: tid, title: b.title, dueAt: b.dueAt, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
});

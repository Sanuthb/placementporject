import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { myTeam } from "@/lib/projectStudent";

/** My own details in the team: my GitHub username (used to match commits to me), my role, and whether the project shows in my portfolio. */
export const PATCH = studentRoute<{ tid: string }>({ module: "LEARNING" }, async (req, me, { tid }) => {
  const { member } = await myTeam(me, tid);
  const b = await parseBody(req, z.object({ githubUsername: z.string().trim().regex(/^[A-Za-z0-9-]{1,39}$/, "Not a valid GitHub username").nullish(), role: z.string().trim().max(60).nullish(), showInPortfolio: z.boolean().optional() }));
  await db.projectMember.update({ where: { id: member.id }, data: { ...(b.githubUsername !== undefined ? { githubUsername: b.githubUsername || null } : {}), ...(b.role !== undefined ? { role: b.role || null } : {}), ...(b.showInPortfolio !== undefined ? { showInPortfolio: b.showInPortfolio } : {}) } });
  return { ok: true };
});

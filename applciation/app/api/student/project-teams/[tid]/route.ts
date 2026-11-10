import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { parseGithub } from "@/lib/projects";
import { teamView } from "@/lib/projectService";
import { leaderOnly, myTeam } from "@/lib/projectStudent";

type P = { tid: string };

/** My team's workspace. Reviews and scores appear only once the result is published. */
export const GET = studentRoute<P>({ module: "LEARNING" }, async (_req, me, { tid }) => {
  await myTeam(me, tid);
  return teamView(tid, "student", me.studentId);
});

const patch = z.object({ name: z.string().trim().min(2).max(80).optional(), summary: z.string().trim().max(4000).nullish(), repoUrl: z.string().trim().max(300).nullish() });

/** The leader changes the team's name, its summary (shown in the portfolio) or its GitHub repository link. */
export const PATCH = studentRoute<P>({ module: "LEARNING", limit: { name: "project-write", max: 200, windowSec: 3600 } }, async (req, me, { tid }) => {
  const { team, isLeader } = await myTeam(me, tid);
  leaderOnly(isLeader);
  if (team.status === "EVALUATED") throw badRequest("The result is published; the team can no longer change");
  const b = await parseBody(req, patch);
  if (b.repoUrl) {
    if (!parseGithub(b.repoUrl)) throw badRequest("Use a GitHub repository link such as https://github.com/owner/name");
  }
  await db.projectTeam.update({ where: { id: tid }, data: { ...(b.name ? { name: b.name } : {}), ...(b.summary !== undefined ? { summary: b.summary || null } : {}), ...(b.repoUrl !== undefined ? { repoUrl: b.repoUrl || null, ...(b.repoUrl !== team.repoUrl ? { repoStats: Prisma.DbNull, repoSyncedAt: null } : {}) } : {}) } });
  return teamView(tid, "student", me.studentId);
});

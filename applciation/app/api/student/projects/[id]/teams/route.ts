import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { canJoin, teamProblems } from "@/lib/projects";
import { startTeam } from "@/lib/projectTeams";
import { takableProject } from "@/lib/projectStudent";

/**
 * Start a team for a project (I become its leader; an individual project's team starts at once), or join a team that is still forming (send teamId).
 * A team starts when the leader presses start and it meets the project's rules.
 */
export const POST = studentRoute<{ id: string }>({ module: "LEARNING", limit: { name: "project-team", max: 30, windowSec: 3600 } }, async (req, me, { id }) => {
  const p = await takableProject(me, id);
  const b = await parseBody(req, z.object({ teamId: z.uuid().optional(), name: z.string().trim().min(2).max(80).optional() }));
  if (b.teamId) {
    const t = await db.projectTeam.findFirst({ where: { id: b.teamId, projectId: id }, include: { members: true } });
    if (!t || t.status !== "FORMING") throw notFound("Team not found");
    if (!canJoin(p, t.members.length)) throw badRequest("This team is full");
    try { await db.projectMember.create({ data: { teamId: t.id, projectId: id, studentId: me.studentId, collegeId: me.collegeId } }); } catch (e) { if ((e as { code?: string }).code === "P2002") throw badRequest("You are already in a team for this project"); throw e; }
    return { teamId: t.id };
  }
  if (p.maxTeams && (await db.projectTeam.count({ where: { projectId: id } })) >= p.maxTeams) throw badRequest("The project already has the most teams it allows");
  const t = await db.$transaction(async (tx) => {
    const t = await tx.projectTeam.create({ data: { projectId: id, collegeId: me.collegeId, name: b.name ?? (p.type === "INDIVIDUAL" ? me.name : `${me.name}'s team`), leaderId: me.studentId } });
    await tx.projectMember.create({ data: { teamId: t.id, projectId: id, studentId: me.studentId, collegeId: me.collegeId } });
    return t;
  });
  if (!teamProblems(p, [{ studentId: me.studentId, departmentId: me.departmentId }]).length) await startTeam(t.id);
  return { teamId: t.id };
});

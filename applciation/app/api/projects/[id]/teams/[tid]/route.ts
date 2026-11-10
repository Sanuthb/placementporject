import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { PROJ_ADMIN, PROJ_STAFF, teamOf, teamView } from "@/lib/projectService";
import { startTeam } from "@/lib/projectTeams";

type P = { id: string; tid: string };

/** The whole team workspace as a reviewer sees it: work, contributions apart from the team's, repository figures, files, reviews. */
export const GET = route<P>(PROJ_STAFF, async (_req, s, { id, tid }) => {
  await teamOf(s, id, tid);
  return teamView(tid, "staff");
});

const body = z.object({ name: z.string().trim().min(2).max(80).optional(), addStudentIds: z.array(z.uuid()).max(20).optional(), removeStudentIds: z.array(z.uuid()).max(20).optional(), leaderId: z.uuid().optional(), start: z.boolean().optional() });

/** Placement staff change a team: rename it, add or remove students, change the leader, or start it. Not allowed once the team has submitted. */
export const PATCH = route<P>(PROJ_ADMIN, async (req, s, { id, tid }) => {
  const { project, team } = await teamOf(s, id, tid);
  const b = await parseBody(req, body);
  if (team.status === "SUBMITTED" || team.status === "EVALUATED") throw badRequest("The team has already submitted");
  const add = [...new Set(b.addStudentIds ?? [])], remove = new Set(b.removeStudentIds ?? []);
  if (add.length) {
    const ok = await db.student.findMany({ where: { id: { in: add }, collegeId: s.collegeId, isActive: true, isArchived: false }, select: { id: true } });
    if (ok.length !== add.length) throw badRequest("A chosen student was not found or is inactive");
    const taken = await db.projectMember.count({ where: { projectId: id, studentId: { in: add } } });
    if (taken) throw badRequest("A chosen student is already in a team for this project");
  }
  const members = await db.projectMember.findMany({ where: { teamId: tid }, select: { studentId: true } });
  const after = [...members.map((m) => m.studentId).filter((x) => !remove.has(x)), ...add];
  if (!after.length) throw badRequest("A team needs at least one student. Archive the project instead");
  const leaderId = b.leaderId ?? (remove.has(team.leaderId) ? after[0] : team.leaderId);
  if (!after.includes(leaderId)) throw badRequest("The leader must be a member of the team");
  if (project.type === "INDIVIDUAL" && after.length > 1) throw badRequest("An individual project has one student");
  await db.$transaction(async (tx) => {
    if (remove.size) await tx.projectMember.deleteMany({ where: { teamId: tid, studentId: { in: [...remove] } } });
    if (add.length) await tx.projectMember.createMany({ data: add.map((studentId) => ({ teamId: tid, projectId: id, studentId, collegeId: s.collegeId })) });
    await tx.projectTeam.update({ where: { id: tid }, data: { leaderId, ...(b.name ? { name: b.name } : {}) } });
    await tx.projectTask.updateMany({ where: { teamId: tid, assigneeId: { in: [...remove] } }, data: { assigneeId: null } });
  });
  if (b.start) await startTeam(tid);
  await Promise.all(add.map((sid) => notifyStudent(s.collegeId, sid, { type: "project.allocated", title: `You were added to a team for "${project.title}"`, link: `/student/projects/team/${tid}` })));
  await audit(s, { action: "project.team.update", entity: "Project", entityId: id, after: { teamId: tid, added: add.length, removed: remove.size } });
  return teamView(tid, "staff");
});

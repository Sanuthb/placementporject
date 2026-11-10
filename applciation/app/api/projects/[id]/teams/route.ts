import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { PROJ_ADMIN, PROJ_STAFF, projectOf } from "@/lib/projectService";
import { startTeam } from "@/lib/projectTeams";
import { teamProblems, teamProgress } from "@/lib/projects";

/** Teams of a project with progress, and whether anyone looks behind. */
export const GET = route<{ id: string }>(PROJ_STAFF, async (_req, s, { id }) => {
  await projectOf(s, id);
  const ts = await db.projectTeam.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" }, include: { members: { include: { student: { select: { name: true } } } }, milestones: true, tasks: true, reviews: { select: { isFinal: true } } } });
  return ts.map((t) => ({ id: t.id, name: t.name, status: t.status, members: t.members.map((m) => m.student.name), progress: teamProgress(t.milestones, t.tasks), finalReviews: t.reviews.filter((r) => r.isFinal).length, resultPublished: !!t.resultPublishedAt }));
});

const body = z.object({ name: z.string().trim().min(2).max(80).optional(), studentIds: z.array(z.uuid()).min(1).max(20), leaderId: z.uuid().optional() });

/** Allocates students to a project as a team (one student for an individual project). The team starts at once if it meets the project's rules. */
export const POST = route<{ id: string }>(PROJ_ADMIN, async (req, s, { id }) => {
  const p = await projectOf(s, id);
  if (p.status !== "OPEN") throw badRequest("Open the project before allocating students");
  const b = await parseBody(req, body);
  const ids = [...new Set(b.studentIds)];
  if (b.leaderId && !ids.includes(b.leaderId)) throw badRequest("The leader must be one of the students");
  const studs = await db.student.findMany({ where: { id: { in: ids }, collegeId: s.collegeId, isActive: true, isArchived: false }, select: { id: true, name: true, departmentId: true } });
  if (studs.length !== ids.length) throw badRequest("A chosen student was not found or is inactive");
  const taken = await db.projectMember.findMany({ where: { projectId: id, studentId: { in: ids } }, select: { student: { select: { name: true } } } });
  if (taken.length) throw badRequest(`Already in a team for this project: ${taken.map((t) => t.student.name).join(", ")}`);
  if (p.maxTeams && (await db.projectTeam.count({ where: { projectId: id } })) >= p.maxTeams) throw badRequest("The project already has the most teams it allows");
  const problems = teamProblems(p, studs.map((x) => ({ studentId: x.id, departmentId: x.departmentId })));
  if (problems.length) throw badRequest(problems[0], problems);
  const leaderId = b.leaderId ?? ids[0];
  const team = await db.$transaction(async (tx) => {
    const t = await tx.projectTeam.create({ data: { projectId: id, collegeId: s.collegeId, name: b.name ?? (p.type === "INDIVIDUAL" ? studs[0].name : `Team ${(await tx.projectTeam.count({ where: { projectId: id } })) + 1}`), leaderId } });
    await tx.projectMember.createMany({ data: ids.map((studentId) => ({ teamId: t.id, projectId: id, studentId, collegeId: s.collegeId })) });
    return t;
  });
  const started = await startTeam(team.id);
  await Promise.all(ids.map((sid) => notifyStudent(s.collegeId, sid, { type: "project.allocated", title: `You were allocated to the project "${p.title}"`, link: `/student/projects/team/${team.id}` })));
  await audit(s, { action: "project.allocate", entity: "Project", entityId: id, after: { teamId: team.id, students: ids.length } });
  return started;
});

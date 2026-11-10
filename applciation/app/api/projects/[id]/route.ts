import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PROJ_STAFF, isStaff, projectOf } from "@/lib/projectService";
import { teamProgress } from "@/lib/projects";
import { checkProject, normalise, projectFields } from "../route";

type P = { id: string };

/** One project with its teams and how each is doing. */
export const GET = route<P>(PROJ_STAFF, async (_req, s, { id }) => {
  const p = await projectOf(s, id);
  const teams = await db.projectTeam.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" }, include: { members: { include: { student: { select: { name: true } } } }, milestones: true, tasks: true } });
  const guide = p.guideId ? await db.user.findUnique({ where: { id: p.guideId }, select: { name: true } }) : null;
  return {
    ...p, guideName: guide?.name ?? null,
    teams: teams.map((t) => ({ id: t.id, name: t.name, status: t.status, members: t.members.map((m) => m.student.name), memberCount: t.members.length, progress: teamProgress(t.milestones, t.tasks), repoUrl: t.repoUrl, finalPercent: t.resultPublishedAt ? t.finalPercent : null })),
  };
});

export const PATCH = route<P>(PROJ_STAFF, async (req, s, { id }) => {
  const p = await projectOf(s, id);
  const b = normalise(await parseBody(req, projectFields.partial()));
  if (!isStaff(s) && b.guideId !== undefined && b.guideId !== s.userId) throw badRequest("Only placement staff can change the guide");
  await checkProject(s.collegeId, b);
  if (b.type && b.type !== p.type && (await db.projectTeam.count({ where: { projectId: id } })) > 0) throw badRequest("Teams already exist, so the project type cannot change");
  const u = await db.project.update({ where: { id }, data: b });
  await audit(s, { action: "project.update", entity: "Project", entityId: id, before: { title: p.title }, after: { title: u.title } });
  return u;
});

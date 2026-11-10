import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { PROJ_STAFF, isStaff, scope } from "@/lib/projectService";
import { ProjectType } from "@/generated/prisma/client";

const milestone = z.object({ title: z.string().trim().min(2).max(200), dueInDays: z.number().int().min(0).max(730) });
export const projectFields = z.object({
  title: z.string().trim().min(3).max(200), problemStatement: z.string().trim().min(20, "Describe the problem in at least 20 characters").max(10000), skills: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  type: z.enum(ProjectType), minTeamSize: z.number().int().min(1).max(20).optional(), maxTeamSize: z.number().int().min(1).max(20).optional(),
  departmentIds: z.array(z.uuid()).max(50).optional(), batchIds: z.array(z.uuid()).max(50).optional(), guideId: z.uuid().nullish(), industryPartner: z.string().trim().max(120).nullish(),
  startsAt: z.coerce.date().nullish(), dueAt: z.coerce.date().nullish(), selfFormTeams: z.boolean().optional(), maxTeams: z.number().int().min(1).max(500).nullish(), milestoneTemplate: z.array(milestone).max(20).optional(),
});

/** Checks a project's settings against each other and the college. */
export async function checkProject(collegeId: string, b: Partial<z.infer<typeof projectFields>>) {
  if (b.minTeamSize && b.maxTeamSize && b.minTeamSize > b.maxTeamSize) throw badRequest("The smallest team size cannot be more than the largest");
  if (b.startsAt && b.dueAt && b.dueAt <= b.startsAt) throw badRequest("The due date must be after the start date");
  if (b.guideId && !(await db.user.findFirst({ where: { id: b.guideId, collegeId, isActive: true, OR: [{ role: "FACULTY" }, { extraRoles: { has: "FACULTY" } }] }, select: { id: true } }))) throw badRequest("The guide must be an active faculty member");
  const deps = b.departmentIds ?? [], bats = b.batchIds ?? [];
  if (deps.length && (await db.department.count({ where: { id: { in: deps }, collegeId } })) !== new Set(deps).size) throw badRequest("A chosen department was not found");
  if (bats.length && (await db.batch.count({ where: { id: { in: bats }, collegeId } })) !== new Set(bats).size) throw badRequest("A chosen batch was not found");
}
export const normalise = <T extends { type?: string; minTeamSize?: number; maxTeamSize?: number }>(b: T) => (b.type === "INDIVIDUAL" ? { ...b, minTeamSize: 1, maxTeamSize: 1 } : b);

/** Projects: placement staff see every one; a faculty member only the ones they guide. */
export const GET = route(PROJ_STAFF, async (_req, s) => {
  const rows = await db.project.findMany({ where: scope(s), orderBy: { createdAt: "desc" }, take: 300, include: { _count: { select: { teams: true, members: true } } } });
  return rows.map((p) => ({ id: p.id, title: p.title, type: p.type, status: p.status, skills: p.skills, guideId: p.guideId, dueAt: p.dueAt, proposedById: p.proposedById, teams: p._count.teams, students: p._count.members }));
});

/** Adds a problem statement to the repository as a draft. A faculty member's own project names them as the guide. */
export const POST = route(PROJ_STAFF, async (req, s) => {
  const b = normalise(await parseBody(req, projectFields));
  const guideId = isStaff(s) ? b.guideId : s.userId;
  await checkProject(s.collegeId, { ...b, guideId });
  const p = await db.project.create({ data: { ...b, guideId, collegeId: s.collegeId, createdById: s.userId } });
  await audit(s, { action: "project.create", entity: "Project", entityId: p.id, after: { title: p.title, type: p.type } });
  return p;
});

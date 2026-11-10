import { db } from "@/lib/db";
import { badRequest } from "@/lib/api/errors";
import { milestonesFromTemplate, teamProblems } from "@/lib/projects";

/** Starts a team that is still forming: its members must satisfy the project's rules. Creates the project's milestones for the team. */
export async function startTeam(teamId: string) {
  const t = await db.projectTeam.findUniqueOrThrow({ where: { id: teamId }, include: { project: true, members: { include: { student: { select: { departmentId: true } } } } } });
  if (t.status !== "FORMING") return t;
  if (t.project.status !== "OPEN") throw badRequest("The project is not open");
  const problems = teamProblems(t.project, t.members.map((m) => ({ studentId: m.studentId, departmentId: m.student.departmentId })));
  if (problems.length) throw badRequest(problems[0], problems);
  const now = new Date();
  return db.$transaction(async (tx) => {
    const claimed = await tx.projectTeam.updateMany({ where: { id: teamId, status: "FORMING" }, data: { status: "ACTIVE", startedAt: now } });
    if (claimed.count) await tx.projectMilestone.createMany({ data: milestonesFromTemplate(t.project.milestoneTemplate, t.project.startsAt && t.project.startsAt > now ? t.project.startsAt : now).map((m) => ({ ...m, teamId })) });
    return tx.projectTeam.findUniqueOrThrow({ where: { id: teamId } });
  });
}

import { db } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import type { StudentSession } from "@/lib/auth/student";
import { canJoin, projectVisibleTo, teamProblems, teamProgress } from "@/lib/projects";

/** My membership in a team, with the team and its project. Throws if I am not in it. */
export async function myTeam(me: StudentSession, teamId: string) {
  const m = await db.projectMember.findFirst({ where: { teamId, studentId: me.studentId }, include: { team: { include: { project: true } } } });
  if (!m) throw notFound("Team not found");
  return { member: m, team: m.team, project: m.team.project, isLeader: m.team.leaderId === me.studentId };
}

/** A team I may still change: it is active and has not submitted. */
export async function workableTeam(me: StudentSession, teamId: string) {
  const r = await myTeam(me, teamId);
  if (r.team.status === "SUBMITTED" || r.team.status === "EVALUATED") throw badRequest("This team has already submitted its work");
  if (r.team.status === "FORMING") throw badRequest("The team has not started yet");
  return r;
}

export const leaderOnly = (isLeader: boolean) => { if (!isLeader) throw forbidden("Only the team leader can do this"); };

/** Projects I can take or am already in. */
export async function browseProjects(me: StudentSession) {
  const [projects, mine] = await Promise.all([
    db.project.findMany({ where: { collegeId: me.collegeId, OR: [{ status: "OPEN" }, { members: { some: { studentId: me.studentId } } }, { proposedById: me.studentId }] }, orderBy: { createdAt: "desc" }, take: 200, include: { teams: { include: { members: { select: { studentId: true } } } } } }),
    db.projectMember.findMany({ where: { studentId: me.studentId }, select: { projectId: true, teamId: true } }),
  ]);
  const guides = await db.user.findMany({ where: { id: { in: projects.flatMap((p) => (p.guideId ? [p.guideId] : [])) } }, select: { id: true, name: true } });
  return projects.flatMap((p) => {
    const mineTeam = mine.find((x) => x.projectId === p.id);
    if (!mineTeam && p.proposedById !== me.studentId && !projectVisibleTo(p, me)) return [];
    const openTeams = p.selfFormTeams && p.status === "OPEN" ? p.teams.filter((t) => t.status === "FORMING" && canJoin(p, t.members.length)) : [];
    return [{
      id: p.id, title: p.title, problemStatement: p.problemStatement, skills: p.skills, type: p.type, status: p.status, minTeamSize: p.minTeamSize, maxTeamSize: p.maxTeamSize, industryPartner: p.industryPartner, startsAt: p.startsAt, dueAt: p.dueAt, selfFormTeams: p.selfFormTeams, rejectReason: p.proposedById === me.studentId ? p.rejectReason : null,
      guide: guides.find((g) => g.id === p.guideId)?.name ?? null, proposedByMe: p.proposedById === me.studentId, myTeamId: mineTeam?.teamId ?? null,
      canStartTeam: !mineTeam && p.status === "OPEN" && p.selfFormTeams && (!p.maxTeams || p.teams.length < p.maxTeams), joinable: mineTeam ? [] : openTeams.map((t) => ({ id: t.id, name: t.name, members: t.members.length })),
    }];
  });
}

/** Checks I can take a project, then returns it. */
export async function takableProject(me: StudentSession, projectId: string) {
  const p = await db.project.findFirst({ where: { id: projectId, collegeId: me.collegeId } });
  if (!p || p.status !== "OPEN" || !projectVisibleTo(p, me)) throw notFound("Project not found");
  if (!p.selfFormTeams) throw badRequest("Your placement office allocates students to this project");
  if (await db.projectMember.findFirst({ where: { projectId, studentId: me.studentId }, select: { id: true } })) throw badRequest("You are already in a team for this project");
  return p;
}

export { teamProblems, teamProgress };

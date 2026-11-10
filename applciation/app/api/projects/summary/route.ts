import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { PROJ_STAFF, scope } from "@/lib/projectService";
import { contributions, teamProgress, type RepoStats } from "@/lib/projects";

/** Monitoring: projects by state, proposals waiting, teams behind schedule, work waiting for review and members with little recorded work. */
export const GET = route(PROJ_STAFF, async (_req, s) => {
  const projects = await db.project.findMany({ where: scope(s), select: { id: true, title: true, status: true } });
  const ids = projects.map((p) => p.id);
  const teams = await db.projectTeam.findMany({
    where: { projectId: { in: ids } },
    include: { milestones: true, tasks: true, updates: { select: { studentId: true } }, files: { select: { uploadedByStudentId: true } }, members: { include: { student: { select: { name: true } } } }, reviews: { select: { isFinal: true } } },
  });
  const title = new Map(projects.map((p) => [p.id, p.title]));
  const by = (st: string) => projects.filter((p) => p.status === st).length;
  const rows = teams.map((t) => ({ t, p: teamProgress(t.milestones, t.tasks) }));
  const low = rows.filter((r) => r.t.status === "ACTIVE" || r.t.status === "SUBMITTED").flatMap(({ t }) => {
    const stats = t.repoStats as RepoStats | null;
    return contributions(t.members.map((m) => ({ studentId: m.studentId, githubUsername: m.githubUsername, tasksDone: t.tasks.filter((x) => x.assigneeId === m.studentId && x.status === "DONE").length, tasksAssigned: 0, updates: t.updates.filter((u) => u.studentId === m.studentId).length, files: t.files.filter((f) => f.uploadedByStudentId === m.studentId).length })), stats?.contributors ?? [])
      .filter((c) => c.lowContribution).map((c) => ({ project: title.get(t.projectId), team: t.name, teamId: t.id, projectId: t.projectId, student: t.members.find((m) => m.studentId === c.studentId)?.student.name, sharePercent: c.sharePercent }));
  });
  return {
    projects: { total: projects.length, open: by("OPEN"), draft: by("DRAFT"), closed: by("CLOSED"), proposals: by("PROPOSED") },
    teams: { forming: teams.filter((t) => t.status === "FORMING").length, active: teams.filter((t) => t.status === "ACTIVE").length, submitted: teams.filter((t) => t.status === "SUBMITTED").length, evaluated: teams.filter((t) => t.status === "EVALUATED").length },
    proposals: projects.filter((p) => p.status === "PROPOSED"),
    behind: rows.filter((r) => r.t.status === "ACTIVE" && r.p.overdue > 0).map((r) => ({ project: title.get(r.t.projectId), team: r.t.name, teamId: r.t.id, projectId: r.t.projectId, overdue: r.p.overdue, percent: r.p.percent })).slice(0, 30),
    awaitingReview: rows.filter((r) => r.t.status === "SUBMITTED" && !r.t.reviews.some((x) => x.isFinal)).map((r) => ({ project: title.get(r.t.projectId), team: r.t.name, teamId: r.t.id, projectId: r.t.projectId })).slice(0, 30),
    lowContribution: low.slice(0, 30),
  };
});

import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { teamProblems, submitProblems } from "@/lib/projects";
import { notifyUserIds } from "@/lib/projectNotify";
import { leaderOnly, myTeam } from "@/lib/projectStudent";

/** The leader submits the team's work for final review. After this the team can no longer change its tasks, files or members. */
export const POST = studentRoute<{ tid: string }>({ module: "LEARNING" }, async (_req, me, { tid }) => {
  const { team, project, isLeader } = await myTeam(me, tid);
  leaderOnly(isLeader);
  const [members, tasks, updates, files] = await Promise.all([
    db.projectMember.findMany({ where: { teamId: tid }, include: { student: { select: { departmentId: true } } } }),
    db.projectTask.count({ where: { teamId: tid, status: "DONE" } }), db.projectUpdate.count({ where: { teamId: tid, studentId: { not: null } } }), db.projectFile.count({ where: { teamId: tid } }),
  ]);
  const problems = submitProblems(team.status, teamProblems(project, members.map((m) => ({ studentId: m.studentId, departmentId: m.student.departmentId }))), tasks + updates + files > 0);
  if (problems.length) throw badRequest(problems[0], problems);
  const r = await db.projectTeam.updateMany({ where: { id: tid, status: "ACTIVE" }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  if (r.count === 0) throw badRequest("Already submitted");
  if (project.guideId) await notifyUserIds(me.collegeId, [project.guideId], { type: "project.submitted", title: `${team.name} submitted "${project.title}" for review`, link: `/staff/projects/${project.id}/teams/${tid}` });
  return { ok: true };
});

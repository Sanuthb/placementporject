import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { PROJ_STAFF, isStaff, projectOf } from "@/lib/projectService";
import { startTeam } from "@/lib/projectTeams";

const body = z.object({ action: z.enum(["OPEN", "CLOSE", "ARCHIVE", "DRAFT", "APPROVE", "REJECT"]), reason: z.string().trim().max(500).optional() });

/**
 * OPEN lets students take the project; CLOSE stops new teams; ARCHIVE retires it; DRAFT takes an unused project back. A student's proposal is APPROVEd
 * (it becomes open and their team starts) or REJECTed with a reason. Faculty may do this only for projects they guide.
 */
export const POST = route<{ id: string }>(PROJ_STAFF, async (req, s, { id }) => {
  const p = await projectOf(s, id);
  const { action, reason } = await parseBody(req, body);
  const teams = await db.projectTeam.count({ where: { projectId: id } });
  if (p.status === "PROPOSED" && !["APPROVE", "REJECT"].includes(action)) throw badRequest("Approve or reject this student's proposal first");
  if (action === "APPROVE" || action === "REJECT") {
    if (p.status !== "PROPOSED") throw badRequest("Only a student's proposal can be approved or rejected");
    if (action === "REJECT" && !reason) throw badRequest("Say why it is rejected");
    const u = await db.project.update({ where: { id }, data: action === "APPROVE" ? { status: "OPEN", guideId: p.guideId ?? (isStaff(s) ? null : s.userId) } : { status: "REJECTED", rejectReason: reason } });
    const team = await db.projectTeam.findFirst({ where: { projectId: id }, include: { members: true } });
    if (team) {
      if (action === "APPROVE") await startTeam(team.id).catch(() => undefined);
      await Promise.all(team.members.map((m) => notifyStudent(s.collegeId, m.studentId, { type: "project.proposal", title: action === "APPROVE" ? `Your project "${p.title}" was approved` : `Your project "${p.title}" was not approved`, body: reason, link: "/student/projects" })));
    }
    await audit(s, { action: `project.${action.toLowerCase()}`, entity: "Project", entityId: id, reason });
    return u;
  }
  const to = { OPEN: "OPEN", CLOSE: "CLOSED", ARCHIVE: "ARCHIVED", DRAFT: "DRAFT" }[action] as "OPEN" | "CLOSED" | "ARCHIVED" | "DRAFT";
  if (to === "DRAFT" && teams > 0) throw badRequest("Teams exist, so the project cannot go back to draft. Close it instead");
  if (to === "OPEN" && p.problemStatement.trim().length < 20) throw badRequest("Add a problem statement first");
  const u = await db.project.update({ where: { id }, data: { status: to } });
  await audit(s, { action: `project.${to.toLowerCase()}`, entity: "Project", entityId: id, before: { status: p.status }, after: { status: to } });
  return u;
});

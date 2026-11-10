import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { browseProjects } from "@/lib/projectStudent";

/** Projects I can take, the ones I am in, and my own proposals. */
export const GET = studentRoute({ module: "LEARNING" }, (_req, me) => browseProjects(me));

const proposal = z.object({ title: z.string().trim().min(3).max(200), problemStatement: z.string().trim().min(30, "Describe the problem in at least 30 characters").max(5000), skills: z.array(z.string().trim().min(1).max(40)).max(10).optional(), type: z.enum(["INDIVIDUAL", "TEAM"]) });

/** Propose my own project. It waits for staff or a faculty member to approve it; I am its team leader and can start once it is approved. */
export const POST = studentRoute({ module: "LEARNING", limit: { name: "project-propose", max: 10, windowSec: 86400 } }, async (req, me) => {
  const b = await parseBody(req, proposal);
  const p = await db.$transaction(async (tx) => {
    const p = await tx.project.create({ data: { collegeId: me.collegeId, title: b.title, problemStatement: b.problemStatement, skills: b.skills ?? [], type: b.type, status: "PROPOSED", minTeamSize: 1, maxTeamSize: b.type === "INDIVIDUAL" ? 1 : 4, departmentIds: [me.departmentId], batchIds: [me.batchId], selfFormTeams: false, maxTeams: 1, proposedById: me.studentId } });
    const t = await tx.projectTeam.create({ data: { projectId: p.id, collegeId: me.collegeId, name: b.type === "INDIVIDUAL" ? me.name : `${me.name}'s team`, leaderId: me.studentId } });
    await tx.projectMember.create({ data: { teamId: t.id, projectId: p.id, studentId: me.studentId, collegeId: me.collegeId } });
    return p;
  });
  await notifyStaff(me.collegeId, { type: "project.proposal", title: `${me.name} proposed a project: ${b.title}`, link: `/staff/projects/${p.id}` });
  return { id: p.id };
});

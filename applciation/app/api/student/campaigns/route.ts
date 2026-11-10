import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { memberProgress } from "@/lib/campaign";

/** The preparation campaigns I have been invited to or am taking part in. */
export const GET = studentRoute({ module: "DRIVES" }, async (_req, me) => {
  const rows = await db.campaignMember.findMany({ where: { studentId: me.studentId, status: { in: ["INVITED", "ACCEPTED", "DECLINED"] }, campaign: { status: { in: ["ACTIVE", "COMPLETED"] } } }, orderBy: { invitedAt: "desc" }, include: { campaign: { select: { id: true, name: true, company: true, jobRole: true, status: true, startsAt: true, deadline: true } }, items: { select: { kind: true, status: true, dueAt: true, optional: true } } } });
  return rows.map((m) => ({ id: m.campaign.id, name: m.campaign.name, company: m.campaign.company, jobRole: m.campaign.jobRole, campaignStatus: m.campaign.status, startsAt: m.campaign.startsAt, deadline: m.campaign.deadline, status: m.status, progress: memberProgress(m.items) }));
});

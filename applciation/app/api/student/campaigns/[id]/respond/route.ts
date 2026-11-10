import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { logEvent } from "@/lib/campaignService";
import { nextMember, type MemberStatus } from "@/lib/campaign";

/** Accept or decline the invitation. You can change your answer until the campaign ends. A reason is asked for when declining. */
export const POST = studentRoute<{ id: string }>({ module: "DRIVES", limit: { name: "campaign-respond", max: 30, windowSec: 3600 } }, async (req, me, { id }) => {
  const m = await db.campaignMember.findFirst({ where: { campaignId: id, studentId: me.studentId }, include: { campaign: { select: { status: true, name: true, jobRole: true, company: true, ownerId: true, collegeId: true } } } });
  if (!m || m.campaign.status !== "ACTIVE") throw notFound("Campaign not found");
  const { action, reason } = await parseBody(req, z.object({ action: z.enum(["ACCEPT", "DECLINE"]), reason: z.string().trim().max(500).optional() }));
  const next = nextMember(m.status as MemberStatus, action);
  if ("error" in next) throw badRequest(next.error);
  const done = await db.campaignMember.updateMany({ where: { id: m.id, status: m.status }, data: { status: next.status, respondedAt: new Date(), declineReason: action === "DECLINE" ? (reason ?? null) : null } });
  if (done.count === 0) throw badRequest("Your answer just changed. Reload and try again");
  await logEvent(id, { type: "STUDENT", id: me.studentId }, action === "ACCEPT" ? "member.accepted" : "member.declined", { reason: reason ?? null }, m.id);
  await notifyStaff(me.collegeId, { type: "campaign.response", title: `${me.name} ${action === "ACCEPT" ? "accepted" : "declined"} the preparation invitation for ${m.campaign.jobRole}`, body: reason, link: `/staff/campaigns/${id}`, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] });
  return { status: next.status };
});

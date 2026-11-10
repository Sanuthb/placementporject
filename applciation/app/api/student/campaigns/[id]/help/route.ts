import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { logEvent } from "@/lib/campaignService";
import { notifyUserIds } from "@/lib/projectNotify";

/** Ask for support with your preparation. Your trainers and the placement office are told. */
export const POST = studentRoute<{ id: string }>({ module: "DRIVES", limit: { name: "campaign-help", max: 10, windowSec: 86400 } }, async (req, me, { id }) => {
  const m = await db.campaignMember.findFirst({ where: { campaignId: id, studentId: me.studentId, status: "ACCEPTED" }, include: { campaign: { select: { status: true, jobRole: true, trainerIds: true } } } });
  if (!m || m.campaign.status !== "ACTIVE") throw notFound("Campaign not found");
  const { note } = await parseBody(req, z.object({ note: z.string().trim().min(5).max(1000) }));
  if (m.helpRequestedAt && !m.helpRespondedAt) throw badRequest("You already have a support request waiting for an answer");
  await db.campaignMember.update({ where: { id: m.id }, data: { helpNote: note, helpRequestedAt: new Date(), helpResponse: null, helpRespondedAt: null } });
  await logEvent(id, { type: "STUDENT", id: me.studentId }, "support.requested", {}, m.id);
  const note2 = { type: "campaign.help", title: `${me.name} asked for support with ${m.campaign.jobRole}`, body: note.slice(0, 140), link: `/staff/campaigns/${id}` };
  await notifyStaff(me.collegeId, note2);
  await notifyUserIds(me.collegeId, m.campaign.trainerIds, note2);
  return { ok: true };
});

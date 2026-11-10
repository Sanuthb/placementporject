import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { CAMP_TRAINER, campaignOf, logEvent, memberOf } from "@/lib/campaignService";

/** Answer a student's request for support. They are told. */
export const POST = route<{ id: string; mid: string }>(CAMP_TRAINER, async (req, s, { id, mid }) => {
  const c = await campaignOf(s, id);
  const m = await memberOf(id, mid);
  if (!m.helpRequestedAt) throw badRequest("This student has not asked for support");
  const { response } = await parseBody(req, z.object({ response: z.string().trim().min(3).max(2000) }));
  await db.campaignMember.update({ where: { id: mid }, data: { helpResponse: response, helpRespondedAt: new Date() } });
  await notifyStudent(s.collegeId, m.studentId, { type: "campaign.support", title: `Your support request for ${c.jobRole} was answered`, body: response.slice(0, 140), link: `/student/campaigns/${id}` });
  await logEvent(id, { type: "STAFF", id: s.userId }, "support.answered", {}, mid);
  return { ok: true };
});

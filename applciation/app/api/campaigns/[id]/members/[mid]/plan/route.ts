import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { CAMP_TRAINER, assertEditable, campaignOf, logEvent, memberOf } from "@/lib/campaignService";
import { PLAN_KINDS, dayDate, windowDays } from "@/lib/campaign";
import { badRequest } from "@/lib/api/errors";

export const itemBody = z.object({ title: z.string().trim().min(3).max(200), detail: z.string().trim().max(1000).nullish(), kind: z.enum(PLAN_KINDS), day: z.number().int().min(1).max(60), skill: z.string().trim().max(80).nullish(), optional: z.boolean().optional() });

/** Add an item to a candidate's plan (staff or the campaign's trainers). The student is told. */
export const POST = route<{ id: string; mid: string }>(CAMP_TRAINER, async (req, s, { id, mid }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  const m = await memberOf(id, mid);
  const b = await parseBody(req, itemBody);
  if (b.day > windowDays(c.startsAt, c.deadline)) throw badRequest(`The campaign has ${windowDays(c.startsAt, c.deadline)} days`);
  const it = await db.campaignPlanItem.create({ data: { campaignId: id, memberId: mid, day: b.day, dueAt: dayDate(c.startsAt, b.day), kind: b.kind, title: b.title, detail: b.detail ?? null, skill: b.skill ?? null, optional: b.optional ?? false, source: "STAFF" } });
  await logEvent(id, { type: "STAFF", id: s.userId }, "plan.item_added", { title: b.title, day: b.day }, mid);
  if (m.status === "INVITED" || m.status === "ACCEPTED") await notifyStudent(s.collegeId, m.studentId, { type: "campaign.plan", title: "Your preparation plan was updated", body: b.title, link: `/student/campaigns/${id}` });
  return it;
});

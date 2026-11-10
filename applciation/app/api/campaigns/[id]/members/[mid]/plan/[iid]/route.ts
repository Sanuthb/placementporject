import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { CAMP_TRAINER, assertEditable, campaignOf, logEvent, memberOf } from "@/lib/campaignService";
import { dayDate, windowDays } from "@/lib/campaign";
import { itemBody } from "../route";
import { z } from "zod";

type P = { id: string; mid: string; iid: string };
const patch = itemBody.partial().extend({ status: z.enum(["PENDING", "DONE", "SKIPPED"]).optional() });

/** Change a plan item: its text, day, whether it is optional, or mark it done or skipped for the student. */
export const PATCH = route<P>(CAMP_TRAINER, async (req, s, { id, mid, iid }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  const m = await memberOf(id, mid);
  const it = await db.campaignPlanItem.findFirst({ where: { id: iid, memberId: mid } });
  if (!it) throw notFound("Plan item not found");
  const b = await parseBody(req, patch);
  if (b.day && b.day > windowDays(c.startsAt, c.deadline)) throw badRequest("That day is after the campaign deadline");
  await db.campaignPlanItem.update({ where: { id: iid }, data: { ...(b.title ? { title: b.title } : {}), ...(b.detail !== undefined ? { detail: b.detail } : {}), ...(b.kind ? { kind: b.kind } : {}), ...(b.skill !== undefined ? { skill: b.skill } : {}), ...(b.optional !== undefined ? { optional: b.optional } : {}), ...(b.day ? { day: b.day, dueAt: dayDate(c.startsAt, b.day) } : {}), ...(b.status ? { status: b.status, doneAt: b.status === "DONE" ? new Date() : null, autoDone: false } : {}), source: "STAFF" } });
  await logEvent(id, { type: "STAFF", id: s.userId }, "plan.item_changed", { item: it.title, changes: Object.keys(b) }, mid);
  if (b.day || b.title) await notifyStudent(s.collegeId, m.studentId, { type: "campaign.plan", title: "Your preparation plan was updated", body: it.title, link: `/student/campaigns/${id}` });
  return { ok: true };
});

export const DELETE = route<P>(CAMP_TRAINER, async (_req, s, { id, mid, iid }) => {
  const c = await campaignOf(s, id);
  assertEditable(c);
  await memberOf(id, mid);
  const it = await db.campaignPlanItem.findFirst({ where: { id: iid, memberId: mid } });
  if (!it) throw notFound("Plan item not found");
  await db.campaignPlanItem.delete({ where: { id: iid } });
  await logEvent(id, { type: "STAFF", id: s.userId }, "plan.item_removed", { item: it.title }, mid);
  return { ok: true };
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { CATEGORIES, isMandatory, type Category } from "@/lib/notifyRules";

const body = z.object({ changes: z.array(z.object({ category: z.enum(CATEGORIES.map(([k]) => k) as [Category, ...Category[]]), enabled: z.boolean() })).min(1).max(30) });
const view = async (userId: string) => {
  const off = new Set((await db.notificationPref.findMany({ where: { ownerKey: `U:${userId}`, channel: "IN_APP", enabled: false }, select: { category: true } })).map((p) => p.category));
  return CATEGORIES.map(([key, label, mandatory]) => ({ key, label, mandatory, inApp: mandatory || !off.has(key) }));
};

/** My in-app notification choices as a staff member: which kinds I get in the app. (Staff are not sent email, SMS or WhatsApp notifications.) */
export const GET = route({ facultyOk: true }, (_req, s) => view(s.userId));
export const PUT = route({ facultyOk: true }, async (req, s) => {
  const { changes } = await parseBody(req, body);
  if (changes.some((c) => !c.enabled && isMandatory(c.category))) throw badRequest("Account and offer messages always appear");
  await db.$transaction(changes.map((c) => db.notificationPref.upsert({ where: { ownerKey_category_channel: { ownerKey: `U:${s.userId}`, category: c.category, channel: "IN_APP" } }, create: { collegeId: s.collegeId, ownerKey: `U:${s.userId}`, userId: s.userId, category: c.category, channel: "IN_APP", enabled: c.enabled }, update: { enabled: c.enabled } })));
  return view(s.userId);
});

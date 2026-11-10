import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { providerConfigured } from "@/lib/channels";
import { CATEGORIES, CHANNELS, channelsFor, isMandatory, normalisePhone, type Category, type Channel } from "@/lib/notifyRules";

const body = z.object({ changes: z.array(z.object({ category: z.enum(CATEGORIES.map(([k]) => k) as [Category, ...Category[]]), channel: z.enum(CHANNELS.map(([k]) => k) as [Channel, ...Channel[]]), enabled: z.boolean() })).min(1).max(60) });

async function snapshot(collegeId: string, studentId: string) {
  const [prefs, st, settings, legacy] = await Promise.all([
    db.notificationPref.findMany({ where: { ownerKey: `S:${studentId}` }, select: { category: true, channel: true, enabled: true, updatedAt: true } }),
    db.student.findUniqueOrThrow({ where: { id: studentId }, select: { phone: true } }),
    db.collegeSettings.findUnique({ where: { collegeId }, select: { smsEnabled: true, whatsappEnabled: true } }),
    db.student.findUniqueOrThrow({ where: { id: studentId }, select: { emailAnnouncements: true, emailReminders: true } }),
  ]);
  const phone = normalisePhone(st.phone);
  return {
    categories: CATEGORIES.map(([key, label, mandatory]) => ({ key, label, mandatory, channels: channelsFor(key, prefs), consentGiven: Object.fromEntries(["SMS", "WHATSAPP"].map((ch) => [ch, prefs.find((p) => p.category === key && p.channel === ch && p.enabled)?.updatedAt ?? null])) })),
    phone: { onFile: !!st.phone, valid: !!phone, display: phone ? `${phone.slice(0, 3)}******${phone.slice(-3)}` : null },
    channels: { SMS: { collegeEnabled: !!settings?.smsEnabled, available: !!settings?.smsEnabled && providerConfigured("SMS") }, WHATSAPP: { collegeEnabled: !!settings?.whatsappEnabled, available: !!settings?.whatsappEnabled && providerConfigured("WHATSAPP") } },
    legacy,
  };
}

/** My notification settings: for each kind of notification, which of the app, email, SMS and WhatsApp I get it on. SMS and WhatsApp are off until I turn them on, which is my consent. */
export const GET = studentRoute({}, (_req, me) => snapshot(me.collegeId, me.studentId));

/** Changes one or more settings. Messages about my account and offers always show in the app. SMS and WhatsApp need a valid phone number on my profile and the college to have switched the channel on. */
export const PUT = studentRoute({}, async (req, me) => {
  const { changes } = await parseBody(req, body);
  const cur = await snapshot(me.collegeId, me.studentId);
  for (const c of changes) {
    if (c.channel === "IN_APP" && !c.enabled && isMandatory(c.category)) throw badRequest("Messages about your account and offers always appear in the app");
    if ((c.channel === "SMS" || c.channel === "WHATSAPP") && c.enabled) {
      if (!cur.channels[c.channel].available) throw badRequest(`${c.channel === "SMS" ? "SMS" : "WhatsApp"} is not available at your college yet`);
      if (!cur.phone.valid) throw badRequest("Add a valid mobile number to your profile first");
    }
  }
  await db.$transaction(changes.map((c) => db.notificationPref.upsert({ where: { ownerKey_category_channel: { ownerKey: `S:${me.studentId}`, category: c.category, channel: c.channel } }, create: { collegeId: me.collegeId, ownerKey: `S:${me.studentId}`, studentId: me.studentId, category: c.category, channel: c.channel, enabled: c.enabled }, update: { enabled: c.enabled } })));
  return snapshot(me.collegeId, me.studentId);
});

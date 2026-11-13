import { db } from "@/lib/db";
import { escapeHtml, fromAddress, mailer } from "@/lib/mailer";
import { HOLD_REASON, isOnHold, providerConfigured, sendText } from "@/lib/channels";
import { EXTERNAL, categoryOf, checkChannel, normalisePhone, textMessage } from "@/lib/notifyRules";

type N = { id: string; collegeId: string; studentId: string | null; type: string; title: string; body: string | null; link: string | null };
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Sends one in-app notification on the other channels its student has opted in to. Safe to call twice: one delivery per notification and channel is claimed by a unique row first.
 * A channel the student has not turned on produces no row; one they turned on but that could not be used (quiet hours, no phone, not switched on for the college) is logged as skipped with the reason.
 */
export async function deliverNotification(n: N, now = new Date()) {
  if (!n.studentId) return 0;
  const category = categoryOf(n.type);
  const [st, prefs, settings, brand] = await Promise.all([
    db.student.findUnique({ where: { id: n.studentId }, select: { email: true, phone: true, isActive: true } }),
    db.notificationPref.findMany({ where: { ownerKey: `S:${n.studentId}`, channel: { in: EXTERNAL } }, select: { category: true, channel: true, enabled: true } }),
    db.collegeSettings.findUnique({ where: { collegeId: n.collegeId }, select: { smsEnabled: true, whatsappEnabled: true } }),
    db.college.findUnique({ where: { id: n.collegeId }, select: { name: true } }),
  ]);
  if (!st?.isActive) return 0;
  let done = 0;
  for (const channel of EXTERNAL) {
    if (!prefs.some((p) => p.category === category && p.channel === channel && p.enabled)) continue;
    const phone = normalisePhone(st.phone);
    const check = isOnHold(channel) ? { channel, send: false as const, reason: HOLD_REASON } : checkChannel({ channel, category, prefs, collegeEnabled: channel === "SMS" ? !!settings?.smsEnabled : channel === "WHATSAPP" ? !!settings?.whatsappEnabled : true, providerConfigured: providerConfigured(channel), phone, email: st.email, now });
    const claim = await db.notificationDelivery.create({ data: { collegeId: n.collegeId, studentId: n.studentId, notificationId: n.id, channel, category, title: n.title.slice(0, 200), status: check.send ? "SENDING" : "SKIPPED", detail: check.send ? null : check.reason } }).catch(() => null);
    if (!claim || !check.send) continue;
    try {
      let ref: string | null = null;
      if (channel === "EMAIL") {
        const link = n.link ? `${appUrl()}${n.link.startsWith("/") ? n.link : `/${n.link}`}` : appUrl();
        const text = `${n.title}\n\n${n.body ? `${n.body}\n\n` : ""}Open: ${link}\n\nYou can change which emails you get in the app, under your notification settings.`;
        await mailer().sendMail({ from: fromAddress(), to: st.email, subject: n.title.replace(/[\r\n]+/g, " ").slice(0, 150), text, html: `<div style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(text)}</div>` });
      } else ref = await sendText(channel as "SMS" | "WHATSAPP", phone!, textMessage(n, brand?.name ?? "Placement Cell"));
      await db.notificationDelivery.update({ where: { id: claim.id }, data: { status: "SENT", providerRef: ref } });
      done++;
    } catch (e) {
      await db.notificationDelivery.update({ where: { id: claim.id }, data: { status: "FAILED", detail: (e as Error).message.slice(0, 300) } });
    }
  }
  return done;
}

/** Catches notifications created inside a transaction (which cannot be delivered from there) and any that failed to deliver at once: those from the last `hours` hours for students who have opted in to something outside the app. */
export async function deliverPending(collegeId: string, hours = 6, now = new Date()) {
  const opted = await db.notificationPref.findMany({ where: { collegeId, enabled: true, channel: { in: EXTERNAL }, studentId: { not: null } }, select: { studentId: true } });
  const ids = [...new Set(opted.map((o) => o.studentId!))];
  if (!ids.length) return { delivered: 0 };
  const rows = await db.notification.findMany({ where: { collegeId, studentId: { in: ids }, createdAt: { gt: new Date(now.getTime() - hours * 3_600_000) } }, orderBy: { createdAt: "asc" }, take: 2000, select: { id: true, collegeId: true, studentId: true, type: true, title: true, body: true, link: true } });
  let delivered = 0;
  for (const r of rows) delivered += await deliverNotification(r, now);
  return { delivered };
}

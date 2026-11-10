import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { rotateFeed } from "@/lib/calendarService";

/** Whether I have a calendar subscription link, and when it was made and last used. The link itself is shown only when it is made. */
export const GET = studentRoute({}, async (_req, me) => {
  const f = await db.calendarFeed.findUnique({ where: { studentId: me.studentId }, select: { createdAt: true, rotatedAt: true, lastReadAt: true } });
  return { exists: !!f, createdAt: f?.rotatedAt ?? f?.createdAt ?? null, lastReadAt: f?.lastReadAt ?? null };
});
/** Makes a new private link to subscribe a phone or desktop calendar to my dates. Any older link stops working. */
export const POST = studentRoute({ limit: { name: "calendar-feed", max: 10, windowSec: 3600 } }, async (_req, me) => ({ url: await rotateFeed(me) }));
/** Turns the link off. */
export const DELETE = studentRoute({}, async (_req, me) => { await db.calendarFeed.deleteMany({ where: { studentId: me.studentId } }); return { removed: true }; });

import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/api/handler";
import { isCronRequest } from "@/lib/cron";
import { db } from "@/lib/db";
import { sendReminders } from "@/lib/reminderService";

const adminRun = route({ roles: ["TPO_ADMIN"] }, (_req, s) => sendReminders(s.collegeId));

/**
 * Reminds students about tests opening or closing, course assignments, preparation tasks and assigned interviews or discussions that are due soon, and sends new notifications to the
 * other channels students opted in to. A scheduler calls it with the cron secret (every active college), hourly is enough; an admin can run it for their own college.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return adminRun(req, ctx);
  const colleges = await db.college.findMany({ where: { isActive: true }, select: { id: true } });
  let reminded = 0, delivered = 0;
  for (const c of colleges) { const r = await sendReminders(c.id); reminded += r.reminded; delivered += r.delivered; }
  return NextResponse.json({ data: { colleges: colleges.length, reminded, delivered } });
}

/** For schedulers that can only send GET. Accepts the cron secret only. */
export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret required" } }, { status: 401 });
  return POST(req, ctx);
}

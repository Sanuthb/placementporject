import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/api/handler";
import { isCronRequest } from "@/lib/cron";
import { db } from "@/lib/db";
import { sendRoundReminders } from "@/lib/roundReminders";
import { withJobRun } from "@/lib/jobRun";
import { pruneMonitoring } from "@/lib/monitorRetention";
import { pruneAiUsage } from "@/lib/ai/usage";

const adminRun = route({ roles: ["TPO_ADMIN"], module: "DRIVES" }, (_req, s) => sendRoundReminders(s.collegeId));

/** Reminds students about rounds and interviews in the next 24 hours. A scheduler calls it with the cron secret (every college); an admin can run it for their own. */
export async function POST(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return adminRun(req, ctx);
  const out = await withJobRun("/api/notifications/round-reminders/run", async () => {
    const colleges = await db.collegeModule.findMany({ where: { module: "DRIVES", enabled: true, college: { isActive: true } }, select: { collegeId: true } });
    let reminded = 0;
    for (const c of colleges) reminded += (await sendRoundReminders(c.collegeId)).reminded;
    return { colleges: colleges.length, reminded };
  });
  // Housekeeping for the monitoring tables (JobRun 90 days, MonitorEvent 14 days). Bounded, never throws, and runs after the job's own outcome is recorded.
  await pruneMonitoring();
  await pruneAiUsage().catch(() => undefined); // AI usage 90 days, quota counters 3 days; bounded, never fails the job
  return NextResponse.json({ data: out });
}

/** For schedulers that can only send GET. Accepts the cron secret only. */
export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret required" } }, { status: 401 });
  return POST(req, ctx);
}

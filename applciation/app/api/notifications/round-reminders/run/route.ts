import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/api/handler";
import { isCronRequest } from "@/lib/cron";
import { db } from "@/lib/db";
import { sendRoundReminders } from "@/lib/roundReminders";
import { withJobRun } from "@/lib/jobRun";
import { runCleanup } from "@/lib/platformPolicyAdmin";
import { pruneAiQuotaCounters } from "@/lib/ai/usage";

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
  // Housekeeping for the operational tables (job history, monitoring events, AI usage statistics) with the retention the platform administrator has set (defaults 90 / 14 / 90 days).
  // Bounded, never fails the job, runs after the job's own outcome is recorded, and is written to the platform audit trail whenever it removed rows.
  await runCleanup(null).catch(() => undefined);
  await pruneAiQuotaCounters().catch(() => undefined); // not retention: the rate-limit counters only matter for today (fixed 3 days, unchanged)
  return NextResponse.json({ data: out });
}

/** For schedulers that can only send GET. Accepts the cron secret only. */
export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret required" } }, { status: 401 });
  return POST(req, ctx);
}

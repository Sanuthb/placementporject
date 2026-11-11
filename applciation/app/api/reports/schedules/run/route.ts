import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/api/handler";
import { isCronRequest } from "@/lib/cron";
import { runDueReports } from "@/lib/reports";
import { withJobRun } from "@/lib/jobRun";

/** Sends reports that are due. A scheduler calls it with the cron secret (all colleges); a TPO admin can trigger it for their own. */
const adminRun = route({ limit: { name: "report-run", max: 10, windowSec: 3600 }, roles: ["TPO_ADMIN"], module: "ANALYTICS" }, (_req, s) => runDueReports(s.collegeId));

export async function POST(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (isCronRequest(req)) return NextResponse.json({ data: await withJobRun("/api/reports/schedules/run", () => runDueReports()) });
  return adminRun(req, ctx);
}

/** Schedulers that can only send GET (Vercel Cron) use this. It accepts the cron secret only, never a user session. */
export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret required" } }, { status: 401 });
  return POST(req, ctx);
}

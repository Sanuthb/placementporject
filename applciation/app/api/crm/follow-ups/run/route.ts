import { NextResponse, type NextRequest } from "next/server";
import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { isCronRequest } from "@/lib/cron";
import { sendFollowUpReminders } from "@/lib/crm";
import { withJobRun } from "@/lib/jobRun";

/** Creates reminders for follow-ups that have come due. A scheduler calls it with the cron secret (all colleges); an admin can run it for their own. */
const adminRun = route({ roles: ["TPO_ADMIN"], module: "EMPLOYER_CRM" }, (_req, s) => sendFollowUpReminders(s.collegeId));

export async function POST(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return adminRun(req, ctx);
  const out = await withJobRun("/api/crm/follow-ups/run", async () => {
    const colleges = await db.collegeModule.findMany({ where: { module: "EMPLOYER_CRM", enabled: true, college: { isActive: true } }, select: { collegeId: true } });
    const out = { colleges: colleges.length, reminded: 0 };
    for (const c of colleges) out.reminded += (await sendFollowUpReminders(c.collegeId)).reminded;
    return out;
  });
  return NextResponse.json({ data: out });
}

/** Schedulers that can only send GET (Vercel Cron) use this. It accepts the cron secret only, never a user session. */
export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret required" } }, { status: 401 });
  return POST(req, ctx);
}

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { evaluateBlocks } from "@/lib/blocking";
import { route } from "@/lib/api/handler";
import { isCronRequest } from "@/lib/cron";
import { withJobRun } from "@/lib/jobRun";

/**
 * Applies block policies. Two callers:
 *  - a scheduler (Vercel Cron, Supabase pg_cron, or any cron) sending `Authorization: Bearer $CRON_SECRET`: runs for every college that has the module;
 *  - a signed-in TPO admin: runs for their own college.
 */
const adminRun = route({ roles: ["TPO_ADMIN"], module: "ATTENDANCE_BLOCKING" }, (_req, s) => evaluateBlocks(s.collegeId));

export async function POST(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  const isCron = isCronRequest(req);
  if (isCron) {
    const out = await withJobRun("/api/blocking/evaluate", async () => {
      const colleges = await db.collegeModule.findMany({ where: { module: "ATTENDANCE_BLOCKING", enabled: true, college: { isActive: true } }, select: { collegeId: true } });
      const out = { colleges: colleges.length, created: 0, expired: 0 };
      for (const c of colleges) { const r = await evaluateBlocks(c.collegeId); out.created += r.created; out.expired += r.expired; }
      return out;
    });
    return NextResponse.json({ data: out });
  }
  return adminRun(req, ctx);
}

/** Schedulers that can only send GET (Vercel Cron) use this. It accepts the cron secret only, never a user session. */
export async function GET(req: NextRequest, ctx: { params: Promise<Record<string, string>> }) {
  if (!isCronRequest(req)) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Cron secret required" } }, { status: 401 });
  return POST(req, ctx);
}

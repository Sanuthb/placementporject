import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { limitBy } from "@/lib/rateLimit";
import { sessionForFeed, studentEvents } from "@/lib/calendarService";
import { buildIcs } from "@/lib/notifyRules";

/** Public (no login): a student's private calendar feed, found by the secret in the link. A calendar app polls it. Nothing about it is indexed or cached. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    await limitBy(req, { name: "calendar-feed", max: 120, windowSec: 60 });
    const me = await sessionForFeed((await ctx.params).token);
    return new NextResponse(buildIcs(await studentEvents(me), new Date(), "My placement calendar"), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    return toErrorResponse(e);
  }
}

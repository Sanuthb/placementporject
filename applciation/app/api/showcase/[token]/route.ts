import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/handler";
import { publicProfile } from "@/lib/showcase";
import { limitBy } from "@/lib/rateLimit";

/** Public (no login): a student's showcase profile for employers. */
export async function GET(_req: import("next/server").NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    await limitBy(_req, { name: "showcase", max: 120, windowSec: 60 });
    const { studentId: _s, collegeId: _c, ...profile } = await publicProfile((await ctx.params).token);
    void _s; void _c;
    return NextResponse.json({ data: profile }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    return toErrorResponse(e);
  }
}

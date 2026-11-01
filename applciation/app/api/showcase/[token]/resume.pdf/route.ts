import { toErrorResponse } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { publicProfile } from "@/lib/showcase";
import { limitBy } from "@/lib/rateLimit";
import { generateResumePdf } from "@/lib/studentResume";

/** Public (no login): the resume PDF behind a showcase link. */
export async function GET(_req: import("next/server").NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    await limitBy(_req, { name: "showcase", max: 120, windowSec: 60 });
    const p = await publicProfile((await ctx.params).token);
    const out = await generateResumePdf(p.collegeId, p.studentId);
    if (!out) throw new ApiError(404, "NOT_FOUND", "Profile not found");
    return new Response(new Uint8Array(out.pdf), { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="resume.pdf"', "cache-control": "no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    return toErrorResponse(e);
  }
}

import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError } from "@/lib/api/errors";
import { generateResumePdf } from "@/lib/studentResume";

export const GET = studentRoute({ limit: { name: "resume-pdf", max: 60, windowSec: 3600 }, module: "ONBOARDING" }, async (_req, me) => {
  const r = await generateResumePdf(me.collegeId, me.studentId);
  if (!r) throw new ApiError(409, "NOTHING_VERIFIED", "Nothing is verified yet, so there is nothing to put on a resume");
  return new Response(new Uint8Array(r.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.fileName}"` } });
});

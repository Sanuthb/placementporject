import { route } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { generateResumePdf } from "@/lib/studentResume";
import { scopedFullStudent } from "@/lib/student360";

/** The college's own resume format, generated only from verified data. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedFullStudent(s, id);
  const r = await generateResumePdf(s.collegeId, id);
  if (!r) throw new ApiError(409, "NOTHING_VERIFIED", "No verified sections yet, so there is nothing to put on a resume");
  return new Response(new Uint8Array(r.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.fileName}"` } });
});

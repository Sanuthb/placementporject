import { recruiterRoute, recruiterDrive } from "@/lib/api/recruiterHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { generateResumePdf } from "@/lib/studentResume";

/** The candidate's resume in the college format, only for students shortlisted in this recruiter's drive. */
export const GET = recruiterRoute<{ id: string; studentId: string }>(async (_req, r, { id, studentId }) => {
  await recruiterDrive(r, id);
  if (!(await db.application.findFirst({ where: { driveId: id, studentId, status: "SHORTLISTED" }, select: { id: true } }))) throw notFound("Candidate not found");
  const out = await generateResumePdf(r.collegeId, studentId);
  if (!out) throw new ApiError(409, "NOTHING_VERIFIED", "This candidate has no verified resume data yet");
  return new Response(new Uint8Array(out.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${out.fileName}"` } });
});

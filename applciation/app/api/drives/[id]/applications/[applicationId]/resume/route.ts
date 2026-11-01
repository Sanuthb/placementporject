import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { getDrive } from "@/lib/drives";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** The resume an applicant sent: the profile as it was when they applied, and the file they picked, if any. */
export const GET = route<{ id: string; applicationId: string }>({ module: "DRIVES" }, async (_req, s, { id, applicationId }) => {
  await getDrive(s.collegeId, id);
  const a = await db.application.findFirst({ where: { id: applicationId, driveId: id, collegeId: s.collegeId }, select: { appliedAt: true, resumeSnapshot: true, resumeFilePath: true, resumeFileName: true, student: { select: { name: true } } } });
  if (!a) throw notFound("Application not found");
  const url = a.resumeFilePath ? (await supabaseAdmin().storage.from("student-documents").createSignedUrl(a.resumeFilePath, 600)).data?.signedUrl ?? null : null;
  return { student: a.student.name, appliedAt: a.appliedAt, snapshot: a.resumeSnapshot, file: a.resumeFileName ? { name: a.resumeFileName, url } : null };
});

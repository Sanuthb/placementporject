import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { departmentScope } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { exportVersion } from "@/lib/resumeService";

/** Download one of a student's approved resumes (?format=pdf or docx). */
export const GET = route<{ id: string; vid: string }>({ module: "ONBOARDING", limit: { name: "resume-export-staff", max: 200, windowSec: 3600 } }, async (req, s, { id, vid }) => {
  const { format } = parseQuery(req, z.object({ format: z.enum(["pdf", "docx"]).default("pdf") }));
  if (!(await db.student.findFirst({ where: { id, collegeId: s.collegeId, ...departmentScope(s) }, select: { id: true } }))) throw notFound("Student not found");
  const v = await db.resumeVersion.findFirst({ where: { id: vid, studentId: id, status: "APPROVED" } });
  if (!v) throw notFound("Resume not found");
  const college = await db.college.findUniqueOrThrow({ where: { id: s.collegeId }, select: { name: true, brandColor: true } });
  const f = await exportVersion(v, format, { college: college.name, brandColor: college.brandColor });
  return new Response(new Uint8Array(f.body), { headers: { "content-type": f.type, "content-disposition": `attachment; filename="${f.name}"` } });
});

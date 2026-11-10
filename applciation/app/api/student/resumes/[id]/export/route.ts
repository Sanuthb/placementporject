import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { exportVersion, versionOf } from "@/lib/resumeService";

/** Download as PDF or Word (?format=pdf or docx). Both are plain text in one column, so recruiters' software can read them. */
export const GET = studentRoute<{ id: string }>({ module: "ONBOARDING", limit: { name: "resume-export", max: 80, windowSec: 3600 } }, async (req, me, { id }) => {
  const { format } = parseQuery(req, z.object({ format: z.enum(["pdf", "docx"]).default("pdf") }));
  const v = await versionOf(me.studentId, id);
  const college = await db.college.findUniqueOrThrow({ where: { id: me.collegeId }, select: { name: true, brandColor: true } });
  const f = await exportVersion(v, format, { college: college.name, brandColor: college.brandColor });
  return new Response(new Uint8Array(f.body), { headers: { "content-type": f.type, "content-disposition": `attachment; filename="${f.name}"` } });
});

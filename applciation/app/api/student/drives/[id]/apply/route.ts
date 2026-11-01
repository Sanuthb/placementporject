import { studentRoute } from "@/lib/api/studentHandler";
import { z } from "zod";
import { parseBody } from "@/lib/api/parse";
import { applyToDrive } from "@/lib/ops/apply";

export const POST = studentRoute<{ id: string }>({ limit: { name: "apply", max: 120, windowSec: 3600 }, module: "DRIVES" }, async (req, me, { id }) => {
  const { resumeDocumentId } = await parseBody(req, z.object({ resumeDocumentId: z.uuid().optional() }).default({}));
  return applyToDrive({ collegeId: me.collegeId, userId: null }, id, me.studentId, "Applied by student", { resumeDocumentId });
});

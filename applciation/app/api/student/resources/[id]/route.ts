import { studentRoute } from "@/lib/api/studentHandler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { signed, studentResources } from "@/lib/resourceService";

/** One resource I may open, with a short-lived link to its file (or its web link). Opening it is recorded when I follow the link (POST progress). */
export const GET = studentRoute<{ id: string }>({ module: "STUDENT_PREP" }, async (_req, me, { id }) => {
  const r = (await studentResources(me)).find((x) => x.id === id);
  if (!r) throw notFound("Resource not found");
  const full = await db.prepResource.findFirstOrThrow({ where: { id, collegeId: me.collegeId }, select: { url: true, filePath: true, fileName: true, mimeType: true } });
  const feedback = await db.resourceProgress.findUnique({ where: { resourceId_studentId: { resourceId: id, studentId: me.studentId } }, select: { feedback: true } });
  return { ...r, url: full.url, mimeType: full.mimeType, viewUrl: full.filePath ? await signed(full.filePath) : null, downloadUrl: full.filePath ? await signed(full.filePath, full.fileName ?? "resource") : null, myFeedback: feedback?.feedback ?? null };
});

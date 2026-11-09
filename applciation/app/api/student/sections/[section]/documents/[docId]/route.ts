import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { parseSection } from "@/lib/verification";

export const DELETE = studentRoute<{ section: string; docId: string }>({ module: "ONBOARDING" }, async (_req, me, p) => {
  const section = parseSection(p.section);
  const doc = await db.sectionDocument.findFirst({ where: { id: p.docId, section: { studentId: me.studentId, section } }, include: { section: { select: { status: true, pendingData: true } } } });
  if (!doc) throw notFound("Document not found");
  if (doc.section.status === "SUBMITTED" || (doc.section.status === "VERIFIED" && doc.section.pendingData === null)) throw new ApiError(409, "CONFLICT", "This section's documents cannot be changed right now");
  await db.sectionDocument.delete({ where: { id: doc.id } });
  // The stored file is deliberately kept: an uploaded original is never deleted, only detached from the section.
  return { deleted: true };
});

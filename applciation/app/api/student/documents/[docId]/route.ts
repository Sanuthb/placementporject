import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { assertEditable } from "@/lib/invitations/guard";
import { archiveDocument, live } from "@/lib/documentStore";

/** Remove one of my documents from my file. Only my own, and not once staff have verified it (replace it instead). The file itself is kept. */
export const DELETE = studentRoute<{ docId: string }>({ module: "ONBOARDING" }, async (_req, me, { docId }) => {
  await assertEditable(me.studentId);
  const d = await db.studentDocument.findFirst({ where: { id: docId, studentId: me.studentId, ...live } });
  if (!d) throw notFound("Document not found");
  if (d.status === "VERIFIED") throw badRequest("This document has been verified and cannot be removed. Upload a replacement instead");
  await archiveDocument({ ctx: { collegeId: me.collegeId, userId: null }, studentId: me.studentId, docId });
  return { deleted: true };
});

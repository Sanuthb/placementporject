import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertEditable } from "@/lib/invitations/guard";
import { BUCKET } from "@/lib/invitations/wizard";

/** Remove one of my documents. Only my own, and not once staff have verified it. */
export const DELETE = studentRoute<{ docId: string }>({ module: "ONBOARDING" }, async (_req, me, { docId }) => {
  await assertEditable(me.studentId);
  const d = await db.studentDocument.findFirst({ where: { id: docId, studentId: me.studentId } });
  if (!d) throw notFound("Document not found");
  if (d.status === "VERIFIED") throw badRequest("This document has been verified and cannot be removed");
  await db.$transaction(async (tx) => {
    await tx.studentDocument.delete({ where: { id: docId } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.document.delete", entity: "Student", entityId: me.studentId, before: { category: d.category, fileName: d.fileName } }, tx);
  });
  await supabaseAdmin().storage.from(BUCKET).remove([d.storagePath]);
  return { deleted: true };
});

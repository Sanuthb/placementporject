import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopedStudent } from "@/lib/verification";
import { syncOnboardingStatus } from "@/lib/invitations/status";

type P = { id: string; docId: string };

const review = z.object({ status: z.enum(["VERIFIED", "REJECTED", "PENDING"]), rejectReason: z.string().trim().min(3).max(300).optional() })
  .refine((v) => v.status !== "REJECTED" || !!v.rejectReason, { message: "Say why the document is rejected", path: ["rejectReason"] });

/** Verify, reject or reopen a document. Records who did it and when. */
export const PATCH = route<P>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id, docId }) => {
  await scopedStudent(s, id);
  const data = await parseBody(req, review);
  return db.$transaction(async (tx) => {
    const before = await tx.studentDocument.findFirst({ where: { id: docId, studentId: id, collegeId: s.collegeId } });
    if (!before) throw notFound("Document not found");
    const pending = data.status === "PENDING";
    const after = await tx.studentDocument.update({
      where: { id: docId },
      data: { status: data.status, rejectReason: data.status === "REJECTED" ? data.rejectReason : null, verifiedById: pending ? null : s.userId, verifiedAt: pending ? null : new Date() },
      select: { id: true, status: true, verifiedAt: true, rejectReason: true },
    });
    await audit(s, { action: `student.document.${data.status.toLowerCase()}`, entity: "Student", entityId: id, before: { status: before.status }, after: { docId, status: data.status, reason: data.rejectReason ?? null } }, tx);
    await syncOnboardingStatus(tx, id);
    return after;
  });
});

/** Remove a document. A verified one has to be reopened first, so a verified record is never lost by a stray click. */
export const DELETE = route<P>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (_req, s, { id, docId }) => {
  await scopedStudent(s, id);
  const d = await db.studentDocument.findFirst({ where: { id: docId, studentId: id, collegeId: s.collegeId } });
  if (!d) throw notFound("Document not found");
  if (d.status === "VERIFIED") throw badRequest("This document is verified. Reopen it before removing it");
  await db.$transaction(async (tx) => {
    await tx.studentDocument.delete({ where: { id: docId } });
    await audit(s, { action: "student.document.delete", entity: "Student", entityId: id, before: { category: d.category, fileName: d.fileName } }, tx);
  });
  await supabaseAdmin().storage.from("student-documents").remove([d.storagePath]);
  return { deleted: true };
});

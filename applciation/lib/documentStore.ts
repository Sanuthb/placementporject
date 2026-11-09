import { randomUUID } from "node:crypto";
import type { DocCategory } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncOnboardingStatus } from "@/lib/invitations/status";
import { DocumentRejected, inspectUpload } from "@/lib/documents";

export const DOC_BUCKET = "student-documents";
export const MAX_ACTIVE_DOCS = 20;
/** Rows that are still part of the student's file. Removed and replaced documents are archived and never show up in these. */
export const live = { archivedAt: null } as const;

type Ctx = { collegeId: string; userId: string | null };
const SELECT = { id: true, category: true, fileName: true, mimeType: true, sizeBytes: true, status: true, createdAt: true, replacesId: true } as const;

/**
 * Stores one document: checks the bytes, refuses a file the student already has, and (when `replacesId` is given) archives the older
 * version in the same transaction. The older file is kept in storage, so an original is never lost. A replacement starts as PENDING,
 * even when the document it replaces was verified.
 */
export async function addDocument(o: { ctx: Ctx; studentId: string; file: File; category: DocCategory; replacesId?: string | null }) {
  const { ctx, studentId, file } = o;
  let insp;
  const bytes = Buffer.from(await file.arrayBuffer());
  try { insp = inspectUpload(bytes, file.type, file.name); } catch (e) { if (e instanceof DocumentRejected) throw badRequest(e.message); throw e; }

  const old = o.replacesId ? await db.studentDocument.findFirst({ where: { id: o.replacesId, studentId, collegeId: ctx.collegeId, ...live } }) : null;
  if (o.replacesId && !old) throw notFound("The document to replace was not found");
  const category = old?.category ?? o.category;
  if (!old && (await db.studentDocument.count({ where: { studentId, ...live } })) >= MAX_ACTIVE_DOCS) throw badRequest(`At most ${MAX_ACTIVE_DOCS} documents`);
  const dup = await db.studentDocument.findFirst({ where: { studentId, sha256: insp.sha256, ...live }, select: { fileName: true } });
  if (dup) throw new ApiError(409, "CONFLICT", `This file is already uploaded as "${dup.fileName}"`);

  const path = `${ctx.collegeId}/${studentId}/academic/${randomUUID()}-${insp.safeName}`;
  const up = await supabaseAdmin().storage.from(DOC_BUCKET).upload(path, bytes, { contentType: insp.mime });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  try {
    return await db.$transaction(async (tx) => {
      const d = await tx.studentDocument.create({
        data: { collegeId: ctx.collegeId, studentId, category, storagePath: path, fileName: file.name.slice(0, 200), mimeType: insp.mime, sizeBytes: bytes.length, sha256: insp.sha256, replacesId: old?.id ?? null },
        select: SELECT,
      });
      if (old) {
        await tx.studentDocument.update({ where: { id: old.id }, data: { archivedAt: new Date(), archivedById: ctx.userId, archiveReason: "REPLACED" } });
        await syncOnboardingStatus(tx, studentId);
      }
      if (ctx.userId === null) await tx.student.update({ where: { id: studentId }, data: { lastActivityAt: new Date() } });
      await audit(ctx, { action: old ? "student.document.replace" : "student.document.add", entity: "Student", entityId: studentId, before: old ? { docId: old.id, fileName: old.fileName, status: old.status } : undefined, after: { docId: d.id, category: d.category, fileName: d.fileName, sha256: insp.sha256 } }, tx);
      return d;
    });
  } catch (e) {
    await supabaseAdmin().storage.from(DOC_BUCKET).remove([path]); // the new file only; nothing already stored is touched
    throw e;
  }
}

/** Takes a document out of the live file without deleting it. The stored file and the row stay for history and audit. */
export async function archiveDocument(o: { ctx: Ctx; studentId: string; docId: string; reason?: string }) {
  const d = await db.studentDocument.findFirst({ where: { id: o.docId, studentId: o.studentId, collegeId: o.ctx.collegeId, ...live } });
  if (!d) throw notFound("Document not found");
  await db.$transaction(async (tx) => {
    await tx.studentDocument.update({ where: { id: d.id }, data: { archivedAt: new Date(), archivedById: o.ctx.userId, archiveReason: o.reason ?? "REMOVED" } });
    await audit(o.ctx, { action: "student.document.delete", entity: "Student", entityId: o.studentId, before: { docId: d.id, category: d.category, fileName: d.fileName, status: d.status } }, tx);
    await syncOnboardingStatus(tx, o.studentId);
  });
  return d;
}

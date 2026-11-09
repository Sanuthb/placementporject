import { randomUUID } from "node:crypto";
import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertEditable } from "@/lib/invitations/guard";
import { BUCKET } from "@/lib/invitations/wizard";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;
const category = z.enum(["TENTH_MARKS", "TWELFTH_MARKS", "DIPLOMA_CERTIFICATE", "DEGREE_MARKS", "DEGREE_CERTIFICATE", "PROVISIONAL_CERTIFICATE", "OTHER"]);

/** My academic documents, with short-lived links. The files are private. */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const rows = await db.studentDocument.findMany({ where: { studentId: me.studentId }, orderBy: { createdAt: "desc" } });
  const bucket = supabaseAdmin().storage.from(BUCKET);
  return Promise.all(rows.map(async (d) => ({ id: d.id, category: d.category, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, status: d.status, rejectReason: d.rejectReason, createdAt: d.createdAt, url: (await bucket.createSignedUrl(d.storagePath, 600)).data?.signedUrl ?? null })));
});

/** Upload one document (multipart fields "file" and "category"). The file type is checked from its content, not only its name. */
export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "student-upload", max: 100, windowSec: 3600 } }, async (req, me) => {
  const form = await readForm(req, MAX_BYTES);
  const file = form.get("file");
  const cat = category.safeParse(form.get("category"));
  if (!(file instanceof File)) throw badRequest('Send the document as multipart field "file"');
  if (!cat.success) throw badRequest("Choose a document category");
  if (file.size === 0) throw badRequest("The file is empty");
  if (file.size > MAX_BYTES) throw badRequest("File is larger than 10 MB");
  if (!TYPES.has(file.type)) throw badRequest("Allowed types: PDF, PNG, JPEG");
  await assertEditable(me.studentId);
  if ((await db.studentDocument.count({ where: { studentId: me.studentId } })) >= MAX_FILES) throw badRequest(`At most ${MAX_FILES} documents`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const head = bytes.subarray(0, 4);
  const sniff = head.subarray(0, 4).toString("latin1");
  const real = sniff.startsWith("%PDF") ? "application/pdf" : head[0] === 0x89 && sniff.slice(1, 4) === "PNG" ? "image/png" : head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg" : null;
  if (real !== file.type) throw badRequest("The file content does not match its type");

  const path = `${me.collegeId}/${me.studentId}/academic/${randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`;
  const up = await supabaseAdmin().storage.from(BUCKET).upload(path, bytes, { contentType: file.type });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  try {
    return await db.$transaction(async (tx) => {
      const d = await tx.studentDocument.create({
        data: { collegeId: me.collegeId, studentId: me.studentId, category: cat.data, storagePath: path, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size },
        select: { id: true, category: true, fileName: true, mimeType: true, sizeBytes: true, status: true, createdAt: true },
      });
      await tx.student.update({ where: { id: me.studentId }, data: { lastActivityAt: new Date() } });
      await audit({ collegeId: me.collegeId, userId: null }, { action: "student.document.add", entity: "Student", entityId: me.studentId, after: { category: d.category, fileName: d.fileName } }, tx);
      return d;
    });
  } catch (e) {
    await supabaseAdmin().storage.from(BUCKET).remove([path]);
    throw e;
  }
});

import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertEditable } from "@/lib/invitations/guard";
import { BUCKET } from "@/lib/invitations/wizard";
import { DOC_MAX_BYTES } from "@/lib/documents";
import { addDocument, live } from "@/lib/documentStore";

const category = z.enum(["TENTH_MARKS", "TWELFTH_MARKS", "DIPLOMA_CERTIFICATE", "DEGREE_MARKS", "DEGREE_CERTIFICATE", "PROVISIONAL_CERTIFICATE", "OTHER"]);

/** My academic documents, with short-lived links. The files are private. Removed and replaced versions are not listed here. */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const rows = await db.studentDocument.findMany({ where: { studentId: me.studentId, ...live }, orderBy: { createdAt: "desc" } });
  const bucket = supabaseAdmin().storage.from(BUCKET);
  return Promise.all(rows.map(async (d) => ({ id: d.id, category: d.category, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, status: d.status, rejectReason: d.rejectReason, createdAt: d.createdAt, replacesId: d.replacesId, url: (await bucket.createSignedUrl(d.storagePath, 600)).data?.signedUrl ?? null })));
});

/** Upload one document (multipart fields "file" and "category"). The file type is checked from its content, not only its name. */
export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "student-upload", max: 100, windowSec: 3600 } }, async (req, me) => {
  const form = await readForm(req, DOC_MAX_BYTES);
  const file = form.get("file");
  const cat = category.safeParse(form.get("category"));
  if (!(file instanceof File)) throw badRequest('Send the document as multipart field "file"');
  if (!cat.success) throw badRequest("Choose a document category");
  await assertEditable(me.studentId);
  return addDocument({ ctx: { collegeId: me.collegeId, userId: null }, studentId: me.studentId, file, category: cat.data });
});

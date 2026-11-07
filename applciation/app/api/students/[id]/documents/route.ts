import { randomUUID } from "node:crypto";
import { z } from "zod";
import { route } from "@/lib/api/handler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopedStudent } from "@/lib/verification";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 20;
const BUCKET = "student-documents";
const category = z.enum(["TENTH_MARKS", "TWELFTH_MARKS", "DIPLOMA_CERTIFICATE", "DEGREE_MARKS", "DEGREE_CERTIFICATE", "PROVISIONAL_CERTIFICATE", "OTHER"]);

/** Documents with short-lived download links. The files themselves are never public. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const rows = await db.studentDocument.findMany({
    where: { studentId: id, collegeId: s.collegeId },
    include: { verifiedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const bucket = supabaseAdmin().storage.from(BUCKET);
  return Promise.all(rows.map(async ({ storagePath, ...d }) => ({ ...d, url: (await bucket.createSignedUrl(storagePath, 600)).data?.signedUrl ?? null })));
});

/** Upload one document (multipart fields "file" and "category"). */
export const POST = route<{ id: string }>({ limit: { name: "upload", max: 120, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id }) => {
  await scopedStudent(s, id);
  const form = await readForm(req, MAX_BYTES);
  const file = form.get("file");
  const cat = category.safeParse(form.get("category"));
  if (!(file instanceof File)) throw badRequest('Send the document as multipart field "file"');
  if (!cat.success) throw badRequest("Choose a document category");
  if (file.size === 0) throw badRequest("The file is empty");
  if (file.size > MAX_BYTES) throw badRequest("File is larger than 10 MB");
  if (!TYPES.has(file.type)) throw badRequest("Allowed types: PDF, PNG, JPEG");
  if ((await db.studentDocument.count({ where: { studentId: id } })) >= MAX_FILES) throw badRequest(`At most ${MAX_FILES} documents per student`);

  const path = `${s.collegeId}/${id}/academic/${randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`;
  const up = await supabaseAdmin().storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  try {
    return await db.$transaction(async (tx) => {
      const d = await tx.studentDocument.create({
        data: { collegeId: s.collegeId, studentId: id, category: cat.data, storagePath: path, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size },
        select: { id: true, category: true, fileName: true, mimeType: true, sizeBytes: true, status: true, createdAt: true },
      });
      await audit(s, { action: "student.document.add", entity: "Student", entityId: id, after: { category: d.category, fileName: d.fileName } }, tx);
      return d;
    });
  } catch (e) {
    await supabaseAdmin().storage.from(BUCKET).remove([path]); // no orphan file if the record could not be saved
    throw e;
  }
});

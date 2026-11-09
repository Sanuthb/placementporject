import { randomUUID } from "node:crypto";
import { readForm } from "@/lib/api/parse";
import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseSection } from "@/lib/verification";
import { DOC_MAX_BYTES, DocumentRejected, inspectUpload } from "@/lib/documents";

const MAX_FILES = 10;

/** Upload proof (marksheet, ID) for a section (multipart field "file"). Not allowed while the section is under review. */
export const POST = studentRoute<{ section: string }>({ limit: { name: "upload", max: 60, windowSec: 3600 }, module: "ONBOARDING" }, async (req, me, p) => {
  const section = parseSection(p.section);
  const file = (await readForm(req, DOC_MAX_BYTES)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the document as multipart field "file"');
  const bytes = Buffer.from(await file.arrayBuffer());
  let insp;
  try { insp = inspectUpload(bytes, file.type, file.name); } catch (e) { if (e instanceof DocumentRejected) throw badRequest(e.message); throw e; }

  const row = await db.studentSection.upsert({ where: { studentId_section: { studentId: me.studentId, section } }, update: {}, create: { collegeId: me.collegeId, studentId: me.studentId, section }, include: { _count: { select: { documents: true } } } });
  if (row.status === "SUBMITTED") throw new ApiError(409, "CONFLICT", "This section is under review");
  if (row.status === "VERIFIED" && row.pendingData === null) throw new ApiError(409, "CONFLICT", "This section is verified. Start a correction first by saving changes to it");
  if (row._count.documents >= MAX_FILES) throw badRequest(`At most ${MAX_FILES} documents per section`);

  const path = `${me.collegeId}/${me.studentId}/${section}/${randomUUID()}-${insp.safeName}`;
  const up = await supabaseAdmin().storage.from("student-documents").upload(path, bytes, { contentType: insp.mime });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return db.$transaction(async (tx) => {
    const d = await tx.sectionDocument.create({ data: { collegeId: me.collegeId, sectionId: row.id, storagePath: path, fileName: file.name.slice(0, 200), mimeType: insp.mime, sizeBytes: bytes.length }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "section.document.add", entity: "StudentSection", entityId: row.id, after: { fileName: d.fileName } }, tx);
    return d;
  });
});

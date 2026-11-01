import { randomUUID } from "node:crypto";
import { readForm } from "@/lib/api/parse";
import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseSection } from "@/lib/verification";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_FILES = 10;

/** Upload proof (marksheet, ID) for a section (multipart field "file"). Not allowed while the section is under review. */
export const POST = studentRoute<{ section: string }>({ limit: { name: "upload", max: 60, windowSec: 3600 }, module: "ONBOARDING" }, async (req, me, p) => {
  const section = parseSection(p.section);
  const file = (await readForm(req, 10 * 1024 * 1024)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the document as multipart field "file"');
  if (file.size > 10 * 1024 * 1024) throw badRequest("File is larger than 10 MB");
  if (!TYPES.has(file.type)) throw badRequest("Allowed types: PDF, PNG, JPEG");

  const row = await db.studentSection.upsert({ where: { studentId_section: { studentId: me.studentId, section } }, update: {}, create: { collegeId: me.collegeId, studentId: me.studentId, section }, include: { _count: { select: { documents: true } } } });
  if (row.status === "SUBMITTED") throw new ApiError(409, "CONFLICT", "This section is under review");
  if (row.status === "VERIFIED" && row.pendingData === null) throw new ApiError(409, "CONFLICT", "This section is verified. Start a correction first by saving changes to it");
  if (row._count.documents >= MAX_FILES) throw badRequest(`At most ${MAX_FILES} documents per section`);

  const path = `${me.collegeId}/${me.studentId}/${section}/${randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`;
  const up = await supabaseAdmin().storage.from("student-documents").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return db.$transaction(async (tx) => {
    const d = await tx.sectionDocument.create({ data: { collegeId: me.collegeId, sectionId: row.id, storagePath: path, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "section.document.add", entity: "StudentSection", entityId: row.id, after: { fileName: d.fileName } }, tx);
    return d;
  });
});

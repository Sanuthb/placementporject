import { randomUUID } from "node:crypto";
import { readForm } from "@/lib/api/parse";
import { route } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX = 10 * 1024 * 1024;
const TYPES = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"]);

/** Attaches a job description or other document to the drive (multipart field "file"). */
export const POST = route<{ id: string }>({ limit: { name: "upload", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  await getDrive(s.collegeId, id);
  const file = (await readForm(req, 10 * 1024 * 1024)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the document as multipart field "file"');
  if (file.size > MAX) throw badRequest("File is larger than 10 MB");
  if (!TYPES.has(file.type)) throw badRequest("Allowed types: PDF, Word, PNG, JPEG");

  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
  const path = `${s.collegeId}/${id}/${randomUUID()}-${safe}`;
  const up = await supabaseAdmin().storage.from("drive-documents").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return db.$transaction(async (tx) => {
    const doc = await tx.driveDocument.create({ data: { driveId: id, storagePath: path, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true } });
    await audit(s, { action: "drive.document.add", entity: "Drive", entityId: id, after: { fileName: doc.fileName } }, tx);
    return doc;
  });
});

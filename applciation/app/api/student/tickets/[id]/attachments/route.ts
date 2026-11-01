import { randomUUID } from "node:crypto";
import { readForm } from "@/lib/api/parse";
import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

/** Attach a screenshot or document to my support request (multipart field "file"). */
export const POST = studentRoute<{ id: string }>({ limit: { name: "upload", max: 60, windowSec: 3600 } }, async (req, me, { id }) => {
  const t = await db.ticket.findFirst({ where: { id, studentId: me.studentId }, select: { status: true, _count: { select: { attachments: true } } } });
  if (!t) throw notFound("Ticket not found");
  if (t.status === "RESOLVED") throw new ApiError(409, "CONFLICT", "This request is resolved. Raise a new one if you still need help");
  if (t._count.attachments >= MAX_FILES) throw badRequest(`At most ${MAX_FILES} files per request`);
  const file = (await readForm(req, MAX_BYTES)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the file as multipart field "file"');
  if (file.size > MAX_BYTES) throw badRequest("File is larger than 5 MB");
  if (!TYPES.has(file.type)) throw badRequest("Allowed types: PDF, PNG, JPEG");
  const path = `${me.collegeId}/${me.studentId}/tickets/${id}/${randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`;
  const up = await supabaseAdmin().storage.from("student-documents").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return db.ticketAttachment.create({ data: { ticketId: id, storagePath: path, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size }, select: { id: true, fileName: true } });
});

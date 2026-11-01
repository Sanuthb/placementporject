import { randomUUID } from "node:crypto";
import { readForm } from "@/lib/api/parse";
import { route } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

/** Stores the offer letter (multipart field "file"), replacing any previous one. */
export const POST = route<{ id: string }>({ limit: { name: "upload", max: 120, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const offer = await db.offer.findFirst({ where: { id, collegeId: s.collegeId }, select: { letterPath: true } });
  if (!offer) throw notFound("Offer not found");
  const file = (await readForm(req, 10 * 1024 * 1024)).get("file");
  if (!(file instanceof File)) throw badRequest('Send the letter as multipart field "file"');
  if (file.size > 10 * 1024 * 1024) throw badRequest("File is larger than 10 MB");
  if (!TYPES.has(file.type)) throw badRequest("Allowed types: PDF, PNG, JPEG");

  const bucket = supabaseAdmin().storage.from("offer-letters");
  const path = `${s.collegeId}/${id}/${randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`;
  const up = await bucket.upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return db.$transaction(async (tx) => {
    await tx.offer.update({ where: { id }, data: { letterPath: path, letterName: file.name.slice(0, 200) } });
    await audit(s, { action: "offer.letter", entity: "Offer", entityId: id, after: { fileName: file.name } }, tx);
    if (offer.letterPath) await bucket.remove([offer.letterPath]); // best effort: the new file is already saved
    return { id, letterName: file.name };
  });
});

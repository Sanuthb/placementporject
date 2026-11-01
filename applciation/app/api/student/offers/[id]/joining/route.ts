import { randomUUID } from "node:crypto";
import { readForm } from "@/lib/api/parse";
import { studentRoute } from "@/lib/api/studentHandler";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const MAX = 5 * 1024 * 1024;

/** I joined: tell the placement office the date and, if I have it, attach the joining letter (multipart fields "joiningDate" and optional "file"). Staff confirm it. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "upload", max: 60, windowSec: 3600 }, module: "DRIVES" }, async (req, me, { id }) => {
  const form = await readForm(req, MAX);
  const date = new Date(String(form.get("joiningDate") ?? ""));
  if (Number.isNaN(date.getTime())) throw badRequest("Enter your joining date");
  const offer = await db.offer.findFirst({ where: { id, studentId: me.studentId }, select: { status: true, joiningProofPath: true } });
  if (!offer) throw notFound("Offer not found");
  if (offer.status !== "ACCEPTED") throw new ApiError(409, "CONFLICT", "You can confirm joining only for an offer you accepted");
  const file = form.get("file");
  let proof: { path: string; name: string } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX) throw badRequest("File is larger than 5 MB");
    if (!TYPES.has(file.type)) throw badRequest("Allowed types: PDF, PNG, JPEG");
    const path = `${me.collegeId}/${me.studentId}/joining/${id}/${randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100)}`;
    const up = await supabaseAdmin().storage.from("student-documents").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (up.error) throw badRequest("Upload failed: " + up.error.message);
    proof = { path, name: file.name.slice(0, 200) };
  }
  await db.$transaction(async (tx) => {
    await tx.offer.update({ where: { id }, data: { studentJoiningDate: date, ...(proof ? { joiningProofPath: proof.path, joiningProofName: proof.name } : {}) } });
    await audit({ collegeId: me.collegeId, userId: null }, { action: "offer.joining-report", entity: "Offer", entityId: id }, tx);
  });
  return { reported: true };
});

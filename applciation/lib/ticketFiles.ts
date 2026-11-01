import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** A ticket's attachments with short-lived download links. */
export async function ticketAttachments(ticketId: string) {
  const rows = await db.ticketAttachment.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, mimeType: true, storagePath: true } });
  const bucket = supabaseAdmin().storage.from("student-documents");
  return Promise.all(rows.map(async ({ storagePath, ...a }) => ({ ...a, url: (await bucket.createSignedUrl(storagePath, 600)).data?.signedUrl ?? null })));
}

import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseSection, saveSection } from "@/lib/verification";

const put = z.object({ data: z.record(z.string(), z.unknown()), submit: z.boolean().default(false) });

export const GET = studentRoute<{ section: string }>({ module: "ONBOARDING" }, async (_req, me, p) => {
  const section = parseSection(p.section);
  const row = await db.studentSection.findUnique({ where: { studentId_section: { studentId: me.studentId, section } }, include: { documents: true } });
  if (!row) return { section, status: "DRAFT", data: {}, pendingData: null, reviewComment: null, documents: [] };
  const bucket = supabaseAdmin().storage.from("student-documents");
  const documents = await Promise.all(row.documents.map(async (d) => ({ id: d.id, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes, url: (await bucket.createSignedUrl(d.storagePath, 600)).data?.signedUrl ?? null })));
  const ev = row.status === "VERIFIED" ? await db.verificationEvent.findFirst({ where: { studentId: me.studentId, section, action: "APPROVED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, actor: { select: { name: true } } } }) : null;
  return { section, status: row.status, data: row.data, pendingData: row.pendingData, reviewComment: row.reviewComment, submittedAt: row.submittedAt, verifiedBy: ev ? { name: ev.actor?.name ?? "Placement staff", at: ev.createdAt } : null, documents };
});

/**
 * Save a draft or submit for review. Changing an already-verified section never overwrites it: the change waits
 * as a pending revision until staff approve it.
 */
export const PUT = studentRoute<{ section: string }>({ module: "ONBOARDING" }, async (req, me, p) => {
  const section = parseSection(p.section);
  const { data, submit } = await parseBody(req, put);
  return db.$transaction(async (tx) => {
    const row = await saveSection(tx, { collegeId: me.collegeId, actorId: null }, me.studentId, section, data, submit);
    await audit({ collegeId: me.collegeId, userId: null }, { action: submit ? "section.submit" : "section.save", entity: "StudentSection", entityId: row.id, after: { section, studentId: me.studentId } }, tx);
    return { section, status: row.status };
  });
});

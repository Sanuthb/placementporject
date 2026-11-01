import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseSection, saveSection, scopedStudent } from "@/lib/verification";

const BUCKET = "student-documents";
const put = z.object({ data: z.record(z.string(), z.unknown()), submit: z.boolean().default(false) });

/** Review view: current data, any pending revision, proof documents (short-lived links) and history. */
export const GET = route<{ id: string; section: string }>({ module: "ONBOARDING" }, async (_req, s, p) => {
  await scopedStudent(s, p.id);
  const section = parseSection(p.section);
  const row = await db.studentSection.findUnique({ where: { studentId_section: { studentId: p.id, section } }, include: { documents: true } });
  const history = await db.verificationEvent.findMany({
    where: { studentId: p.id, section },
    select: { id: true, action: true, comment: true, createdAt: true, actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { section, status: "DRAFT", data: {}, pendingData: null, documents: [], history };

  const sb = supabaseAdmin().storage.from(BUCKET);
  const documents = await Promise.all(row.documents.map(async (d) => ({
    id: d.id, fileName: d.fileName, mimeType: d.mimeType, sizeBytes: d.sizeBytes,
    url: (await sb.createSignedUrl(d.storagePath, 600)).data?.signedUrl ?? null,
  })));
  return { ...row, documents, history };
});

/** Staff entering or correcting a section on a student's behalf. */
export const PUT = route<{ id: string; section: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, p) => {
  await scopedStudent(s, p.id);
  const section = parseSection(p.section);
  const { data, submit } = await parseBody(req, put);
  return db.$transaction(async (tx) => {
    const row = await saveSection(tx, { collegeId: s.collegeId, actorId: s.userId }, p.id, section, data, submit);
    await audit(s, { action: submit ? "section.submitOnBehalf" : "section.saveOnBehalf", entity: "StudentSection", entityId: row.id, after: { section, studentId: p.id } }, tx);
    return { id: row.id, section, status: row.status };
  });
});

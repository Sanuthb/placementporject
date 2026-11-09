import { z } from "zod";
import { route } from "@/lib/api/handler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopedStudent } from "@/lib/verification";
import { DOC_MAX_BYTES } from "@/lib/documents";
import { addDocument, DOC_BUCKET } from "@/lib/documentStore";

const category = z.enum(["TENTH_MARKS", "TWELFTH_MARKS", "DIPLOMA_CERTIFICATE", "DEGREE_MARKS", "DEGREE_CERTIFICATE", "PROVISIONAL_CERTIFICATE", "OTHER"]);

/** Documents with short-lived download links. The files themselves are never public. `?history=1` also lists removed and replaced versions. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (req, s, { id }) => {
  await scopedStudent(s, id);
  const history = new URL(req.url).searchParams.get("history") === "1";
  const rows = await db.studentDocument.findMany({
    where: { studentId: id, collegeId: s.collegeId, ...(history ? {} : { archivedAt: null }) },
    include: { verifiedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const bucket = supabaseAdmin().storage.from(DOC_BUCKET);
  return Promise.all(rows.map(async ({ storagePath, ...d }) => ({ ...d, url: (await bucket.createSignedUrl(storagePath, 600)).data?.signedUrl ?? null })));
});

/** Upload one document (multipart fields "file" and "category"; optional "replaces" = id of the document this one replaces). */
export const POST = route<{ id: string }>({ limit: { name: "upload", max: 120, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id }) => {
  await scopedStudent(s, id);
  const form = await readForm(req, DOC_MAX_BYTES);
  const file = form.get("file");
  const cat = category.safeParse(form.get("category"));
  const replaces = z.string().uuid().safeParse(form.get("replaces"));
  if (!(file instanceof File)) throw badRequest('Send the document as multipart field "file"');
  if (!cat.success) throw badRequest("Choose a document category");
  return addDocument({ ctx: s, studentId: id, file, category: cat.data, replacesId: replaces.success ? replaces.data : null });
});

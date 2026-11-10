import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { blankJd } from "@/lib/jd";
import { JD_ADMIN, JD_MAX_BYTES, readJdFile, storeJdFile } from "@/lib/jdService";
import { readForm } from "@/lib/api/parse";
import { JdStatus } from "@/generated/prisma/client";
import { cleanText } from "@/lib/jd";

/** Job descriptions, newest first. */
export const GET = route(JD_ADMIN, async (req, s) => {
  const q = parseQuery(req, z.object({ status: z.enum(JdStatus).optional() }));
  const rows = await db.jobDescription.findMany({ where: { collegeId: s.collegeId, status: q.status }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, title: true, companyName: true, status: true, source: true, driveId: true, extractedAt: true, approvedAt: true, updatedAt: true } });
  return rows;
});

/**
 * Add a job description. Three ways: upload a file (multipart "file": PDF, Word or text), paste text (JSON {source: "PASTE", text}), or start by hand (JSON {source: "MANUAL"}).
 * It is created as a draft. Reading it with the AI is a separate step (POST .../extract), so nothing is sent anywhere until you ask.
 */
export const POST = route(JD_ADMIN, async (req, s) => {
  let source: "UPLOAD" | "PASTE" | "MANUAL", rawText: string | null = null, file: Awaited<ReturnType<typeof storeJdFile>> | null = null, title = "", company = "";
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/")) {
    const f = await readForm(req, JD_MAX_BYTES);
    const up = f.get("file");
    if (!(up instanceof File) || up.size === 0) throw badRequest('Send the job description as multipart field "file"');
    const read = await readJdFile(up);
    rawText = read.text; source = "UPLOAD"; file = await storeJdFile(s.collegeId, up, read.mime);
    title = String(f.get("title") ?? "").trim().slice(0, 150); company = String(f.get("company") ?? "").trim().slice(0, 200);
  } else {
    const b = (await req.json().catch(() => null)) as { source?: string; text?: string; title?: string; company?: string } | null;
    if (!b || !["PASTE", "MANUAL"].includes(String(b.source))) throw badRequest('Send {"source": "PASTE", "text": "..."} or {"source": "MANUAL"}');
    source = b.source as "PASTE" | "MANUAL"; title = String(b.title ?? "").trim().slice(0, 150); company = String(b.company ?? "").trim().slice(0, 200);
    if (source === "PASTE") {
      rawText = cleanText(String(b.text ?? "")).slice(0, 30000);
      if (rawText.length < 80) throw new ApiError(400, "BAD_REQUEST", "Paste the job description (at least a few sentences)");
    }
  }
  const data = blankJd({ title, company, description: "" });
  const j = await db.jobDescription.create({ data: { collegeId: s.collegeId, source, title: title || "Untitled job description", companyName: company, rawText, ...(file ?? {}), data: data as object, createdById: s.userId } });
  await audit(s, { action: "jd.create", entity: "JobDescription", entityId: j.id, after: { source } });
  return { id: j.id };
});

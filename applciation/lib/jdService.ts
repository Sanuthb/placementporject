import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { db } from "@/lib/db";
import type { ModuleKey, Role } from "@/generated/prisma/client";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DOC_BUCKET } from "@/lib/documentStore";
import { JD_MAX_CHARS, cleanText, docxXmlText, jdData, type JdData } from "@/lib/jd";

export const JD_ADMIN: { roles: Role[]; module: ModuleKey } = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" };
export const JD_MAX_BYTES = 10 * 1024 * 1024;
const MIN_TEXT = 80;

export async function jdOf(collegeId: string, id: string) {
  const j = await db.jobDescription.findFirst({ where: { id, collegeId } });
  if (!j) throw notFound("Job description not found");
  return j;
}
export const dataOf = (j: { data: unknown }): JdData => jdData.parse(j.data);

/**
 * The text of an uploaded job description. PDF (with a text layer), Word (.docx, no macros) and plain text are accepted; the type is read from the file's
 * content. A scanned PDF has no text to read, so the person is asked to paste it.
 */
export async function readJdFile(file: File): Promise<{ text: string; mime: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) throw badRequest("The file is empty");
  if (bytes.length > JD_MAX_BYTES) throw badRequest("The file is larger than 10 MB");
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const head = Buffer.from(bytes.subarray(0, 8));
  let text = "", mime = "";
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") {
    if (ext !== "pdf") throw badRequest("The file name must end in .pdf");
    try { const pdf = await getDocumentProxy(bytes); text = (await extractText(pdf, { mergePages: true })).text; } catch { throw badRequest("This PDF could not be read. Paste the text instead"); }
    mime = "application/pdf";
  } else if (head[0] === 0x50 && head[1] === 0x4b) {
    if (ext !== "docx") throw badRequest("Only Word .docx files are accepted");
    try {
      const zip = await JSZip.loadAsync(bytes);
      if (zip.file("word/vbaProject.bin")) throw badRequest("Files with macros are not accepted");
      const xml = await zip.file("word/document.xml")?.async("string");
      if (!xml) throw badRequest("This is not a Word document");
      text = docxXmlText(xml);
    } catch (e) { if (e instanceof ApiError) throw e; throw badRequest("This Word file could not be read. Paste the text instead"); }
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (["txt", "text", "md"].includes(ext) || file.type.startsWith("text/")) {
    if (bytes.includes(0)) throw badRequest("This is not a text file");
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes); mime = "text/plain";
  } else throw badRequest("Upload a PDF, a Word (.docx) file or a text file, or paste the text");
  text = cleanText(text).slice(0, JD_MAX_CHARS);
  if (text.length < MIN_TEXT) throw badRequest("There is almost no text in this file. A scanned PDF cannot be read: paste the text instead");
  return { text, mime };
}

export async function storeJdFile(collegeId: string, file: File, mime: string) {
  const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
  const path = `${collegeId}/jds/${randomUUID()}-${safe}`;
  const up = await supabaseAdmin().storage.from(DOC_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: mime });
  if (up.error) throw badRequest("Upload failed: " + up.error.message);
  return { filePath: path, fileName: file.name.slice(0, 200), mimeType: mime, sizeBytes: file.size };
}
export const jdFileUrl = async (path: string | null) => (path ? ((await supabaseAdmin().storage.from(DOC_BUCKET).createSignedUrl(path, 600)).data?.signedUrl ?? null) : null);
export const removeJdFile = async (path: string | null) => { if (path) await supabaseAdmin().storage.from(DOC_BUCKET).remove([path]).catch(() => undefined); };

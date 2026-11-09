import { createHash } from "node:crypto";

/** What a student may upload as proof. Checked from the bytes, never only from the name or the declared type. */
export const DOC_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type DocMime = (typeof DOC_TYPES)[number];
export const DOC_MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<DocMime, string[]> = { "application/pdf": ["pdf"], "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"] };

/** PDF features that run code or open other files. A marks card never needs them. */
const PDF_ACTIVE = [/\/JavaScript\b/, /\/JS\b/, /\/Launch\b/, /\/OpenAction\b/, /\/AA\b/, /\/EmbeddedFile\b/, /\/RichMedia\b/, /\/SubmitForm\b/, /\/ImportData\b/];

export class DocumentRejected extends Error {}

/** The real type of a file from its first bytes, or null when it is none of the allowed ones. */
export function sniffType(b: Uint8Array): DocMime | null {
  const s = Buffer.from(b.subarray(0, 8));
  if (s.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (s.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (s[0] === 0xff && s[1] === 0xd8 && s[2] === 0xff) return "image/jpeg";
  return null;
}

export type Inspected = { mime: DocMime; sha256: string; safeName: string };

/**
 * Checks one upload before it is stored. Throws DocumentRejected with a message fit to show the student.
 * The declared type, the file extension and the content must all agree; a PDF may not carry scripts, launch actions,
 * attachments or encryption (encrypted files cannot be read by reviewers or OCR).
 */
export function inspectUpload(bytes: Uint8Array, declaredType: string, fileName: string): Inspected {
  if (bytes.length === 0) throw new DocumentRejected("The file is empty");
  if (bytes.length > DOC_MAX_BYTES) throw new DocumentRejected("File is larger than 10 MB");
  if (bytes.length < 60) throw new DocumentRejected("The file is too small to be a real document");
  const real = sniffType(bytes);
  if (!real) throw new DocumentRejected("Allowed types: PDF, PNG, JPEG");
  if (real !== declaredType) throw new DocumentRejected("The file content does not match its type");
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (!EXT[real].includes(ext)) throw new DocumentRejected(`The file name must end in .${EXT[real][0]}`);
  if (real === "application/pdf") {
    const text = Buffer.from(bytes).toString("latin1");
    if (/\/Encrypt\b/.test(text)) throw new DocumentRejected("Password-protected PDFs cannot be reviewed. Remove the password and upload again");
    if (PDF_ACTIVE.some((r) => r.test(text))) throw new DocumentRejected("This PDF contains scripts or attachments. Save a plain copy (print to PDF) and upload that");
    if (!/%%EOF\s*$/.test(text.slice(-1024))) throw new DocumentRejected("The PDF looks incomplete or damaged");
  }
  if (real === "image/png" && !Buffer.from(bytes.subarray(-12)).toString("latin1").includes("IEND")) throw new DocumentRejected("The image looks incomplete or damaged");
  if (real === "image/jpeg" && !Buffer.from(bytes.subarray(-64)).includes(Buffer.from([0xff, 0xd9]))) throw new DocumentRejected("The image looks incomplete or damaged");
  return { mime: real, sha256: createHash("sha256").update(bytes).digest("hex"), safeName: fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100) };
}

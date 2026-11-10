import { AREA_TERMS } from "@/lib/lmsRecommend";
import { DocumentRejected, inspectUpload } from "@/lib/documents";

/** Pure resource-library rules: what files are allowed, the approval workflow, who can see what, effectiveness and recommendations. No database here. */

export type Kind = "DOCUMENT" | "IMAGE" | "VIDEO" | "AUDIO";
export const MB = 1024 * 1024;
export const LIMITS: Record<Kind, number> = { DOCUMENT: 20 * MB, IMAGE: 10 * MB, AUDIO: 30 * MB, VIDEO: 50 * MB };
export const MAX_UPLOAD = 50 * MB;

const has = (b: Uint8Array, s: string, from = 0, to = b.length) => Buffer.from(b.subarray(from, to)).includes(Buffer.from(s, "latin1"));
const extOf = (n: string) => (n.split(".").pop() ?? "").toLowerCase();

/**
 * The real type of an uploaded file, from its bytes. The extension and the content must agree. Word and PowerPoint files that can carry macros,
 * the old .doc and .ppt formats, and PDFs with scripts are refused. Throws DocumentRejected with a message fit to show.
 */
export function sniffResource(bytes: Uint8Array, fileName: string, declaredType = ""): { mime: string; kind: Kind; safeName: string } {
  const ext = extOf(fileName);
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
  const fail = (m: string): never => { throw new DocumentRejected(m); };
  const ok = (mime: string, kind: Kind, exts: string[]) => {
    if (!exts.includes(ext)) fail(`The file name must end in .${exts[0]}`);
    if (bytes.length > LIMITS[kind]) fail(`${kind === "VIDEO" ? "Videos" : kind === "AUDIO" ? "Audio files" : kind === "IMAGE" ? "Images" : "Documents"} can be at most ${LIMITS[kind] / MB} MB. ${kind === "VIDEO" ? "Add a link to a video site instead" : ""}`.trim());
    return { mime, kind, safeName };
  };
  if (bytes.length < 60) fail("The file is empty or too small");
  const head = Buffer.from(bytes.subarray(0, 16));
  if (head.subarray(0, 5).toString("latin1") === "%PDF-" || head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) {
    const i = inspectUpload(bytes, declaredType || (head[0] === 0x25 ? "application/pdf" : head[0] === 0x89 ? "image/png" : "image/jpeg"), fileName); // throws DocumentRejected
    return { mime: i.mime, kind: i.mime === "application/pdf" ? "DOCUMENT" : "IMAGE", safeName: i.safeName };
  }
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    if (has(bytes, "vbaProject.bin")) fail("Files with macros are not accepted. Save a copy without macros");
    if (has(bytes, "word/document.xml")) return ok("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "DOCUMENT", ["docx"]);
    if (has(bytes, "ppt/presentation.xml")) return ok("application/vnd.openxmlformats-officedocument.presentationml.presentation", "DOCUMENT", ["pptx"]);
    return fail("Only Word (.docx) and PowerPoint (.pptx) files are accepted from Office");
  }
  if (head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) return fail("Old .doc and .ppt files are not accepted. Save as .docx or .pptx");
  if (head.subarray(4, 8).toString("latin1") === "ftyp") return head.subarray(8, 12).toString("latin1") === "M4A " ? ok("audio/mp4", "AUDIO", ["m4a"]) : ok("video/mp4", "VIDEO", ["mp4", "m4v"]);
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return ok("video/webm", "VIDEO", ["webm"]);
  if (head.subarray(0, 3).toString("latin1") === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return ok("audio/mpeg", "AUDIO", ["mp3"]);
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WAVE") return ok("audio/wav", "AUDIO", ["wav"]);
  if (head.subarray(0, 4).toString("latin1") === "OggS") return ok("audio/ogg", "AUDIO", ["ogg", "oga"]);
  return fail("Allowed files: PDF, Word (.docx), PowerPoint (.pptx), PNG, JPEG, MP4 or WebM video, MP3, M4A, WAV or OGG audio");
}

// ---- workflow ----
export type Status = "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED";
export type Action = "SUBMIT" | "APPROVE" | "REJECT" | "ARCHIVE" | "RESTORE";
type RoleName = "TPO_ADMIN" | "PLACEMENT_OFFICER" | string;

/**
 * Upload, review, approve. Anyone who can manage resources submits a draft; only the placement admin approves or rejects (and may approve a draft
 * directly, so an admin's own upload is not stuck waiting for someone else). Rejecting needs a reason. Archived resources come back as drafts.
 */
export function nextStatus(current: Status, action: Action, role: RoleName, note?: string): { status: Status } | { error: string } {
  const admin = role === "TPO_ADMIN";
  switch (action) {
    case "SUBMIT": return current === "DRAFT" || current === "REJECTED" ? { status: "IN_REVIEW" } : { error: "Only a draft or a rejected resource can be sent for review" };
    case "APPROVE":
      if (!admin) return { error: "Only the placement admin can approve resources" };
      return current === "IN_REVIEW" || current === "DRAFT" ? { status: "APPROVED" } : { error: "Only a resource waiting for review can be approved" };
    case "REJECT":
      if (!admin) return { error: "Only the placement admin can reject resources" };
      if (current !== "IN_REVIEW") return { error: "Only a resource waiting for review can be rejected" };
      return (note ?? "").trim().length >= 3 ? { status: "REJECTED" } : { error: "Say why it is rejected" };
    case "ARCHIVE": return current === "ARCHIVED" ? { error: "Already archived" } : { status: "ARCHIVED" };
    case "RESTORE": return current === "ARCHIVED" ? { status: "DRAFT" } : { error: "Only an archived resource can be restored" };
  }
}

export type Visibility = "ALL_STUDENTS" | "ASSIGNED_ONLY" | "STAFF_ONLY";
export type Expiry = "NONE" | "OK" | "SOON" | "EXPIRED";
export function expiryState(expiresAt: Date | null | undefined, now = new Date()): Expiry {
  if (!expiresAt) return "NONE";
  const days = (expiresAt.getTime() - now.getTime()) / 86_400_000;
  return days < 0 ? "EXPIRED" : days <= 14 ? "SOON" : "OK";
}

/** A student may open a resource when it is approved, not expired, not staff-only, and either open to all students or assigned to them. */
export function studentCanSee(r: { status: string; expiresAt: Date | null; visibility: string }, assigned: boolean, now = new Date()) {
  if (r.status !== "APPROVED" || expiryState(r.expiresAt, now) === "EXPIRED" || r.visibility === "STAFF_ONLY") return false;
  return r.visibility === "ALL_STUDENTS" || assigned;
}

export type StudentCtx = { studentId: string; departmentId: string; batchId: string; groupIds: ReadonlySet<string>; weakAreas: ReadonlySet<string>; paperIds: ReadonlySet<string> };
export type AssignmentLite = { targetType: string; targetId: string | null; targetKey: string | null };
/** Whether one assignment reaches this student. */
export function reaches(a: AssignmentLite, s: StudentCtx): boolean {
  switch (a.targetType) {
    case "STUDENT": return a.targetId === s.studentId;
    case "DEPARTMENT": return a.targetId === s.departmentId;
    case "BATCH": return a.targetId === s.batchId;
    case "GROUP": return !!a.targetId && s.groupIds.has(a.targetId);
    case "SKILL_GAP": return !!a.targetKey && s.weakAreas.has(a.targetKey);
    case "MOCK_TEST": return !!a.targetId && s.paperIds.has(a.targetId);
    default: return false;
  }
}

// ---- effectiveness ----
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
export const MIN_GROUP = 5;

/**
 * How a resource is doing: reach, completion, ratings, and (when there are enough students on both sides) whether those who finished it scored
 * higher in the matching assessment. That last number shows a link, not a cause: students who finish things tend to score higher anyway.
 */
export function effectiveness(o: { assigned: number; rows: { opened: boolean; completed: boolean; rating: number | null }[]; scores?: { completed: number[]; others: number[] } }) {
  const opened = o.rows.filter((r) => r.opened || r.completed).length, completed = o.rows.filter((r) => r.completed).length;
  const rated = o.rows.flatMap((r) => (r.rating ? [r.rating] : []));
  const sc = o.scores;
  const enough = !!sc && sc.completed.length >= MIN_GROUP && sc.others.length >= MIN_GROUP;
  return {
    assigned: o.assigned, opened, completed,
    openedPercent: o.assigned ? Math.round((opened / o.assigned) * 100) : null, completionPercent: o.assigned ? Math.round((completed / o.assigned) * 100) : null,
    ratings: rated.length, averageRating: avg(rated), helpfulPercent: rated.length ? Math.round((rated.filter((x) => x >= 4).length / rated.length) * 100) : null,
    scoreLink: enough ? { completedAverage: avg(sc!.completed)!, othersAverage: avg(sc!.others)!, difference: Math.round((avg(sc!.completed)! - avg(sc!.others)!) * 10) / 10, completedStudents: sc!.completed.length, otherStudents: sc!.others.length } : null,
  };
}

// ---- recommendations ----
export const CATEGORY_AREA: Record<string, string> = { APTITUDE: "aptitude", CODING: "technical", INTERVIEW: "communication", SOFT_SKILLS: "communication" };
export type RecResource = { id: string; title: string; category: string; subject: string | null; topic: string | null; skills: string[]; jobRoles: string[]; difficulty: string | null; language: string; durationMin: number | null };
export type RecStudent = { weakAreas: string[]; targetRole?: string | null; skills?: string[]; language?: string | null; hours?: number | null };
const DEFAULT_MIN = 30;

/**
 * A short, manageable list: resources that match the student's weak assessment areas, target role and skills, in their language, skipping what they
 * have finished and avoiding hard material when they are weak. When they give the hours they have, the list is cut to fit. At most `limit`.
 */
export function recommendResources(rs: RecResource[], s: RecStudent, done: ReadonlySet<string>, limit = 5) {
  const role = (s.targetRole ?? "").toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 4);
  const mine = new Set((s.skills ?? []).map((x) => x.toLowerCase()));
  const scored = rs.filter((r) => !done.has(r.id)).flatMap((r) => {
    const text = [r.title, r.subject, r.topic, ...r.skills].filter(Boolean).join(" ").toLowerCase();
    const why: string[] = []; let score = 0;
    for (const a of s.weakAreas) {
      if (CATEGORY_AREA[r.category] === a) { score += 4; why.push(`Helps with your ${a} result`); }
      else if ((AREA_TERMS[a] ?? []).some((t) => text.includes(t))) { score += 3; why.push(`Helps with your ${a} result`); }
    }
    if (role.length && (r.jobRoles.some((j) => role.some((w) => j.toLowerCase().includes(w))) || role.some((w) => text.includes(w)))) { score += 3; why.push(`Fits your target role: ${s.targetRole!.trim()}`); }
    if (r.skills.some((k) => mine.has(k.toLowerCase()))) { score += 1; why.push("Builds on a skill you listed"); }
    if (!score) return [];
    if (s.language && r.language.toLowerCase() === s.language.toLowerCase()) score += 1;
    else if (s.language) score -= 2;
    if (r.difficulty === "HARD" && s.weakAreas.length) score -= 2;
    if (r.difficulty === "EASY" && s.weakAreas.length) score += 1;
    return score > 0 ? [{ r, score, why: [...new Set(why)].slice(0, 3) }] : [];
  }).sort((a, b) => b.score - a.score);
  const budget = s.hours && s.hours > 0 ? s.hours * 60 : Infinity;
  const out: { id: string; score: number; why: string[]; minutes: number }[] = [];
  let used = 0;
  for (const x of scored) {
    const m = x.r.durationMin ?? DEFAULT_MIN;
    if (used + m > budget) continue;
    used += m; out.push({ id: x.r.id, score: x.score, why: x.why, minutes: m });
    if (out.length >= limit) break;
  }
  return out;
}

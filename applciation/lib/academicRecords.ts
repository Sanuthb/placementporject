import { z } from "zod";
import { Prisma, type ProfileSection } from "@/generated/prisma/client";
import { ApiError, badRequest } from "@/lib/api/errors";
import { is10, is12, isDiploma, percentOf } from "@/lib/invitations/onboarding";

type Tx = Prisma.TransactionClient;

/**
 * Structured academic records (semester results with subject marks, backlogs with attempts, qualifications).
 * They are the authoritative academic data. The ACADEMICS and EDUCATION_HISTORY section JSON that eligibility, Student 360, intelligence and
 * resumes read is a snapshot generated from them, using the same keys as before, so none of those readers had to change.
 * The staff review is still the section approval: records are submitted, verified or sent back together with their section.
 */

const optStr = (max: number) => z.preprocess((v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v), z.string().trim().max(max).optional());
const dec = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- validation

export const subjectInput = z
  .object({
    code: optStr(30),
    name: z.string().trim().min(1, "Enter the subject name").max(120),
    marksObtained: z.number().min(0, "Marks cannot be negative").max(100000),
    maxMarks: z.number().gt(0, "Maximum marks must be more than zero").max(100000),
    credits: z.number().min(0).max(30).nullable().optional(),
    grade: optStr(5),
    gradePoints: z.number().min(0, "Grade points are 0 to 10").max(10, "Grade points are 0 to 10").nullable().optional(),
  })
  .refine((s) => s.marksObtained <= s.maxMarks, { message: "Marks obtained cannot exceed the maximum marks", path: ["marksObtained"] });

/** SGPA worked out from subject credits and grade points, or null when any subject lacks them (so it cannot be checked reliably). */
export function calculatedSgpa(subjects: { credits?: number | null; gradePoints?: number | null }[]): number | null {
  if (!subjects.length || subjects.some((s) => !s.credits || s.gradePoints == null)) return null;
  const credits = subjects.reduce((t, s) => t + s.credits!, 0);
  return round2(subjects.reduce((t, s) => t + s.credits! * s.gradePoints!, 0) / credits);
}

/** A semester's percentage, worked out from its subject marks. Never stored. */
export function semesterPercentage(subjects: { marksObtained: unknown; maxMarks: unknown }[]): number | null {
  const max = subjects.reduce((t, s) => t + (dec(s.maxMarks) ?? 0), 0);
  return subjects.length && max > 0 ? round2((subjects.reduce((t, s) => t + (dec(s.marksObtained) ?? 0), 0) / max) * 100) : null;
}

export const semesterInput = z
  .object({
    semesterNumber: z.number().int().min(1, "Semester numbers start at 1").max(12),
    sgpa: z.number().min(0, "SGPA is 0 to 10").max(10, "SGPA is 0 to 10").nullable().optional(),
    resultStatus: z.enum(["PASS", "FAIL", "WITHHELD", "ONGOING"]).default("PASS"),
    subjects: z.array(subjectInput).max(25, "At most 25 subjects in a semester").default([]),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.subjects.forEach((s, i) => {
      const key = (s.code?.trim() || s.name).toLowerCase();
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["subjects", i, "name"], message: `"${s.name}" is listed twice in this semester` });
      seen.add(key);
    });
    const calc = calculatedSgpa(v.subjects);
    if (v.sgpa != null && calc != null && Math.abs(calc - v.sgpa) > 0.05) ctx.addIssue({ code: "custom", path: ["sgpa"], message: `SGPA ${v.sgpa} does not match the subject grade points (calculated ${calc})` });
  });
export type SemesterInput = z.infer<typeof semesterInput>;

export const backlogInput = z.object({
  subjectName: z.string().trim().min(1, "Enter the subject name").max(120),
  subjectCode: optStr(30),
  semesterNumber: z.number().int().min(1).max(12),
  examSession: optStr(40),
  marksObtained: z.number().min(0).max(100000).nullable().optional(),
});

export const attemptInput = z
  .object({
    outcome: z.enum(["FAILED", "CLEARED"]),
    examSession: optStr(40),
    marksObtained: z.number().min(0).max(100000).nullable().optional(),
    clearedInSemester: z.number().int().min(1).max(12).nullable().optional(),
  })
  .refine((v) => v.outcome !== "CLEARED" || v.clearedInSemester != null, { message: "Say in which semester it was cleared", path: ["clearedInSemester"] });

export const MAX_ATTEMPTS = 10;

/** A backlog is cleared once any attempt cleared it. The earlier attempts stay as history. */
export const backlogStatus = (attempts: { outcome: string }[]): "CLEARED" | "PENDING" => (attempts.some((a) => a.outcome === "CLEARED") ? "CLEARED" : "PENDING");

/** The number the next attempt gets. A cleared subject takes no more attempts. */
export function nextAttemptNumber(attempts: { attemptNumber: number; outcome: string }[]): number {
  if (backlogStatus(attempts) === "CLEARED") throw new ApiError(409, "CONFLICT", "This backlog is already cleared");
  const n = attempts.reduce((m, a) => Math.max(m, a.attemptNumber), 0) + 1;
  if (n > MAX_ATTEMPTS) throw badRequest(`At most ${MAX_ATTEMPTS} attempts per subject`);
  return n;
}

/** Declared active backlogs may not be fewer than the pending subjects the student has listed. */
export function checkActiveBacklogs(declared: unknown, pendingListed: number) {
  if (typeof declared === "number" && declared < pendingListed) throw badRequest(`Active backlogs (${declared}) is fewer than the ${pendingListed} pending backlog subject(s) you listed`);
}

// ------------------------------------------------------------------ snapshot

export type SemRow = { semesterNumber: number; sgpa: unknown; resultStatus: string; reviewStatus: string; pendingData: unknown; subjects: { code: string | null; name: string; marksObtained: unknown; maxMarks: unknown; credits: unknown; grade: string | null; gradePoints: unknown }[] };
export type BacklogRow = { subjectName: string; subjectCode: string | null; semesterNumber: number; attempts: { attemptNumber: number; examSession: string | null; outcome: string; clearedInSemester: number | null; reviewStatus: string }[] };
export type EduRow = { level: string; qualification: string; institution: string; boardOrUniversity: string | null; completionYear: number | null; percentage: unknown; cgpa: unknown; obtainedMarks: number | null; maxMarks: number | null; backlogs: number; status: string; reviewStatus: string; pendingData: unknown };
export type Records = { semesters: SemRow[]; backlogs: BacklogRow[]; education: EduRow[] };
/** "proposed" is what the student has entered (pending edits included); "verified" is only what staff have approved. */
export type View = "proposed" | "verified";

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function semesterIn(row: SemRow, view: View) {
  if (view === "verified") return row.reviewStatus === "VERIFIED" ? { semesterNumber: row.semesterNumber, sgpa: dec(row.sgpa), resultStatus: row.resultStatus, subjects: row.subjects.map(subjectOut) } : null;
  const p = obj(row.pendingData);
  if (p) return { semesterNumber: row.semesterNumber, sgpa: dec(p.sgpa), resultStatus: String(p.resultStatus ?? row.resultStatus), subjects: ((p.subjects as unknown[]) ?? []).map((s) => subjectOut(s as SemRow["subjects"][number])) };
  return { semesterNumber: row.semesterNumber, sgpa: dec(row.sgpa), resultStatus: row.resultStatus, subjects: row.subjects.map(subjectOut) };
}
const subjectOut = (s: SemRow["subjects"][number]) => ({ code: s.code ?? null, name: s.name, marksObtained: dec(s.marksObtained), maxMarks: dec(s.maxMarks), credits: dec(s.credits), grade: s.grade ?? null, gradePoints: dec(s.gradePoints) });

function attemptsIn(b: BacklogRow, view: View) {
  return b.attempts.filter((a) => view === "proposed" || a.reviewStatus === "VERIFIED").sort((x, y) => x.attemptNumber - y.attemptNumber);
}

function educationIn(row: EduRow, view: View): EduRow | null {
  if (view === "verified") return row.reviewStatus === "VERIFIED" ? row : null;
  const p = obj(row.pendingData);
  return p ? ({ ...row, ...p } as EduRow) : row;
}

/** Pending backlog subjects in this view, for the active-backlogs consistency check. */
export const pendingBacklogCount = (backlogs: BacklogRow[], view: View) => backlogs.filter((b) => { const a = attemptsIn(b, view); return a.length > 0 && backlogStatus(a) === "PENDING"; }).length;

/**
 * The ACADEMICS section data with the structured records applied. Keys the structured records do not cover are left exactly as the student
 * declared them, and semesters already in the JSON are kept unless a structured record exists for the same semester, so nothing is lost.
 */
export function overlayAcademics(base: Record<string, unknown>, rec: Records, view: View): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };

  const sems = rec.semesters.map((r) => semesterIn(r, view)).filter((s): s is NonNullable<typeof s> => !!s);
  if (!sems.length && Array.isArray(base.semesters) && (base.semesters as Record<string, unknown>[]).some((l) => Array.isArray(l.subjects))) out.semesters = (base.semesters as Record<string, unknown>[]).filter((l) => !Array.isArray(l.subjects));
  if (sems.length) {
    // Entries carrying a subjects list were generated from structured records and are rebuilt here; the others are the student's own older entries and are kept.
    const legacy = (Array.isArray(base.semesters) ? (base.semesters as Record<string, unknown>[]) : []).filter((l) => !Array.isArray(l.subjects) && !sems.some((s) => s.semesterNumber === Number(l.semester)));
    const structured = sems.map((s) => ({ semester: s.semesterNumber, sgpa: s.sgpa, result: s.resultStatus, percentage: semesterPercentage(s.subjects), subjects: s.subjects }));
    out.semesters = [...legacy, ...structured].sort((a, b) => Number(a.semester) - Number(b.semester));
  }

  if (!rec.backlogs.some((b) => attemptsIn(b, view).length) && Array.isArray(base.backlogHistory) && (base.backlogHistory as Record<string, unknown>[]).some((l) => "subject" in l)) out.backlogHistory = (base.backlogHistory as Record<string, unknown>[]).filter((l) => !("subject" in l));
  const logs = rec.backlogs.map((b) => ({ b, attempts: attemptsIn(b, view) })).filter((x) => x.attempts.length);
  if (logs.length) {
    const legacy = (Array.isArray(base.backlogHistory) ? (base.backlogHistory as Record<string, unknown>[]) : []).filter((l) => !("subject" in l));
    out.backlogHistory = [...legacy, ...logs.map(({ b, attempts }) => ({ subject: b.subjectName, code: b.subjectCode, semester: b.semesterNumber, status: backlogStatus(attempts), attempts: attempts.map((a) => ({ attempt: a.attemptNumber, session: a.examSession, outcome: a.outcome, clearedInSemester: a.clearedInSemester })) }))];
  }

  const edu = rec.education.map((e) => educationIn(e, view)).filter((e): e is EduRow => !!e);
  const tenth = edu.find(is10), twelfth = edu.find(is12), diploma = edu.find(isDiploma);
  const t = tenth ? percentOf(tenth) : null, w = twelfth ? percentOf(twelfth) : diploma ? percentOf(diploma) : null;
  if (t != null) out.tenthPercentage = t;
  if (w != null) out.twelfthPercentage = w;
  return out;
}

/** The EDUCATION_HISTORY section data, in the shape the onboarding submit has always produced. */
export function overlayEducationHistory(base: Record<string, unknown>, rec: Records, view: View): Record<string, unknown> {
  const edu = rec.education.map((e) => educationIn(e, view)).filter((e): e is EduRow => !!e);
  if (!edu.length) return base;
  return { ...base, history: edu.map((e) => ({ level: e.level, qualification: e.qualification, institution: e.institution, board: e.boardOrUniversity ?? "", year: e.completionYear, percentage: percentOf(e), status: e.status })) };
}

// ------------------------------------------------------------------ database

export const SECTION_KINDS: ProfileSection[] = ["ACADEMICS", "EDUCATION_HISTORY"];

export async function loadRecords(tx: Tx, studentId: string): Promise<Records> {
  const [semesters, backlogs, education] = await Promise.all([
    tx.semesterResult.findMany({ where: { studentId }, include: { subjects: true }, orderBy: { semesterNumber: "asc" } }),
    tx.backlog.findMany({ where: { studentId }, include: { attempts: true }, orderBy: [{ semesterNumber: "asc" }, { createdAt: "asc" }] }),
    tx.studentEducationRecord.findMany({ where: { studentId }, orderBy: [{ completionYear: "asc" }, { createdAt: "asc" }] }),
  ]);
  return { semesters, backlogs, education } as unknown as Records;
}

/** Section data with the student's structured records applied, ready to be validated and saved. */
export async function overlayForSection(tx: Tx, studentId: string, section: ProfileSection, raw: Record<string, unknown>, existing: unknown, view: View = "proposed") {
  if (!SECTION_KINDS.includes(section)) return raw;
  // Older entries the page no longer sends (the semester and history lists moved to the record panels) are carried over from what is stored.
  const stored = obj(existing) ?? {};
  const base: Record<string, unknown> = { ...raw };
  for (const k of ["semesters", "backlogHistory", "history"]) if (!(k in base) && k in stored) base[k] = stored[k];
  const rec = await loadRecords(tx, studentId);
  if (section === "EDUCATION_HISTORY") return overlayEducationHistory(base, rec, view);
  const out = overlayAcademics(base, rec, view);
  checkActiveBacklogs(base.activeBacklogs, pendingBacklogCount(rec.backlogs, view));
  return out;
}

/** The student submitted the section: records still being worked on go to review. (A verified record with a pending edit is already marked by its pendingData.) */
export async function submitRecords(tx: Tx, studentId: string, section: ProfileSection) {
  const open = { in: ["DRAFT", "CHANGES_REQUESTED"] as ("DRAFT" | "CHANGES_REQUESTED")[] };
  if (section === "ACADEMICS") {
    await tx.semesterResult.updateMany({ where: { studentId, reviewStatus: open }, data: { reviewStatus: "SUBMITTED", reviewComment: null } });
    await tx.backlogAttempt.updateMany({ where: { backlog: { studentId }, reviewStatus: open }, data: { reviewStatus: "SUBMITTED", reviewComment: null } });
  } else if (section === "EDUCATION_HISTORY") {
    await tx.studentEducationRecord.updateMany({ where: { studentId, reviewStatus: open }, data: { reviewStatus: "SUBMITTED", reviewComment: null } });
  }
}

/** Staff approved the section: submitted records become verified and pending edits are applied. Returns whether anything was touched. */
export async function verifyRecords(tx: Tx, actorId: string | null, studentId: string, section: ProfileSection) {
  const now = new Date();
  const stamp = { reviewStatus: "VERIFIED" as const, reviewComment: null, verifiedAt: now, verifiedById: actorId };
  if (section === "ACADEMICS") {
    const rows = await tx.semesterResult.findMany({ where: { studentId, OR: [{ reviewStatus: "SUBMITTED" }, { reviewStatus: "VERIFIED", pendingData: { not: Prisma.DbNull } }] } });
    for (const r of rows) {
      const p = r.pendingData ? semesterInput.parse(r.pendingData) : null;
      if (p) {
        await tx.subjectMark.deleteMany({ where: { semesterResultId: r.id } });
        await tx.subjectMark.createMany({ data: p.subjects.map((s) => ({ collegeId: r.collegeId, semesterResultId: r.id, code: s.code ?? null, name: s.name, marksObtained: s.marksObtained, maxMarks: s.maxMarks, credits: s.credits ?? null, grade: s.grade ?? null, gradePoints: s.gradePoints ?? null })) });
      }
      await tx.semesterResult.update({ where: { id: r.id }, data: { ...stamp, ...(p ? { sgpa: p.sgpa ?? null, resultStatus: p.resultStatus } : {}), pendingData: Prisma.DbNull } });
    }
    const att = await tx.backlogAttempt.updateMany({ where: { backlog: { studentId }, reviewStatus: "SUBMITTED" }, data: stamp });
    return rows.length + att.count > 0;
  }
  if (section === "EDUCATION_HISTORY") {
    const rows = await tx.studentEducationRecord.findMany({ where: { studentId, OR: [{ reviewStatus: "SUBMITTED" }, { reviewStatus: "VERIFIED", pendingData: { not: Prisma.DbNull } }] } });
    for (const r of rows) {
      const p = obj(r.pendingData);
      await tx.studentEducationRecord.update({ where: { id: r.id }, data: { ...stamp, ...(p ? (p as Prisma.StudentEducationRecordUpdateInput) : {}), pendingData: Prisma.DbNull } });
    }
    return rows.length > 0;
  }
  return false;
}

/** Staff asked for changes: submitted records go back to the student. A verified record with a pending edit stays verified and carries the comment. */
export async function requestChangesOnRecords(tx: Tx, studentId: string, section: ProfileSection, comment: string) {
  if (section === "ACADEMICS") {
    await tx.semesterResult.updateMany({ where: { studentId, reviewStatus: "SUBMITTED" }, data: { reviewStatus: "CHANGES_REQUESTED", reviewComment: comment } });
    await tx.semesterResult.updateMany({ where: { studentId, reviewStatus: "VERIFIED", pendingData: { not: Prisma.DbNull } }, data: { reviewComment: comment } });
    await tx.backlogAttempt.updateMany({ where: { backlog: { studentId }, reviewStatus: "SUBMITTED" }, data: { reviewStatus: "CHANGES_REQUESTED", reviewComment: comment } });
  } else if (section === "EDUCATION_HISTORY") {
    await tx.studentEducationRecord.updateMany({ where: { studentId, reviewStatus: "SUBMITTED" }, data: { reviewStatus: "CHANGES_REQUESTED", reviewComment: comment } });
    await tx.studentEducationRecord.updateMany({ where: { studentId, reviewStatus: "VERIFIED", pendingData: { not: Prisma.DbNull } }, data: { reviewComment: comment } });
  }
}

/**
 * Regenerates a VERIFIED section's data from the verified records. Used after approval and after staff edit a verified record, so the
 * snapshot other modules read always matches the records. Does nothing to a section that is not verified.
 */
export async function refreshVerifiedSnapshot(tx: Tx, studentId: string, section: ProfileSection) {
  if (!SECTION_KINDS.includes(section)) return;
  const row = await tx.studentSection.findUnique({ where: { studentId_section: { studentId, section } } });
  if (!row || row.status !== "VERIFIED") return;
  const rec = await loadRecords(tx, studentId);
  const base = obj(row.data) ?? {};
  const next = section === "ACADEMICS" ? overlayAcademics(base, rec, "verified") : overlayEducationHistory(base, rec, "verified");
  if (JSON.stringify(next) !== JSON.stringify(base)) await tx.studentSection.update({ where: { id: row.id }, data: { data: next as Prisma.InputJsonObject } });
}

/** Records of a section cannot be changed while that section is with staff for review. */
export async function assertSectionOpen(tx: Tx, studentId: string, section: ProfileSection) {
  const row = await tx.studentSection.findUnique({ where: { studentId_section: { studentId, section } }, select: { status: true } });
  if (row?.status === "SUBMITTED") throw new ApiError(409, "CONFLICT", "This section is under review and cannot be changed right now");
}

/** What a student (or staff) sees for one semester: the stored values, any pending edit, and the percentage worked out from the marks. */
export function semesterView(r: SemRow & { id: string; semesterId?: string | null; reviewComment?: string | null }) {
  return {
    id: r.id, semesterNumber: r.semesterNumber, semesterId: r.semesterId ?? null, sgpa: dec(r.sgpa), resultStatus: r.resultStatus, reviewStatus: r.reviewStatus, reviewComment: r.reviewComment ?? null,
    percentage: semesterPercentage(r.subjects), subjects: r.subjects.map(subjectOut), pending: obj(r.pendingData),
  };
}

export function backlogView(b: BacklogRow & { id: string }) {
  const attempts = [...b.attempts].sort((x, y) => x.attemptNumber - y.attemptNumber);
  return {
    id: b.id, subjectName: b.subjectName, subjectCode: b.subjectCode, semesterNumber: b.semesterNumber, status: backlogStatus(attempts),
    attempts: attempts.map((a) => ({ id: (a as { id?: string }).id, attemptNumber: a.attemptNumber, examSession: a.examSession, marksObtained: dec((a as { marksObtained?: unknown }).marksObtained), outcome: a.outcome, clearedInSemester: a.clearedInSemester, reviewStatus: a.reviewStatus, reviewComment: (a as { reviewComment?: string | null }).reviewComment ?? null })),
  };
}

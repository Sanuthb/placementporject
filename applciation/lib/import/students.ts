import ExcelJS from "exceljs";
import { z } from "zod";
import { db } from "@/lib/db";
import { readAnySheet } from "@/lib/import/sheet";
import { checkMapping, MappingError, type Structure } from "@/lib/academicMapping";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;

/** The fields a spreadsheet column can be mapped to. `aliases` let common headings map themselves. */
export const FIELDS = [
  { key: "enrollment_no", label: "Admission number", required: true, aliases: ["admission_no", "admission_number", "enrollment", "enrollment_number", "roll_no", "reg_no", "registration_no", "registration_number"] },
  { key: "name", label: "Full name", required: true, aliases: ["student_name", "full_name"] },
  { key: "email", label: "Email", required: true, aliases: ["email_address", "email_id", "mail"] },
  { key: "phone", label: "Mobile number", required: false, aliases: ["mobile", "mobile_number", "phone_number", "contact", "contact_number"] },
  { key: "date_of_birth", label: "Date of birth", required: false, aliases: ["dob", "birth_date"] },
  { key: "gender", label: "Gender", required: false, aliases: ["sex"] },
  { key: "department_code", label: "Department (code or name)", required: true, aliases: ["department", "dept", "dept_code", "department_name"] },
  { key: "program_code", label: "Programme (code or name)", required: false, aliases: ["programme_code", "program", "programme", "programme_name"] },
  { key: "branch", label: "Branch / specialisation", required: false, aliases: ["specialisation", "specialization", "branch_name", "branch_specialisation"] },
  { key: "batch_name", label: "Batch", required: true, aliases: ["batch"] },
  { key: "semester", label: "Current semester", required: false, aliases: ["sem", "current_semester"] },
  { key: "academic_year", label: "Academic year", required: false, aliases: ["session", "academic_session", "current_academic_year"] },
] as const;
export type FieldKey = (typeof FIELDS)[number]["key"];

export type RawRow = { row: number; data: Record<string, string> };
/** Everything an in-progress import remembers: the file as read, how its columns map, the mapped rows (editable), and rows left out. */
export type JobData = { headers: string[]; raw: RawRow[]; mapping: Record<string, string>; rows: RawRow[]; excluded: number[] };

export type NewStudent = {
  enrollmentNo: string; name: string; email: string; phone: string | null; dateOfBirth: Date | null; gender: string | null
  departmentId: string; batchId: string; programId: string | null; branchId: string | null; currentSemesterId: string | null; currentAcademicYearId: string | null
};
export type RowResult = {
  row: number; data: Record<string, string>
  status: "ok" | "skipped" | "failed" | "excluded"
  reasons: string[]
  student?: NewStudent
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Reads the first sheet into rows keyed by the file's own headings. */
export async function readFile(buffer: Buffer, fileName: string): Promise<{ headers: string[]; raw: RawRow[] }> {
  const { headers, rows } = await readAnySheet(buffer, fileName, MAX_ROWS);
  return { headers, raw: rows };
}

/** Guesses which column feeds which field from the headings. Each column is used once. */
export function suggestMapping(headers: string[]): Record<string, string> {
  const taken = new Set<string>();
  const out: Record<string, string> = {};
  for (const f of FIELDS) {
    const names = new Set<string>([f.key, norm(f.label), ...f.aliases]);
    const h = headers.find((x) => !taken.has(x) && names.has(norm(x)));
    if (h) { out[f.key] = h; taken.add(h); }
  }
  return out;
}

export function applyMapping(raw: RawRow[], mapping: Record<string, string>): RawRow[] {
  return raw.map(({ row, data }) => ({ row, data: Object.fromEntries(FIELDS.map((f) => [f.key, mapping[f.key] ? (data[mapping[f.key]] ?? "") : ""])) }));
}

/** Accepts 2026-07-31, 31/07/2026 and 31-07-2026. */
function parseDate(v: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : dmy ? [+dmy[3], +dmy[2], +dmy[1]] : [0, 0, 0];
  if (!y) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = z.preprocess(blank, z.string().trim().optional());
const rowSchema = z.object({
  enrollment_no: z.string().trim().min(1, "Admission number is required").max(50),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  email: z.email("Email is not valid").transform((e) => e.toLowerCase()),
  phone: z.preprocess(blank, z.string().trim().regex(/^\+?[\d\s-]{7,16}$/, "Mobile number is not valid").optional()),
  date_of_birth: z.preprocess(blank, z.string().trim().optional()),
  gender: z.preprocess(blank, z.string().trim().max(30).optional()),
  department_code: z.string().trim().min(1, "Department is required"),
  program_code: opt,
  branch: opt,
  batch_name: z.string().trim().min(1, "Batch is required"),
  semester: opt,
  academic_year: opt,
});

/** Loads the structure once so thousands of rows can be checked without a query each. */
async function loadIndex(collegeId: string) {
  const [depts, programs, branches, batches, years, existing] = await Promise.all([
    db.department.findMany({ where: { collegeId, isActive: true }, select: { id: true, name: true, code: true } }),
    db.program.findMany({ where: { collegeId, isActive: true }, select: { id: true, name: true, code: true, departmentId: true } }),
    db.programmeBranch.findMany({ where: { collegeId, isActive: true }, select: { id: true, name: true, programId: true } }),
    db.batch.findMany({ where: { collegeId, isActive: true }, select: { id: true, name: true, programId: true, branchId: true } }),
    db.academicYear.findMany({ where: { collegeId }, select: { id: true, name: true } }),
    db.student.findMany({ where: { collegeId }, select: { enrollmentNo: true, email: true } }),
  ]);
  const semesters = await db.semester.findMany({ where: { collegeId, batchId: { in: batches.map((b) => b.id) } }, select: { id: true, batchId: true, number: true, name: true, academicYearId: true } });

  const structure: Structure = {
    departments: new Map(depts.map((d) => [d.id, d])),
    programs: new Map(programs.map((p) => [p.id, p])),
    branches: new Map(branches.map((b) => [b.id, b])),
    batches: new Map(batches.map((b) => [b.id, b])),
    semesters: new Map(semesters.map((s) => [s.id, s])),
    years: new Set(years.map((y) => y.id)),
  };
  // Codes win over names when both could match.
  const byKey = <T extends { id: string; name: string; code: string }>(rows: T[]) => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.name.toLowerCase(), r.id);
    for (const r of rows) m.set(r.code.toLowerCase(), r.id);
    return m;
  };
  const semsOf = new Map<string, typeof semesters>();
  for (const s of semesters) semsOf.set(s.batchId, [...(semsOf.get(s.batchId) ?? []), s]);
  return {
    structure,
    deptByKey: byKey(depts), programByKey: byKey(programs),
    branchByName: new Map(branches.map((b) => [`${b.programId}|${b.name.toLowerCase()}`, b.id])),
    batchByName: new Map(batches.map((b) => [b.name.toLowerCase(), b.id])),
    semsOf,
    yearByName: new Map(years.map((y) => [y.name.toLowerCase(), y.id])),
    knownEnrollment: new Set(existing.map((e) => e.enrollmentNo.toLowerCase())),
    knownEmail: new Set(existing.map((e) => e.email.toLowerCase())),
  };
}

/**
 * Checks every row: the fields themselves, then the academic mapping (the same rules as adding one student), then duplicates
 * against existing students and earlier rows. Nothing is written. Rows in `excluded` are left out of every check.
 */
export async function validateRows(collegeId: string, rows: RawRow[], excluded: ReadonlySet<number> = new Set()): Promise<RowResult[]> {
  const ix = await loadIndex(collegeId);
  const seenEnrollment = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  return rows.map(({ row, data }): RowResult => {
    if (excluded.has(row)) return { row, data, status: "excluded", reasons: ["Left out of this import"] };
    const parsed = rowSchema.safeParse(data);
    const reasons: string[] = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
    if (!parsed.success) return { row, data, status: "failed", reasons };
    const v = parsed.data;

    let dob: Date | null = null;
    if (v.date_of_birth) {
      dob = parseDate(v.date_of_birth);
      if (!dob) reasons.push(`Date of birth "${v.date_of_birth}" is not a valid date (use 31/07/2003 or 2003-07-31)`);
      else if (dob > new Date() || dob.getUTCFullYear() < 1950) reasons.push("Date of birth is not plausible");
    }

    const departmentId = ix.deptByKey.get(v.department_code.toLowerCase());
    const batchId = ix.batchByName.get(v.batch_name.toLowerCase());
    const programId = v.program_code ? ix.programByKey.get(v.program_code.toLowerCase()) : undefined;
    if (!departmentId) reasons.push(`Unknown department "${v.department_code}"`);
    if (!batchId) reasons.push(`Unknown batch "${v.batch_name}"`);
    if (v.program_code && !programId) reasons.push(`Unknown programme "${v.program_code}"`);

    const progForBranch = programId ?? (batchId ? ix.structure.batches.get(batchId)?.programId : null);
    let branchId: string | undefined;
    if (v.branch) {
      branchId = progForBranch ? ix.branchByName.get(`${progForBranch}|${v.branch.toLowerCase()}`) : undefined;
      if (!branchId) reasons.push(progForBranch ? `Unknown branch "${v.branch}" for that programme` : `Cannot place branch "${v.branch}" without a programme`);
    }
    let semesterId: string | undefined;
    if (v.semester && batchId) {
      const n = /\d+/.exec(v.semester)?.[0];
      const list = ix.semsOf.get(batchId) ?? [];
      semesterId = list.find((s) => (n ? s.number === Number(n) : false) || s.name.toLowerCase() === v.semester!.toLowerCase())?.id;
      if (!semesterId) reasons.push(`Unknown semester "${v.semester}" for batch ${v.batch_name}`);
    }
    let academicYearId: string | undefined;
    if (v.academic_year) {
      academicYearId = ix.yearByName.get(v.academic_year.toLowerCase());
      if (!academicYearId) reasons.push(`Unknown academic year "${v.academic_year}"`);
    }
    if (reasons.length || !departmentId || !batchId) return { row, data, status: "failed", reasons };

    let m;
    try {
      m = checkMapping(ix.structure, { departmentId, batchId, programId, branchId, semesterId, academicYearId });
    } catch (e) {
      if (e instanceof MappingError) return { row, data, status: "failed", reasons: [e.message] };
      throw e;
    }

    const en = v.enrollment_no.toLowerCase();
    const dupe: string[] = [];
    if (seenEnrollment.has(en)) dupe.push(`Same admission number as row ${seenEnrollment.get(en)} in this file`);
    else if (ix.knownEnrollment.has(en)) dupe.push("A student with this admission number already exists");
    if (seenEmail.has(v.email)) dupe.push(`Same email as row ${seenEmail.get(v.email)} in this file`);
    else if (ix.knownEmail.has(v.email)) dupe.push("A student with this email already exists");
    if (!seenEnrollment.has(en)) seenEnrollment.set(en, row);
    if (!seenEmail.has(v.email)) seenEmail.set(v.email, row);
    if (dupe.length) return { row, data, status: "skipped", reasons: dupe };

    return {
      row, data, status: "ok", reasons: [],
      student: { enrollmentNo: v.enrollment_no, name: v.name, email: v.email, phone: v.phone ?? null, dateOfBirth: dob, gender: v.gender ?? null, ...m },
    };
  });
}

export const countResults = (r: Pick<RowResult, "status">[]) => ({
  total: r.length,
  ready: r.filter((x) => x.status === "ok").length,
  skipped: r.filter((x) => x.status === "skipped").length,
  invalid: r.filter((x) => x.status === "failed").length,
  excluded: r.filter((x) => x.status === "excluded").length,
});

/** A blank template plus a sheet listing the values that exist in this college, so rows can be filled in correctly. */
export async function templateBuffer(collegeId: string): Promise<Buffer> {
  const [depts, programs, batches] = await Promise.all([
    db.department.findMany({ where: { collegeId, isActive: true }, select: { name: true, code: true }, orderBy: { name: "asc" } }),
    db.program.findMany({ where: { collegeId, isActive: true }, select: { name: true, code: true, department: { select: { code: true } } }, orderBy: { name: "asc" } }),
    db.batch.findMany({ where: { collegeId, isActive: true }, select: { name: true, program: { select: { code: true } } }, orderBy: { name: "asc" } }),
  ]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.addRow(FIELDS.map((f) => f.label)).font = { bold: true };
  const d = depts[0], p = programs[0], b = batches[0];
  ws.addRow(["26MCA001", "Asha Rao", "asha@example.com", "9876543210", "31/07/2003", "Female", d?.code ?? "MCA", p?.code ?? "", "", b?.name ?? "MCA 2026–2028", "1", ""]);
  ws.columns.forEach((c) => (c.width = 24));

  const ref = wb.addWorksheet("Valid values");
  ref.addRow(["Department code", "Department name", "", "Programme code", "Programme name", "Department", "", "Batch", "Programme"]).font = { bold: true };
  const n = Math.max(depts.length, programs.length, batches.length);
  for (let i = 0; i < n; i++) ref.addRow([depts[i]?.code, depts[i]?.name, "", programs[i]?.code, programs[i]?.name, programs[i]?.department?.code, "", batches[i]?.name, batches[i]?.program?.code]);
  ref.columns.forEach((c) => (c.width = 24));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function errorFileBuffer(results: Pick<RowResult, "row" | "data" | "status" | "reasons">[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Errors");
  ws.addRow(["Row", "Outcome", "Reason", ...FIELDS.map((f) => f.label)]).font = { bold: true };
  for (const r of results) ws.addRow([r.row, r.status, r.reasons.join("; "), ...FIELDS.map((f) => r.data[f.key] ?? "")]);
  ws.columns.forEach((c) => (c.width = 24));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

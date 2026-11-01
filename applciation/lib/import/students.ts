import ExcelJS from "exceljs";
import { z } from "zod";
import { db } from "@/lib/db";
import { readSheet } from "@/lib/import/sheet";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5000;

export const COLUMNS = ["enrollment_no", "name", "email", "phone", "department_code", "batch_name", "program_code"] as const;
const REQUIRED = ["enrollment_no", "name", "email", "department_code", "batch_name"] as const;

export type RawRow = { row: number; data: Record<string, string> };
export type RowResult = {
  row: number;
  data: Record<string, string>;
  status: "ok" | "skipped" | "failed";
  reasons: string[];
  student?: { enrollmentNo: string; name: string; email: string; phone?: string; departmentId: string; batchId: string; programId?: string };
};

/** Reads the first sheet of an .xlsx or .csv file into header-keyed rows. */
export function readRows(buffer: Buffer, fileName: string): Promise<RawRow[]> {
  return readSheet(buffer, fileName, COLUMNS, REQUIRED, MAX_ROWS);
}

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const rowSchema = z.object({
  enrollment_no: z.string().trim().min(1, "enrollment_no is required").max(50),
  name: z.string().trim().min(2, "name must be at least 2 characters").max(120),
  email: z.email("email is not valid").transform((e) => e.toLowerCase()),
  phone: z.preprocess(blankToUndefined, z.string().trim().regex(/^\+?[\d\s-]{7,16}$/, "phone is not valid").optional()),
  department_code: z.string().trim().min(1, "department_code is required").transform((c) => c.toUpperCase()),
  batch_name: z.string().trim().min(1, "batch_name is required"),
  program_code: z.preprocess(blankToUndefined, z.string().trim().transform((c) => c.toUpperCase()).optional()),
});

/** Validates rows against the college's departments, batches, programs and existing students. Pure with respect to the DB: nothing is written. */
export async function validateRows(collegeId: string, rows: RawRow[]): Promise<RowResult[]> {
  const [depts, batches, programs, existing] = await Promise.all([
    db.department.findMany({ where: { collegeId, isActive: true }, select: { id: true, code: true } }),
    db.batch.findMany({ where: { collegeId, isActive: true }, select: { id: true, name: true } }),
    db.program.findMany({ where: { collegeId, isActive: true }, select: { id: true, code: true } }),
    db.student.findMany({ where: { collegeId }, select: { enrollmentNo: true, email: true } }),
  ]);
  const deptByCode = new Map(depts.map((d) => [d.code.toUpperCase(), d.id]));
  const batchByName = new Map(batches.map((b) => [b.name.toLowerCase(), b.id]));
  const programByCode = new Map(programs.map((p) => [p.code.toUpperCase(), p.id]));
  const knownEnrollment = new Set(existing.map((e) => e.enrollmentNo.toLowerCase()));
  const knownEmail = new Set(existing.map((e) => e.email.toLowerCase()));
  const seenEnrollment = new Map<string, number>();
  const seenEmail = new Map<string, number>();

  return rows.map(({ row, data }): RowResult => {
    const parsed = rowSchema.safeParse(data);
    if (!parsed.success) return { row, data, status: "failed", reasons: parsed.error.issues.map((i) => i.message) };
    const v = parsed.data;
    const reasons: string[] = [];
    const departmentId = deptByCode.get(v.department_code);
    const batchId = batchByName.get(v.batch_name.toLowerCase());
    const programId = v.program_code ? programByCode.get(v.program_code) : undefined;
    if (!departmentId) reasons.push(`Unknown department_code "${v.department_code}"`);
    if (!batchId) reasons.push(`Unknown batch_name "${v.batch_name}"`);
    if (v.program_code && !programId) reasons.push(`Unknown program_code "${v.program_code}"`);
    if (reasons.length || !departmentId || !batchId) return { row, data, status: "failed", reasons };

    const en = v.enrollment_no.toLowerCase();
    const dupeReasons: string[] = [];
    if (seenEnrollment.has(en)) dupeReasons.push(`Same enrollment_no as row ${seenEnrollment.get(en)} in this file`);
    else if (knownEnrollment.has(en)) dupeReasons.push("A student with this enrollment_no already exists");
    if (seenEmail.has(v.email)) dupeReasons.push(`Same email as row ${seenEmail.get(v.email)} in this file`);
    else if (knownEmail.has(v.email)) dupeReasons.push("A student with this email already exists");
    if (!seenEnrollment.has(en)) seenEnrollment.set(en, row);
    if (!seenEmail.has(v.email)) seenEmail.set(v.email, row);
    if (dupeReasons.length) return { row, data, status: "skipped", reasons: dupeReasons };

    return { row, data, status: "ok", reasons: [], student: { enrollmentNo: v.enrollment_no, name: v.name, email: v.email, phone: v.phone, departmentId, batchId, programId } };
  });
}

export async function templateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.addRow([...COLUMNS]).font = { bold: true };
  ws.addRow(["21CS001", "Asha Rao", "asha@example.com", "9876543210", "CSE", "2021-2025", ""]);
  ws.columns.forEach((c) => (c.width = 20));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function errorFileBuffer(results: Pick<RowResult, "row" | "data" | "status" | "reasons">[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Errors");
  ws.addRow(["row", "outcome", "reason", ...COLUMNS]).font = { bold: true };
  for (const r of results) ws.addRow([r.row, r.status, r.reasons.join("; "), ...COLUMNS.map((c) => r.data[c] ?? "")]);
  ws.columns.forEach((c) => (c.width = 22));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

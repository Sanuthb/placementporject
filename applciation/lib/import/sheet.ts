import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { badRequest } from "@/lib/api/errors";

export function cellText(v: ExcelJS.CellValue | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v) return String(v.text).trim();
    return "";
  }
  return String(v).trim();
}

export type SheetRow = { row: number; data: Record<string, string> };

/** Reads the first sheet of an .xlsx or .csv into header-keyed rows. Headers are lower-cased with spaces turned into underscores. */
export async function readSheet(buffer: Buffer, fileName: string, columns: readonly string[], required: readonly string[], maxRows: number): Promise<SheetRow[]> {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) throw badRequest("Upload an .xlsx or .csv file");
  const wb = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  try {
    if (lower.endsWith(".csv")) sheet = await wb.csv.read(Readable.from(buffer));
    else {
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      sheet = wb.worksheets[0];
    }
  } catch {
    throw badRequest("The file could not be read. Check that it is a valid spreadsheet");
  }
  if (!sheet || sheet.rowCount < 2) throw badRequest("The file has no data rows");

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (c, i) => {
    headers[i] = cellText(c.value).toLowerCase().replace(/[\s-]+/g, "_");
  });
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) throw badRequest(`Missing required column(s): ${missing.join(", ")}`, { missing });

  const rows: SheetRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const data: Record<string, string> = {};
    let any = false;
    for (const col of columns) {
      const idx = headers.indexOf(col);
      const text = idx > 0 ? cellText(sheet.getRow(r).getCell(idx).value) : "";
      data[col] = text;
      if (text) any = true;
    }
    if (any) rows.push({ row: r, data });
    if (rows.length > maxRows) throw badRequest(`Too many rows. The limit is ${maxRows} per file`);
  }
  if (!rows.length) throw badRequest("The file has no data rows");
  return rows;
}

/**
 * Reads the first sheet with whatever headers it has, so the user can map them to system fields afterwards.
 * Headers keep the file's own wording; blank ones are ignored and repeated ones get a number.
 */
export async function readAnySheet(buffer: Buffer, fileName: string, maxRows: number): Promise<{ headers: string[]; rows: SheetRow[] }> {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) throw badRequest("Upload an .xlsx or .csv file");
  const wb = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;
  try {
    if (lower.endsWith(".csv")) sheet = await wb.csv.read(Readable.from(buffer));
    else {
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      sheet = wb.worksheets[0];
    }
  } catch {
    throw badRequest("The file could not be read. Check that it is a valid spreadsheet");
  }
  if (!sheet || sheet.rowCount < 2) throw badRequest("The file has no data rows");

  const byColumn = new Map<number, string>();
  const used = new Set<string>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (c, i) => {
    const base = cellText(c.value);
    if (!base) return;
    let name = base, n = 2;
    while (used.has(name)) name = `${base} (${n++})`;
    used.add(name);
    byColumn.set(i, name);
  });
  if (!byColumn.size) throw badRequest("The first row must contain column headings");

  const rows: SheetRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const data: Record<string, string> = {};
    let any = false;
    for (const [idx, name] of byColumn) {
      const text = cellText(sheet.getRow(r).getCell(idx).value);
      data[name] = text;
      if (text) any = true;
    }
    if (any) rows.push({ row: r, data });
    if (rows.length > maxRows) throw badRequest(`Too many rows. The limit is ${maxRows} per file`);
  }
  if (!rows.length) throw badRequest("The file has no data rows");
  return { headers: [...byColumn.values()], rows };
}

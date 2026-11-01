import ExcelJS from "exceljs";

/** Builds a downloadable .xlsx response from a header row and data rows. */
export async function sheetResponse(fileName: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(headers).font = { bold: true };
  rows.forEach((r) => ws.addRow(r.map((v) => v ?? "")));
  ws.columns.forEach((c) => (c.width = 22));
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName}"`,
    },
  });
}

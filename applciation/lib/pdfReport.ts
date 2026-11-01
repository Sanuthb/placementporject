import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
type Section = { heading: string; table?: { head: string[]; rows: (string | number | null)[][] }; lines?: string[] };

/** Simple management report: title, optional paragraphs, and tables with equal-width columns. */
export async function buildReportPdf(title: string, subtitle: string, sections: Section[], brand = rgb(0.1, 0.25, 0.55)) {
  const pdf = await PDFDocument.create();
  const font: PDFFont = await pdf.embedFont(StandardFonts.Helvetica), bold: PDFFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 48;
  let page: PDFPage = pdf.addPage([W, H]), y = H - M;
  const ensure = (n: number) => { if (y - n < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const text = (t: string, f: PDFFont, size: number, x: number, color = rgb(0.1, 0.1, 0.1), max = W - M - x) => { let s = safe(t); while (s.length > 1 && f.widthOfTextAtSize(s, size) > max) s = s.slice(0, -1); page.drawText(s, { x, y: y - size, size, font: f, color }); };
  text(title, bold, 20, M, brand); y -= 28; text(subtitle, font, 10, M, rgb(0.4, 0.4, 0.4)); y -= 26;
  for (const sec of sections) {
    ensure(50); text(sec.heading, bold, 12, M, brand); y -= 20;
    for (const l of sec.lines ?? []) { ensure(16); text(l, font, 10, M); y -= 15; }
    if (sec.table) {
      const cols = sec.table.head.length, cw = (W - 2 * M) / cols;
      const row = (cells: (string | number | null)[], f: PDFFont) => { ensure(18); cells.forEach((c, i) => text(String(c ?? "-"), f, 9, M + i * cw + 2, rgb(0.1, 0.1, 0.1), cw - 6)); y -= 15; };
      row(sec.table.head, bold); page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.5, color: brand });
      for (const r of sec.table.rows) row(r, font);
    }
    y -= 12;
  }
  return Buffer.from(await pdf.save());
}

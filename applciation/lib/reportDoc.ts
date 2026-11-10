import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** Who wrote a piece of a report. Reports must keep a student's own responses apart from AI comments, so every block says. */
export type Source = "STUDENT" | "AI" | "STAFF" | "SYSTEM";
export const SOURCE_LABEL: Record<Source, string> = { STUDENT: "Student's own words", AI: "AI-generated comment", STAFF: "Staff comment", SYSTEM: "Calculated by the system" };

export type Block =
  | { t: "h"; text: string }
  | { t: "p"; text: string; source?: Source }
  | { t: "kv"; rows: [string, string][] }
  | { t: "list"; items: string[]; source?: Source }
  | { t: "table"; head: string[]; rows: (string | number | null)[][] }
  | { t: "response"; label: string; text: string; source: Source };
export type ReportDoc = { title: string; subtitle: string; blocks: Block[]; footer?: string; fileBase: string };

/** The built-in PDF fonts cover Latin-1 only. Common punctuation is mapped to look-alikes; other scripts become "?" so a report is always produced. */
export const latin1 = (s: string) => s.replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[•●▪]/g, "-").replace(/\t/g, "  ").replace(/[^\x20-\x7E\xA1-\xFF\n]/g, "?");
const cell = (v: string | number | null) => (v === null || v === undefined || v === "" ? "-" : String(v));
/** A file name that is safe in a header. */
export const safeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "report";

const BRAND = rgb(0.1, 0.25, 0.55), INK = rgb(0.1, 0.1, 0.1), GREY = rgb(0.4, 0.4, 0.4), AI_COLOR = rgb(0.35, 0.2, 0.6);

export async function renderPdf(doc: ReportDoc): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const W = 595, H = 842, M = 48;
  let page: PDFPage = pdf.addPage([W, H]), y = H - M;
  const ensure = (n: number) => { if (y - n < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const wrap = (t: string, f: PDFFont, size: number, max: number) => {
    const out: string[] = [];
    for (const para of latin1(t).split("\n")) {
      let cur = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (f.widthOfTextAtSize(w, size) > max && w.length > 1) { let k = w.length - 1; while (k > 1 && f.widthOfTextAtSize(w.slice(0, k), size) > max) k--; if (cur) { out.push(cur); cur = ""; } out.push(w.slice(0, k)); w = w.slice(k); }
        const next = cur ? `${cur} ${w}` : w;
        if (f.widthOfTextAtSize(next, size) > max && cur) { out.push(cur); cur = w; } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };
  const lines = (t: string, f: PDFFont, size: number, x = M, color = INK, gap = 3) => { for (const l of wrap(t, f, size, W - M - x)) { ensure(size + gap); page.drawText(l, { x, y: y - size, size, font: f, color }); y -= size + gap; } };
  lines(doc.title, bold, 20, M, BRAND, 6); lines(doc.subtitle, font, 10, M, GREY, 4); y -= 10;
  for (const b of doc.blocks) {
    if (b.t === "h") { ensure(40); y -= 6; lines(b.text, bold, 12, M, BRAND, 4); page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.5, color: BRAND }); y -= 6; }
    else if (b.t === "p") { if (b.source && b.source !== "SYSTEM") lines(SOURCE_LABEL[b.source], bold, 8, M, b.source === "AI" ? AI_COLOR : GREY, 2); lines(b.text, b.source === "AI" ? italic : font, 10, M, b.source === "AI" ? AI_COLOR : INK, 3.5); y -= 4; }
    else if (b.t === "kv") { for (const [k, v] of b.rows) { const kw = 130; ensure(14); page.drawText(latin1(k), { x: M, y: y - 10, size: 9.5, font: bold, color: GREY }); const ls = wrap(v, font, 9.5, W - M - M - kw); ls.forEach((l, i) => { if (i) ensure(13); page.drawText(l, { x: M + kw, y: y - 10, size: 9.5, font, color: INK }); y -= 13; }); } y -= 4; }
    else if (b.t === "list") { if (b.source && b.source !== "SYSTEM") lines(SOURCE_LABEL[b.source], bold, 8, M, b.source === "AI" ? AI_COLOR : GREY, 2); for (const it of b.items) lines(`- ${it}`, b.source === "AI" ? italic : font, 10, M + 6, b.source === "AI" ? AI_COLOR : INK, 3.5); y -= 4; }
    else if (b.t === "response") {
      const ls = wrap(b.text, b.source === "AI" ? italic : font, 9.5, W - 2 * M - 16); ensure(24);
      lines(`${b.label} - ${SOURCE_LABEL[b.source]}`, bold, 8, M, b.source === "AI" ? AI_COLOR : GREY, 2);
      const top = y; for (const l of ls) { ensure(13); page.drawText(l, { x: M + 10, y: y - 10, size: 9.5, font: b.source === "AI" ? italic : font, color: b.source === "AI" ? AI_COLOR : INK }); y -= 13; }
      page.drawLine({ start: { x: M + 4, y: top }, end: { x: M + 4, y: y }, thickness: 1.5, color: b.source === "AI" ? AI_COLOR : GREY }); y -= 6;
    } else {
      const cols = b.head.length, cw = (W - 2 * M) / cols;
      const row = (cells: (string | number | null)[], f: PDFFont) => { const cl = cells.map((c) => wrap(cell(c), f, 8.5, cw - 6)); const n = Math.max(1, ...cl.map((c) => c.length)); ensure(n * 11 + 4); cl.forEach((ls, i) => ls.forEach((l, k) => page.drawText(l, { x: M + i * cw + 2, y: y - 9 - k * 11, size: 8.5, font: f, color: INK }))); y -= n * 11 + 3; };
      row(b.head, bold); page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.5, color: BRAND }); y -= 2;
      for (const r of b.rows) row(r, font); y -= 6;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(latin1(`${doc.footer ?? "Generated by the placement platform"}  |  Page ${i + 1} of ${pages.length}`), { x: M, y: 24, size: 7.5, font, color: GREY }));
  return Buffer.from(await pdf.save());
}

export async function renderDocx(doc: ReportDoc): Promise<Buffer> {
  const tag = (s: Source) => new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: SOURCE_LABEL[s], bold: true, size: 16, color: s === "AI" ? "59339A" : "666666" })] });
  const body = (text: string, s?: Source) => text.split("\n").map((l) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: l, italics: s === "AI", color: s === "AI" ? "59339A" : undefined })] }));
  const kids: (Paragraph | Table)[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title })] }), new Paragraph({ children: [new TextRun({ text: doc.subtitle, color: "666666", size: 20 })] })];
  for (const b of doc.blocks) {
    if (b.t === "h") kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun({ text: b.text })] }));
    else if (b.t === "p") { if (b.source && b.source !== "SYSTEM") kids.push(tag(b.source)); kids.push(...body(b.text, b.source)); }
    else if (b.t === "kv") for (const [k, v] of b.rows) kids.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun({ text: v })] }));
    else if (b.t === "list") { if (b.source && b.source !== "SYSTEM") kids.push(tag(b.source)); for (const it of b.items) kids.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: it, italics: b.source === "AI", color: b.source === "AI" ? "59339A" : undefined })] })); }
    else if (b.t === "response") {
      kids.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: `${b.label} - ${SOURCE_LABEL[b.source]}`, bold: true, size: 16, color: b.source === "AI" ? "59339A" : "666666" })] }));
      for (const l of b.text.split("\n")) kids.push(new Paragraph({ indent: { left: 240 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: b.source === "AI" ? "59339A" : "999999", space: 8 } }, children: [new TextRun({ text: l, italics: b.source === "AI", color: b.source === "AI" ? "59339A" : undefined })] }));
    } else {
      const mk = (cells: (string | number | null)[], head = false) => new TableRow({ tableHeader: head, children: cells.map((c) => new TableCell({ width: { size: 100 / cells.length, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: cell(c), bold: head, size: 18 })] })] })) });
      kids.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [mk(b.head, true), ...b.rows.map((r) => mk(r))] }), new Paragraph({ children: [] }));
    }
  }
  kids.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 300 }, children: [new TextRun({ text: doc.footer ?? "Generated by the placement platform", color: "888888", size: 16 })] }));
  return Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: kids }] })));
}

export type Format = "pdf" | "docx" | "json";
/** The report in the format asked for. `json` is the online dashboard version: the same blocks, rendered by the page. */
export async function respond(doc: ReportDoc, format: Format) {
  if (format === "json") return doc;
  const file = `${doc.fileBase}.${format}`;
  const bytes = format === "pdf" ? await renderPdf(doc) : await renderDocx(doc);
  return new Response(new Uint8Array(bytes), { headers: { "content-type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${file}"`, "cache-control": "no-store" } });
}

import { Document, HeadingLevel, Packer, Paragraph, TabStopType, TextRun, AlignmentType } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { TEMPLATES, type ResumeDoc, type Template } from "@/lib/resumeEngine";

export { TEMPLATES };
export type { Template };

/** The built-in PDF fonts cover Latin-1 only. Common punctuation is mapped to look-alikes; other scripts become "?" so a resume is always produced. */
export function latin1(s: string): string {
  return s.replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[–—−]/g, "-").replace(/…/g, "...").replace(/[•●▪]/g, "-").replace(/₹/g, "Rs. ").replace(/[   ]/g, " ").replace(/\t/g, " ")
    .replace(/[^\x20-\x7E\xA1-\xFF]/g, "?");
}
const hex = (c?: string | null) => { const m = /^#([0-9a-f]{6})$/i.exec(c ?? ""); return m ? rgb(parseInt(m[1].slice(0, 2), 16) / 255, parseInt(m[1].slice(2, 4), 16) / 255, parseInt(m[1].slice(4, 6), 16) / 255) : rgb(0.1, 0.25, 0.55); };
const BLACK = rgb(0.1, 0.1, 0.1), GREY = rgb(0.35, 0.35, 0.35);

type Style = { serif: boolean; body: number; name: number; head: number; gap: number; center: boolean; band: boolean; rules: boolean; accent: boolean };
const STYLE: Record<Template, Style> = {
  ATS: { serif: false, body: 10, name: 16, head: 11, gap: 3, center: false, band: false, rules: false, accent: false },
  CLASSIC: { serif: true, body: 10.5, name: 20, head: 11.5, gap: 3, center: true, band: false, rules: true, accent: false },
  MODERN: { serif: false, body: 10, name: 21, head: 11, gap: 3, center: false, band: true, rules: true, accent: true },
  COMPACT: { serif: false, body: 9, name: 16, head: 10, gap: 1.5, center: false, band: false, rules: true, accent: true },
};
const SKILL_NOTE = "* Skill backed by college records: a staff check, project, course, internship, assessment or achievement.";

/** Draws the resume as a PDF. Text only, one column, selectable, so applicant-tracking software can read it in every template. */
export async function renderPdf(doc: ResumeDoc, template: Template, o: { college: string; brandColor?: string | null; markEvidence: boolean }): Promise<Buffer> {
  const st = STYLE[template], pdf = await PDFDocument.create();
  const font = await pdf.embedFont(st.serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica), bold = await pdf.embedFont(st.serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const brand = st.accent ? hex(o.brandColor) : BLACK;
  const W = 595, H = 842, M = template === "COMPACT" ? 40 : 50;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const ensure = (need: number) => { if (y - need < M) newPage(); };
  const wrap = (t: string, f: PDFFont, size: number, max: number) => {
    const out: string[] = []; let cur = "";
    for (const word of latin1(t).split(/\s+/).filter(Boolean)) { const next = cur ? `${cur} ${word}` : word; if (f.widthOfTextAtSize(next, size) > max && cur) { out.push(cur); cur = word; } else cur = next; }
    if (cur) out.push(cur);
    return out;
  };
  const line = (t: string, f: PDFFont, size: number, x = M, color = BLACK, center = false) => {
    for (const l of wrap(t, f, size, W - M - x)) { ensure(size + st.gap + 1); const w = f.widthOfTextAtSize(l, size); page.drawText(l, { x: center ? (W - w) / 2 : x, y: y - size, size, font: f, color }); y -= size + st.gap + 1; }
  };
  if (st.band) { page.drawRectangle({ x: 0, y: H - 58, width: W, height: 58, color: brand }); page.drawText(latin1(doc.name), { x: M, y: H - 38, size: st.name, font: bold, color: rgb(1, 1, 1) }); y = H - 74; }
  else line(doc.name, bold, st.name, M, BLACK, st.center);
  if (doc.headline) line(doc.headline, font, st.body + 1, M, GREY, st.center);
  line(doc.contact.join("  |  "), font, st.body - 0.5, M, GREY, st.center);
  y -= 4;
  for (const s of doc.sections) {
    ensure(st.head + 30);
    y -= 3;
    line(template === "CLASSIC" ? s.title : s.title.toUpperCase(), bold, st.head, M, brand);
    if (st.rules) { page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.5, color: st.accent ? brand : GREY }); y -= 2; }
    if (s.text) line(s.text, font, st.body);
    if (s.skills) line(s.skills.map((k) => (o.markEvidence && k.backed ? `${k.name}*` : k.name)).join(", "), font, st.body);
    for (const it of s.items ?? []) {
      ensure(st.body * 2 + 6);
      const head = [it.heading, it.sub].filter(Boolean).join(", ");
      const dw = it.date ? font.widthOfTextAtSize(latin1(it.date), st.body) : 0;
      const lines = wrap(head, bold, st.body, W - 2 * M - dw - 8);
      lines.forEach((l, i) => { ensure(st.body + 4); page.drawText(l, { x: M, y: y - st.body, size: st.body, font: bold, color: BLACK }); if (i === 0 && it.date) page.drawText(latin1(it.date), { x: W - M - dw, y: y - st.body, size: st.body, font, color: GREY }); y -= st.body + st.gap + 1; });
      if (it.link) line(it.link, font, st.body - 0.5, M, GREY);
      for (const b of it.bullets) { const ls = wrap(b, font, st.body, W - 2 * M - 12); ls.forEach((l, i) => { ensure(st.body + 4); if (i === 0) page.drawText("-", { x: M + 2, y: y - st.body, size: st.body, font, color: BLACK }); page.drawText(l, { x: M + 12, y: y - st.body, size: st.body, font, color: BLACK }); y -= st.body + st.gap + 1; }); }
      y -= 2;
    }
    y -= 3;
  }
  if (doc.evidenceNote && o.markEvidence) { ensure(20); y -= 4; line(SKILL_NOTE, font, st.body - 1, M, GREY); }
  return Buffer.from(await pdf.save());
}

/** The same resume as a Word file: headings, bullets and tab-aligned dates, no tables or text boxes, so it stays readable to recruiters' software. */
export async function renderDocx(doc: ResumeDoc, o: { markEvidence: boolean }): Promise<Buffer> {
  const t = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, bold: opts.bold, size: opts.size ? opts.size * 2 : undefined, color: opts.color, font: "Calibri" });
  const out: Paragraph[] = [
    new Paragraph({ children: [t(doc.name, { bold: true, size: 20 })], spacing: { after: 60 } }),
    ...(doc.headline ? [new Paragraph({ children: [t(doc.headline, { size: 11 })] })] : []),
    new Paragraph({ children: [t(doc.contact.join("  |  "), { size: 10, color: "555555" })], spacing: { after: 160 } }),
  ];
  for (const s of doc.sections) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(s.title.toUpperCase(), { bold: true, size: 11.5 })], spacing: { before: 200, after: 80 }, border: { bottom: { color: "999999", size: 4, style: "single", space: 1 } } }));
    if (s.text) out.push(new Paragraph({ children: [t(s.text, { size: 10.5 })] }));
    if (s.skills) out.push(new Paragraph({ children: [t(s.skills.map((k) => (o.markEvidence && k.backed ? `${k.name}*` : k.name)).join(", "), { size: 10.5 })] }));
    for (const it of s.items ?? []) {
      out.push(new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9500 }], spacing: { before: 80 }, children: [t([it.heading, it.sub].filter(Boolean).join(", "), { bold: true, size: 10.5 }), ...(it.date ? [t(`\t${it.date}`, { size: 10, color: "555555" })] : [])] }));
      if (it.link) out.push(new Paragraph({ children: [t(it.link, { size: 9.5, color: "555555" })] }));
      for (const b of it.bullets) out.push(new Paragraph({ bullet: { level: 0 }, children: [t(b, { size: 10.5 })] }));
    }
  }
  if (doc.evidenceNote && o.markEvidence) out.push(new Paragraph({ spacing: { before: 160 }, children: [t(SKILL_NOTE, { size: 9, color: "555555" })] }));
  const d = new Document({ creator: doc.name, title: `${doc.name} - resume`, sections: [{ properties: { page: { margin: { top: 850, bottom: 850, left: 1000, right: 1000 } } }, children: out }] });
  void AlignmentType;
  return Buffer.from(await Packer.toBuffer(d));
}

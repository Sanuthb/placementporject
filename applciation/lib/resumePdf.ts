import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

type Block = { heading: string; data: unknown };

/** pdf-lib's built-in fonts only cover Latin-1; anything else is replaced so generation never fails. */
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const hex = (c?: string | null) => { const m = /^#([0-9a-f]{6})$/i.exec(c ?? ""); return m ? rgb(parseInt(m[1].slice(0, 2), 16) / 255, parseInt(m[1].slice(2, 4), 16) / 255, parseInt(m[1].slice(4, 6), 16) / 255) : rgb(0.1, 0.25, 0.55); };
const label = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function lines(value: unknown, depth = 0): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((v) => (typeof v === "object" && v ? [`- ${Object.entries(v as object).filter(([, x]) => x !== "" && x != null && typeof x !== "object").map(([k, x]) => `${label(k)}: ${x}`).join(", ")}`] : [`- ${v}`]));
  if (typeof value === "object") return Object.entries(value as object).flatMap(([k, v]) => (Array.isArray(v) ? [`${label(k)}:`, ...lines(v, depth + 1).map((l) => "  " + l)] : typeof v === "object" && v ? [`${label(k)}:`, ...lines(v, depth + 1).map((l) => "  " + l)] : v === "" || v == null ? [] : [`${label(k)}: ${v}`]));
  return [String(value)];
}

/** College-branded one-or-more page resume from the given (verified) sections. */
export async function buildResumePdf(opts: { college: string; brandColor?: string | null; name: string; contact: string[]; blocks: Block[] }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = hex(opts.brandColor);
  const W = 595, H = 842, M = 48;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (need: number) => { if (y - need < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const wrap = (t: string, f: PDFFont, size: number, max: number) => {
    const out: string[] = []; let cur = "";
    for (const word of safe(t).split(/\s+/)) { const next = cur ? `${cur} ${word}` : word; if (f.widthOfTextAtSize(next, size) > max && cur) { out.push(cur); cur = word; } else cur = next; }
    if (cur) out.push(cur);
    return out;
  };
  const draw = (t: string, f: PDFFont, size: number, x = M, color = rgb(0.1, 0.1, 0.1)) => { for (const l of wrap(t, f, size, W - M - x)) { ensure(size + 4); page.drawText(l, { x, y: y - size, size, font: f, color }); y -= size + 4; } };

  page.drawRectangle({ x: 0, y: H - 26, width: W, height: 26, color: brand });
  page.drawText(safe(opts.college), { x: M, y: H - 18, size: 11, font: bold, color: rgb(1, 1, 1) });
  y = H - 56;
  draw(opts.name, bold, 22, M, brand);
  if (opts.contact.length) draw(opts.contact.join("  |  "), font, 10, M, rgb(0.3, 0.3, 0.3));
  y -= 8;
  for (const b of opts.blocks) {
    const body = lines(b.data);
    if (!body.length) continue;
    ensure(40);
    draw(b.heading.toUpperCase(), bold, 11, M, brand);
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.6, color: brand });
    y -= 4;
    for (const l of body) draw(l, font, 10, M + (l.startsWith("  ") ? 12 : 0));
    y -= 8;
  }
  return Buffer.from(await pdf.save());
}

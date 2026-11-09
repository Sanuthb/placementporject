import assert from "node:assert/strict";
import sharp from "sharp";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { documentKindOf, documentParts, normaliseReading } from "../../lib/documentAi";

let n = 0;
async function t(name: string, fn: () => Promise<void> | void) { await fn(); n++; console.log("PASS " + name); }
const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer();
const scan = await sharp({ create: { width: 1200, height: 1700, channels: 3, background: { r: 250, g: 250, b: 250 } } }).jpeg().toBuffer();

await t("a photo is sent as one JPEG image, shrunk to at most 2000 px", async () => {
  const p = await documentParts(photo, "image/png");
  assert.equal(p.length, 1); assert.equal(p[0].type, "image_url");
  const url = (p[0] as { image_url: { url: string } }).image_url.url; assert.match(url, /^data:image\/jpeg;base64,/);
  const m = await sharp(Buffer.from(url.split(",")[1], "base64")).metadata(); assert.equal(m.width, 2000); assert.equal(m.height, 1333);
});
await t("a PDF with a real text layer is sent as its text", async () => {
  const doc = await PDFDocument.create(); const page = doc.addPage(); const font = await doc.embedFont(StandardFonts.Helvetica);
  ["KARNATAKA SECONDARY EDUCATION EXAMINATION BOARD", "Candidate: SANUTH BIBIN B", "Total marks 392 out of 500", "Result: FIRST CLASS"].forEach((l, i) => page.drawText(l, { x: 40, y: 700 - i * 20, size: 12, font }));
  const p = await documentParts(Buffer.from(await doc.save()), "application/pdf");
  assert.equal(p.length, 1); assert.equal(p[0].type, "text"); assert.match((p[0] as { text: string }).text, /392 out of 500/);
});
await t("a scanned PDF (image only) is sent as its page images, at most 3", async () => {
  const doc = await PDFDocument.create(); const img = await doc.embedJpg(scan);
  for (let i = 0; i < 4; i++) doc.addPage([600, 850]).drawImage(img, { x: 0, y: 0, width: 600, height: 850 });
  const p = await documentParts(Buffer.from(await doc.save()), "application/pdf");
  assert.equal(p.length, 3); assert.ok(p.every((x) => x.type === "image_url"));
});
await t("a PDF with neither text nor a page image is refused with advice", async () => {
  const doc = await PDFDocument.create(); doc.addPage();
  await assert.rejects(documentParts(Buffer.from(await doc.save()), "application/pdf"), /Upload a photo or a PNG\/JPEG/);
});
await t("model answers in a loose shape are coerced and validated", () => {
  const r = normaliseReading({ documentKind: "TENTH_MARKSHEET", candidateName: "SANUTH", percentage: "78.4%", totalObtained: "392", totalMax: 500, examYear: "2019", confidence: "high", subjects: [{ name: "Maths", obtained: "80", max: "100" }, "junk"] });
  assert.equal(r.percentage, 78.4); assert.equal(r.totalObtained, 392); assert.equal(r.examYear, 2019); assert.equal(r.boardOrUniversity, null);
  assert.equal(r.subjects.length, 1); assert.equal(r.subjects[0].obtained, 80); assert.equal(r.subjects[0].code, null);
});
await t("missing keys become nulls; an unknown document kind is OTHER (no suggestion), never a guess", () => {
  assert.equal(normaliseReading({}).documentKind, "OTHER"); assert.equal(normaliseReading({}).confidence, "low");
  assert.equal(normaliseReading({ documentKind: "PASSPORT" }).documentKind, "OTHER");
});
await t("the names models use for documents map onto our kinds", () => {
  const k = (v: string) => documentKindOf(v);
  assert.equal(k("SSLC_MARKSHEET"), "TENTH_MARKSHEET"); assert.equal(k("10th marks card"), "TENTH_MARKSHEET"); assert.equal(k("Matriculation"), "TENTH_MARKSHEET");
  assert.equal(k("PUC result"), "TWELFTH_MARKSHEET"); assert.equal(k("Higher Secondary Certificate"), "TWELFTH_MARKSHEET"); assert.equal(k("XII"), "TWELFTH_MARKSHEET");
  assert.equal(k("Semester Grade Card"), "DEGREE_SEMESTER_MARKSHEET"); assert.equal(k("Provisional degree certificate"), "DEGREE_CERTIFICATE");
  assert.equal(k("diploma marks"), "DIPLOMA_MARKSHEET"); assert.equal(k("illegible"), "UNREADABLE"); assert.equal(k("TWELFTH_MARKSHEET"), "TWELFTH_MARKSHEET");
});
await t("confidence is normalised, unknown means low", () => { assert.equal(normaliseReading({ confidence: "High" }).confidence, "high"); assert.equal(normaliseReading({ confidence: "sure" }).confidence, "low"); });
await t("implausible values from the model are still dropped", () => { assert.equal(normaliseReading({ documentKind: "TENTH_MARKSHEET", percentage: 140, confidence: "high" }).percentage, null); });
console.log(n === 9 ? "ALL PASSED" : "COUNT " + n);
process.exit(0);

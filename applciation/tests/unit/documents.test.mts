import assert from "node:assert/strict"
import { inspectUpload, sniffType, DocumentRejected } from "../../lib/documents"

let n = 0
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name) }
const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc(Math.max(0, 200 - b.length), 0x20)])
const pdf = (extra = "") => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n${extra}\n${" ".repeat(80)}\n%%EOF\n`)
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(80, 1), Buffer.from("IEND\xaeB`\x82", "latin1")])
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 2), Buffer.from([0xff, 0xd9])])
const rejects = (f: () => unknown, msg: RegExp) => assert.throws(f, (e) => e instanceof DocumentRejected && msg.test(e.message))

t("type comes from the bytes", () => { assert.equal(sniffType(pdf()), "application/pdf"); assert.equal(sniffType(png), "image/png"); assert.equal(sniffType(jpg), "image/jpeg"); assert.equal(sniffType(Buffer.from("MZ\x90\x00")), null) })
t("a clean PDF, PNG and JPEG pass and are hashed", () => {
  const a = inspectUpload(pdf(), "application/pdf", "marks card.pdf"); assert.equal(a.safeName, "marks_card.pdf"); assert.match(a.sha256, /^[0-9a-f]{64}$/)
  inspectUpload(png, "image/png", "a.PNG"); inspectUpload(jpg, "image/jpeg", "a.jpeg")
})
t("same bytes give the same hash, different bytes do not", () => {
  assert.equal(inspectUpload(png, "image/png", "a.png").sha256, inspectUpload(png, "image/png", "b.png").sha256)
  assert.notEqual(inspectUpload(png, "image/png", "a.png").sha256, inspectUpload(jpg, "image/jpeg", "a.jpg").sha256)
})
t("declared type or extension that disagrees with the content is refused", () => {
  rejects(() => inspectUpload(png, "application/pdf", "a.pdf"), /does not match/)
  rejects(() => inspectUpload(png, "image/png", "a.pdf"), /must end in \.png/)
  rejects(() => inspectUpload(Buffer.alloc(200, 65), "image/png", "a.png"), /Allowed types/)
})
t("empty, tiny and oversized files are refused", () => {
  rejects(() => inspectUpload(Buffer.alloc(0), "image/png", "a.png"), /empty/)
  rejects(() => inspectUpload(Buffer.from("%PDF-1"), "application/pdf", "a.pdf"), /too small/)
  rejects(() => inspectUpload(Buffer.alloc(10 * 1024 * 1024 + 1), "application/pdf", "a.pdf"), /larger than 10 MB/)
})
t("PDFs with scripts, launch actions, attachments or encryption are refused", () => {
  for (const x of ["/JavaScript (app.alert(1))", "/JS (x)", "/Launch", "/OpenAction 2 0 R", "/EmbeddedFile"]) rejects(() => inspectUpload(pdf(x), "application/pdf", "a.pdf"), /scripts or attachments/)
  rejects(() => inspectUpload(pdf("/Encrypt 5 0 R"), "application/pdf", "a.pdf"), /Password/)
})
t("truncated files are refused", () => {
  rejects(() => inspectUpload(pad(Buffer.from("%PDF-1.4 no end")), "application/pdf", "a.pdf"), /incomplete/)
  rejects(() => inspectUpload(png.subarray(0, 60), "image/png", "a.png"), /incomplete/)
  rejects(() => inspectUpload(jpg.subarray(0, 90), "image/jpeg", "a.jpg"), /incomplete/)
})
t("a hostile file name is neutralised", () => { assert.equal(inspectUpload(png, "image/png", "../../etc/x y.png").safeName, ".._.._etc_x_y.png") })
console.log(n === 8 ? "ALL PASSED" : "COUNT?")

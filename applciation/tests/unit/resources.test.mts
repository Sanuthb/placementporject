import assert from "node:assert/strict";
import { DocumentRejected } from "../../lib/documents";
import { effectiveness, expiryState, nextStatus, reaches, recommendResources, sniffResource, studentCanSee } from "../../lib/resources";

const pad = (b: Buffer, n = 200) => Buffer.concat([b, Buffer.alloc(n)]);
const rejects = (f: () => unknown, re: RegExp) => assert.throws(f, (e) => e instanceof DocumentRejected && re.test(e.message));

// file sniffing
const zip = (names: string) => pad(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(names, "latin1")]));
assert.equal(sniffResource(zip("[Content_Types].xml word/document.xml"), "notes.docx").kind, "DOCUMENT");
assert.equal(sniffResource(zip("ppt/presentation.xml"), "deck.pptx").mime.includes("presentation"), true);
rejects(() => sniffResource(zip("word/document.xml word/vbaProject.bin"), "x.docx"), /macros/);
rejects(() => sniffResource(zip("xl/workbook.xml"), "x.xlsx"), /Word|PowerPoint/);
rejects(() => sniffResource(zip("word/document.xml"), "x.pdf"), /\.docx/);
rejects(() => sniffResource(pad(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), "old.doc"), /docx or \.pptx|\.docx/);
assert.equal(sniffResource(pad(Buffer.from("\0\0\0\x18ftypmp42")), "a.mp4").kind, "VIDEO");
assert.equal(sniffResource(pad(Buffer.from("\0\0\0\x18ftypM4A ")), "a.m4a").kind, "AUDIO");
assert.equal(sniffResource(pad(Buffer.from("ID3\x03")), "a.mp3").kind, "AUDIO");
assert.equal(sniffResource(pad(Buffer.from("RIFF\0\0\0\0WAVEfmt ")), "a.wav").mime, "audio/wav");
assert.equal(sniffResource(pad(Buffer.from("OggS\0")), "a.ogg").mime, "audio/ogg");
rejects(() => sniffResource(pad(Buffer.from("ID3\x03")), "a.exe"), /\.mp3/);
rejects(() => sniffResource(pad(Buffer.from("MZ this is a program")), "setup.pdf"), /Allowed files/);
rejects(() => sniffResource(Buffer.from("tiny"), "a.pdf"), /empty or too small/);
rejects(() => sniffResource(Buffer.concat([Buffer.from("ID3\x03"), Buffer.alloc(31 * 1024 * 1024)]), "big.mp3"), /30 MB/);

// workflow
assert.deepEqual(nextStatus("DRAFT", "SUBMIT", "PLACEMENT_OFFICER"), { status: "IN_REVIEW" });
assert.ok("error" in nextStatus("IN_REVIEW", "APPROVE", "PLACEMENT_OFFICER"), "an officer cannot approve");
assert.deepEqual(nextStatus("IN_REVIEW", "APPROVE", "TPO_ADMIN"), { status: "APPROVED" });
assert.deepEqual(nextStatus("DRAFT", "APPROVE", "TPO_ADMIN"), { status: "APPROVED" }, "admin may approve their own draft");
assert.ok("error" in nextStatus("IN_REVIEW", "REJECT", "TPO_ADMIN"), "rejecting needs a reason");
assert.deepEqual(nextStatus("IN_REVIEW", "REJECT", "TPO_ADMIN", "Wrong subject"), { status: "REJECTED" });
assert.deepEqual(nextStatus("REJECTED", "SUBMIT", "PLACEMENT_OFFICER"), { status: "IN_REVIEW" });
assert.ok("error" in nextStatus("APPROVED", "SUBMIT", "TPO_ADMIN"));
assert.deepEqual(nextStatus("ARCHIVED", "RESTORE", "PLACEMENT_OFFICER"), { status: "DRAFT" });
assert.ok("error" in nextStatus("APPROVED", "RESTORE", "TPO_ADMIN"));

// access
const now = new Date("2026-11-10T00:00:00Z");
const r = (o = {}) => ({ status: "APPROVED", expiresAt: null as Date | null, visibility: "ASSIGNED_ONLY", ...o });
assert.equal(studentCanSee(r(), false, now), false, "assigned-only needs an assignment");
assert.equal(studentCanSee(r(), true, now), true);
assert.equal(studentCanSee(r({ visibility: "ALL_STUDENTS" }), false, now), true);
assert.equal(studentCanSee(r({ visibility: "STAFF_ONLY" }), true, now), false);
assert.equal(studentCanSee(r({ status: "IN_REVIEW", visibility: "ALL_STUDENTS" }), true, now), false);
assert.equal(studentCanSee(r({ visibility: "ALL_STUDENTS", expiresAt: new Date("2026-11-09T00:00:00Z") }), true, now), false, "expired");
assert.equal(expiryState(new Date("2026-11-20T00:00:00Z"), now), "SOON");
assert.equal(expiryState(null, now), "NONE");

// assignment targets
const ctx = { studentId: "s1", departmentId: "d1", batchId: "b1", groupIds: new Set(["g1"]), weakAreas: new Set(["aptitude"]), paperIds: new Set(["p1"]) };
const a = (targetType: string, targetId: string | null, targetKey: string | null = null) => reaches({ targetType, targetId, targetKey }, ctx);
assert.deepEqual([a("STUDENT", "s1"), a("STUDENT", "s2"), a("DEPARTMENT", "d1"), a("BATCH", "b2"), a("GROUP", "g1"), a("GROUP", "g2"), a("MOCK_TEST", "p1"), a("MOCK_TEST", "p2"), a("SKILL_GAP", null, "aptitude"), a("SKILL_GAP", null, "technical"), a("JD", "x")], [true, false, true, false, true, false, true, false, true, false, false]);

// effectiveness
const rows = (n: number, done: number) => Array.from({ length: n }, (_, i) => ({ opened: true, completed: i < done, rating: i < done ? (i % 2 ? 5 : 3) : null }));
const e = effectiveness({ assigned: 10, rows: rows(8, 4) });
assert.deepEqual([e.openedPercent, e.completionPercent, e.averageRating, e.helpfulPercent, e.scoreLink], [80, 40, 4, 50, null]);
assert.equal(effectiveness({ assigned: 0, rows: [] }).completionPercent, null);
assert.equal(effectiveness({ assigned: 12, rows: rows(12, 6), scores: { completed: [70, 80, 60, 90], others: [50, 55, 60, 65, 70] } }).scoreLink, null, "four is too few to compare");
const l = effectiveness({ assigned: 12, rows: rows(12, 6), scores: { completed: [70, 80, 60, 90, 75], others: [50, 55, 60, 65, 70] } }).scoreLink!;
assert.deepEqual([l.completedAverage, l.othersAverage, l.difference], [75, 60, 15]);

// recommendations
const res = (id: string, o = {}) => ({ id, title: id, category: "OTHER", subject: null, topic: null, skills: [] as string[], jobRoles: [] as string[], difficulty: null as string | null, language: "English", durationMin: 30, ...o });
const lib = [res("apt", { category: "APTITUDE", durationMin: 60 }), res("apt-hard", { category: "APTITUDE", difficulty: "HARD" }), res("apt-easy", { category: "APTITUDE", difficulty: "EASY", durationMin: 20 }), res("hindi", { category: "APTITUDE", language: "Hindi" }), res("cook", {}), res("role", { jobRoles: ["Data Analyst"] })];
let out = recommendResources(lib, { weakAreas: ["aptitude"], language: "English" }, new Set());
assert.equal(out[0].id, "apt-easy", "easy material first for a weak student");
assert.ok(!out.some((x) => x.id === "cook"), "unrelated material is never recommended");
assert.ok(out.findIndex((x) => x.id === "hindi") > out.findIndex((x) => x.id === "apt"), "wrong language ranks lower");
assert.deepEqual(recommendResources(lib, { weakAreas: ["aptitude"] }, new Set(["apt", "apt-hard", "apt-easy", "hindi"])), []);
out = recommendResources(lib, { weakAreas: ["aptitude"], hours: 1 }, new Set());
assert.ok(out.reduce((a, x) => a + x.minutes, 0) <= 60, "fits the hours the student has");
assert.equal(recommendResources(lib, { weakAreas: ["aptitude"] }, new Set(), 2).length, 2, "never more than the limit");
assert.equal(recommendResources(lib, { weakAreas: [], targetRole: "Data Analyst" }, new Set())[0].id, "role");
console.log("resources ok");

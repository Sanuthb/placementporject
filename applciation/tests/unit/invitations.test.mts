// Pure logic of the invitation flow: tokens, the email, and what a student must supply before submitting.
import assert from "node:assert/strict";
import { z } from "zod";
import { validationMessage } from "../../lib/api/handler";
import { hashToken, inviteLink, looksLikeToken, maskEmail, newToken } from "../../lib/invitations/token";
import { inviteBody, inviteSubject } from "../../lib/invitations/email";
import { buildSections, computeMissing, percentOf, requiredDocuments } from "../../lib/invitations/onboarding";

let fails = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log("PASS", name); } catch (e) { fails++; console.log("FAIL", name, (e as Error).message.split("\n")[0]); } };

t("tokens are 256-bit, URL-safe and unique", () => {
  const a = newToken(), b = newToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(a, b); assert.ok(looksLikeToken(a));
  assert.ok(!looksLikeToken("short") && !looksLikeToken(`${a}!`) && !looksLikeToken(undefined));
});
t("the stored hash is a SHA-256 hex digest that does not contain the token", () => {
  const tk = newToken(), h = hashToken(tk);
  assert.match(h, /^[0-9a-f]{64}$/); assert.ok(!h.includes(tk)); assert.equal(h, hashToken(tk)); assert.notEqual(h, hashToken(newToken()));
});
t("the link keeps the token in the fragment, never in the path or query", () => {
  process.env.APP_URL = "https://portal.example.edu/";
  const l = inviteLink("abc"); const u = new URL(l);
  assert.equal(u.pathname, "/invite"); assert.equal(u.search, ""); assert.equal(u.hash, "#t=abc");
});
t("masked email hides the name", () => { assert.equal(maskEmail("asha.rao@college.edu").endsWith("@college.edu"), true); assert.ok(!maskEmail("asha.rao@college.edu").includes("sha")); });

t("invitation email follows the specified wording", () => {
  const m = { institution: "Demo College", studentName: "Asha Rao", admissionNumber: "26MCA001", department: "Computer Science", programme: "MCA", batch: "MCA 2026–2028", graduationYear: 2028, link: "https://x.test/invite#t=zzz", expiresAt: new Date("2026-12-31T10:00:00Z") };
  assert.equal(inviteSubject("Demo College"), "Complete Your Student Registration – Demo College");
  const { text, html } = inviteBody(m);
  for (const s of ["Dear Asha Rao,", "invited by Demo College", "- Admission Number: 26MCA001", "- Department: Computer Science", "- Programme: MCA", "- Batch: MCA 2026–2028", "- Expected Graduation Year: 2028", "This invitation expires on 31 December 2026.", "If you did not expect this invitation, please contact your institution.", "Regards,\nDemo College", "https://x.test/invite#t=zzz"]) assert.ok(text.includes(s), s);
  assert.ok(html.includes("Complete Registration") && html.includes("https://x.test/invite#t=zzz"));
});
t("email escapes HTML in names", () => {
  const { html } = inviteBody({ institution: "A", studentName: "<script>x</script>", admissionNumber: "1", department: "D", programme: null, batch: "B", graduationYear: null, link: "l", expiresAt: new Date() });
  assert.ok(!html.includes("<script>"));
});

const edu = (o: object) => ({ level: "School", qualification: "SSLC", percentage: null, cgpa: null, obtainedMarks: null, maxMarks: null, backlogs: 0, status: "COMPLETED", institution: "S", boardOrUniversity: null, completionYear: 2018, ...o });
t("percentage is read directly or worked out from marks", () => { assert.equal(percentOf({ percentage: 88, obtainedMarks: null, maxMarks: null }), 88); assert.equal(percentOf({ percentage: null, obtainedMarks: 450, maxMarks: 600 }), 75); assert.equal(percentOf({ percentage: null, obtainedMarks: null, maxMarks: null }), null); });
t("required marks cards follow the student's own history", () => {
  assert.deepEqual(requiredDocuments([edu({}), edu({ level: "Higher Secondary", qualification: "PUC" })]).sort(), ["TENTH_MARKS", "TWELFTH_MARKS"]);
  assert.deepEqual(requiredDocuments([edu({ level: "Diploma", qualification: "Diploma in CS" })]), ["DIPLOMA_CERTIFICATE"]);
  assert.deepEqual(requiredDocuments([edu({ level: "Other", qualification: "12th CBSE" })]), ["TWELFTH_MARKS"]);
  assert.deepEqual(requiredDocuments([]), []);
});
const full = { fullName: "A B", dob: "2003-01-01", mobile: "9876543210", address: "x", city: "c", state: "s", pincode: "560001" };
t("missing information is listed by step", () => {
  const m = computeMissing({ personal: {}, academics: {}, education: [], documents: [], declarationAccepted: false });
  assert.deepEqual([...new Set(m.map((x) => x.step))], [2, 3, 6]);
  assert.ok(m.some((x) => x.field === "mobile") && m.some((x) => x.field === "education") && m.some((x) => x.field === "declaration"));
});
t("a complete profile has nothing missing", () => {
  const education = [edu({ percentage: 88 }), edu({ level: "Higher Secondary", qualification: "PUC", percentage: 80 })];
  const docs = [{ category: "TENTH_MARKS" as const }, { category: "TWELFTH_MARKS" as const }];
  assert.deepEqual(computeMissing({ personal: full, academics: { cgpa: 8, activeBacklogs: 0 }, education, documents: docs, declarationAccepted: true }), []);
});
t("a rejected document counts as missing and is called out", () => {
  const education = [edu({ percentage: 88 })];
  const m = computeMissing({ personal: full, academics: { cgpa: 8, activeBacklogs: 0 }, education, documents: [{ category: "TENTH_MARKS", status: "REJECTED", fileName: "a.pdf" }], declarationAccepted: true });
  assert.ok(m.some((x) => x.field === "doc:TENTH_MARKS") && m.some((x) => x.field.startsWith("rejected:")));
});
t("an invalid mobile number or a future birth date counts as missing", () => {
  assert.ok(computeMissing({ personal: { ...full, mobile: "abc" }, academics: { cgpa: 1, activeBacklogs: 0 }, education: [edu({ percentage: 1 })], documents: [], declarationAccepted: true }).some((x) => x.field === "mobile"));
  assert.ok(computeMissing({ personal: { ...full, dob: "2999-01-01" }, academics: { cgpa: 1, activeBacklogs: 0 }, education: [edu({ percentage: 1 })], documents: [], declarationAccepted: true }).some((x) => x.field === "dob"));
});
t("sections for verification are built from what the student entered", () => {
  const s = buildSections({ personal: full, academics: { cgpa: 8.1, activeBacklogs: 1 }, career: { summary: "hi", technicalSkills: ["SQL"], programmingLanguages: ["Go", "SQL"], careerInterests: [], preferredRoles: [], certifications: [], projects: [{ title: "P" }], internships: [] }, education: [edu({ percentage: 88 }), edu({ level: "Higher Secondary", qualification: "PUC", percentage: 80, backlogs: 2 })], documents: [] });
  const a = s.ACADEMICS as Record<string, unknown>;
  assert.equal(a.cgpa, 8.1); assert.equal(a.tenthPercentage, 88); assert.equal(a.twelfthPercentage, 80); assert.equal(a.activeBacklogs, 1);
  assert.deepEqual((s.SKILLS as { skills: string[] }).skills, ["SQL", "Go"]);
  assert.equal((s.PERSONAL as { phone: string }).phone, "9876543210");
  assert.equal((s.RESUME as { summary: string }).summary, "hi");
});

t("validation errors say which field and why, never a bare 'Invalid input'", () => {
  const schema = z.object({ password: z.string().min(8, "Use at least 8 characters").regex(/\d/, "Include a number"), name: z.string().min(2), departmentId: z.uuid() });
  const msg = (v: unknown) => { const r = schema.safeParse(v); return r.success ? "" : validationMessage(r.error); };
  assert.equal(msg({ password: "abcdefghi", name: "Al", departmentId: crypto.randomUUID() }), "Password: Include a number");
  assert.match(msg({ password: "abcdefgh1", name: "A", departmentId: "x" }), /Name must be at least 2 characters.*Department must be chosen from the list/);
  assert.match(msg({}), /is required/); assert.ok(!/Invalid input/.test(msg({})));
});

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

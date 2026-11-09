import assert from "node:assert/strict";
import { buildSuggestions, cleanExtraction, extractionSchema, namesMatch, type Context, type Extraction } from "../../lib/ocrSuggestions";
import { is10, is12, isDiploma } from "../../lib/invitations/onboarding";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const blank: Extraction = { documentKind: "TENTH_MARKSHEET", candidateName: null, boardOrUniversity: null, institution: null, examYear: null, semesterNumber: null, totalObtained: null, totalMax: null, percentage: null, sgpa: null, cgpa: null, result: null, subjects: [], confidence: "high", notes: null };
const tenth = { id: "r10", level: "School", qualification: "SSLC / 10th", percentage: 78, obtainedMarks: null, maxMarks: null, completionYear: 2019, boardOrUniversity: "ICSE" };
const ctx = (o: Partial<Context> = {}): Context => ({ category: "TENTH_MARKS", studentName: "Sanuth Bibin B", education: [tenth], semesters: [], is10, is12, isDiploma, ...o });
const keys = (s: { key: string }[]) => s.map((x) => x.key).sort();

t("the schema is what the API is asked to fill (every field present, nullable)", () => { assert.equal(extractionSchema.safeParse(blank).success, true); assert.equal(extractionSchema.safeParse({ ...blank, confidence: "sure" }).success, false); });
t("implausible values are dropped before they can become suggestions", () => {
  const c = cleanExtraction({ ...blank, percentage: 140, sgpa: 11, examYear: 1800, totalObtained: 600, totalMax: 500, semesterNumber: 0, subjects: [{ name: " Maths ", code: null, obtained: 120, max: 100, grade: null, credits: null }, { name: "  ", code: null, obtained: 1, max: 2, grade: null, credits: null }] });
  assert.equal(c.percentage, null); assert.equal(c.sgpa, null); assert.equal(c.examYear, null); assert.equal(c.totalObtained, null); assert.equal(c.totalMax, null); assert.equal(c.semesterNumber, null);
  assert.equal(c.subjects.length, 1); assert.equal(c.subjects[0].name, "Maths"); assert.equal(c.subjects[0].obtained, null);
});
t("a matching reading produces nothing to do", () => { assert.deepEqual(buildSuggestions({ ...blank, candidateName: "SANUTH BIBIN B", percentage: 78, examYear: 2019, boardOrUniversity: "icse" }, ctx()), []); });
t("differing and missing values become suggestions on the right qualification", () => {
  const s = buildSuggestions({ ...blank, totalObtained: 392, totalMax: 500, examYear: 2019, boardOrUniversity: "CBSE" }, ctx());
  assert.deepEqual(keys(s), ["education:r10:boardOrUniversity", "education:r10:maxMarks", "education:r10:obtainedMarks", "education:r10:percentage"]);
  const pct = s.find((x) => x.key.endsWith("percentage"))!; assert.equal(pct.suggested, "78.4"); assert.equal(pct.current, "78");
  assert.deepEqual(pct.target, { recordId: "r10", field: "percentage", value: 78.4 });
});
t("names match regardless of word order and initials", () => {
  assert.ok(namesMatch("B SANUTH BIBIN", "Sanuth Bibin B")); assert.ok(namesMatch("SANUTH BIBIN", "Sanuth Bibin B"));
  assert.ok(!namesMatch("RAHUL KUMAR", "Sanuth Bibin B"));
});
t("a different name, a wrong document type and low confidence are flagged for staff", () => {
  const s = buildSuggestions({ ...blank, documentKind: "TWELFTH_MARKSHEET", candidateName: "Rahul Kumar", confidence: "low" }, ctx());
  assert.deepEqual(keys(s.filter((x) => x.kind === "flag")), ["flag:confidence", "flag:kind", "flag:name", "flag:no-record"]);
});
t("an unreadable document gives only the re-upload advice", () => { const s = buildSuggestions({ ...blank, documentKind: "UNREADABLE", percentage: 50 }, ctx()); assert.deepEqual(keys(s), ["flag:unreadable"]); });
t("no matching qualification is a flag, not a guess", () => { assert.deepEqual(keys(buildSuggestions({ ...blank, percentage: 90 }, ctx({ education: [] }))), ["flag:no-record"]); });
t("a 12th marksheet goes to the 12th record, not the 10th", () => {
  const twelfth = { ...tenth, id: "r12", level: "Higher Secondary", qualification: "PUC", percentage: 83 };
  const s = buildSuggestions({ ...blank, documentKind: "TWELFTH_MARKSHEET", percentage: 85 }, ctx({ category: "TWELFTH_MARKS", education: [tenth, twelfth] }));
  assert.deepEqual(keys(s), ["education:r12:percentage"]);
});
t("a semester marksheet suggests the semester when it is new or differs", () => {
  const subj = [{ name: "Maths", code: "MA1", obtained: 80, max: 100, grade: "A", credits: 4 }, { name: "Physics", code: null, obtained: null, max: 100, grade: null, credits: null }];
  const x = { ...blank, documentKind: "DEGREE_SEMESTER_MARKSHEET" as const, semesterNumber: 2, sgpa: 8.1, subjects: subj };
  const a = buildSuggestions(x, ctx({ category: "DEGREE_MARKS" }));
  assert.deepEqual(keys(a), ["semester:2"]); assert.match(a[0].suggested, /SGPA 8.1, 1 subject with marks/); assert.equal(a[0].current, null);
  assert.deepEqual(buildSuggestions(x, ctx({ category: "DEGREE_MARKS", semesters: [{ semesterNumber: 2, sgpa: 8.1, subjects: 1 }] })), []);
  assert.match(buildSuggestions(x, ctx({ category: "DEGREE_MARKS", semesters: [{ semesterNumber: 2, sgpa: 7.9, subjects: 1 }] }))[0].current!, /SGPA 7.9/);
});
t("a semester marksheet without a readable semester number is flagged", () => { assert.deepEqual(keys(buildSuggestions({ ...blank, documentKind: "DEGREE_SEMESTER_MARKSHEET", sgpa: 8 }, ctx({ category: "DEGREE_MARKS" }))), ["flag:semester"]); });
t("every suggestion starts open", () => { assert.ok(buildSuggestions({ ...blank, percentage: 90, candidateName: "X Y" }, ctx()).every((s) => s.state === "OPEN")); });
console.log(n === 12 ? "ALL PASSED" : "COUNT " + n);

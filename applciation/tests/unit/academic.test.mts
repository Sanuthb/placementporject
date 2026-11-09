// Structured academic records (M3 phase 2): validation, the calculations, backlog attempts, and the snapshot other modules read.
import assert from "node:assert/strict";
import { educationInput } from "../../lib/api/academic";
import {
  attemptInput, backlogInput, backlogStatus, calculatedSgpa, checkActiveBacklogs, nextAttemptNumber, overlayAcademics, overlayEducationHistory, pendingBacklogCount,
  semesterInput, semesterPercentage, subjectInput, type BacklogRow, type EduRow, type Records, type SemRow,
} from "../../lib/academicRecords";

let fails = 0;
const t = (name: string, fn: () => void) => { try { fn(); console.log("PASS", name); } catch (e) { fails++; console.log("FAIL", name, (e as Error).message.split("\n")[0]); } };
const sub = (o: object = {}) => ({ name: "Maths", marksObtained: 80, maxMarks: 100, ...o });
const sem = (o: object = {}) => ({ semesterNumber: 1, subjects: [sub()], ...o });
const msg = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) => (r.success ? "" : r.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

// ---- subject marks and semesters
t("a normal semester with subjects is accepted", () => assert.ok(semesterInput.safeParse(sem({ sgpa: 8.4, subjects: [sub(), sub({ name: "Physics", marksObtained: 70 })] })).success));
t("marks cannot be negative or above the maximum", () => { assert.ok(!subjectInput.safeParse(sub({ marksObtained: -1 })).success); assert.match(msg(subjectInput.safeParse(sub({ marksObtained: 101 }))), /exceed/); });
t("maximum marks must be above zero", () => { assert.ok(!subjectInput.safeParse(sub({ maxMarks: 0 })).success); assert.ok(!subjectInput.safeParse(sub({ maxMarks: -5 })).success); });
t("grade points are 0 to 10", () => { assert.ok(!subjectInput.safeParse(sub({ gradePoints: 10.5 })).success); assert.ok(subjectInput.safeParse(sub({ gradePoints: 10 })).success); });
t("SGPA boundaries: 0 and 10 pass, outside is refused", () => { for (const v of [0, 10]) assert.ok(semesterInput.safeParse(sem({ sgpa: v })).success, String(v)); for (const v of [-0.1, 10.01]) assert.ok(!semesterInput.safeParse(sem({ sgpa: v })).success, String(v)); });
t("semester numbers run from 1 to 12", () => { assert.ok(!semesterInput.safeParse(sem({ semesterNumber: 0 })).success); assert.ok(!semesterInput.safeParse(sem({ semesterNumber: 13 })).success); assert.ok(!semesterInput.safeParse(sem({ semesterNumber: 1.5 })).success); });
t("the same subject twice in a semester is refused, by code or by name", () => {
  assert.match(msg(semesterInput.safeParse(sem({ subjects: [sub(), sub({ name: "maths" })] }))), /twice/);
  assert.match(msg(semesterInput.safeParse(sem({ subjects: [sub({ code: "M1", name: "A" }), sub({ code: "m1", name: "B" })] }))), /twice/);
  assert.ok(semesterInput.safeParse(sem({ subjects: [sub({ code: "M1", name: "Maths" }), sub({ code: "M2", name: "Maths" })] })).success, "different codes are different subjects");
});
t("a semester with no subjects is allowed (only the SGPA is known)", () => assert.ok(semesterInput.safeParse({ semesterNumber: 2, sgpa: 7.9 }).success));
t("SGPA is worked out from credits and grade points when every subject has them", () => assert.equal(calculatedSgpa([{ credits: 4, gradePoints: 9 }, { credits: 2, gradePoints: 6 }]), 8));
t("SGPA cannot be checked when a subject lacks credits or grade points", () => { assert.equal(calculatedSgpa([{ credits: 4, gradePoints: 9 }, { credits: 2 }]), null); assert.equal(calculatedSgpa([]), null); });
t("a declared SGPA that contradicts the grade points is refused and says what it should be", () => {
  const bad = semesterInput.safeParse(sem({ sgpa: 9.5, subjects: [sub({ credits: 4, gradePoints: 9 }), sub({ name: "B", credits: 2, gradePoints: 6 })] }));
  assert.match(msg(bad), /calculated 8/);
  assert.ok(semesterInput.safeParse(sem({ sgpa: 8.02, subjects: [sub({ credits: 4, gradePoints: 9 }), sub({ name: "B", credits: 2, gradePoints: 6 })] })).success, "within rounding");
});
t("a semester's percentage comes from the marks and is not an input", () => { assert.equal(semesterPercentage([{ marksObtained: 80, maxMarks: 100 }, { marksObtained: 60, maxMarks: 100 }]), 70); assert.equal(semesterPercentage([]), null); assert.ok(!("percentage" in (semesterInput.parse(sem({ percentage: 99 })) as object))); });

// ---- qualifications
const edu = (o: object = {}) => ({ level: "School", qualification: "SSLC", institution: "Govt School", ...o });
t("a qualification whose percentage matches its marks is accepted", () => assert.ok(educationInput.safeParse(edu({ obtainedMarks: 450, maxMarks: 500, percentage: 90 })).success));
t("a percentage that contradicts the marks is refused", () => assert.match(msg(educationInput.safeParse(edu({ obtainedMarks: 450, maxMarks: 500, percentage: 75 }))), /does not match/));
t("a percentage alone, or marks alone, is still fine", () => { assert.ok(educationInput.safeParse(edu({ percentage: 88 })).success); assert.ok(educationInput.safeParse(edu({ obtainedMarks: 300, maxMarks: 500 })).success); });
t("obtained marks above the maximum, and CGPA above 10, are still refused", () => { assert.ok(!educationInput.safeParse(edu({ obtainedMarks: 600, maxMarks: 500 })).success); assert.ok(!educationInput.safeParse(edu({ cgpa: 10.5 })).success); });

// ---- backlogs
const att = (n: number, outcome: string, extra: object = {}) => ({ attemptNumber: n, outcome, examSession: null, clearedInSemester: null, reviewStatus: "VERIFIED", ...extra });
t("a backlog needs a subject and a semester", () => { assert.ok(!backlogInput.safeParse({ subjectName: "", semesterNumber: 2 }).success); assert.ok(!backlogInput.safeParse({ subjectName: "DS", semesterNumber: 0 }).success); assert.ok(backlogInput.safeParse({ subjectName: "DS", semesterNumber: 2 }).success); });
t("clearing a backlog must say in which semester", () => { assert.match(msg(attemptInput.safeParse({ outcome: "CLEARED" })), /which semester/); assert.ok(attemptInput.safeParse({ outcome: "CLEARED", clearedInSemester: 4 }).success); assert.ok(attemptInput.safeParse({ outcome: "FAILED" }).success); });
t("a backlog is pending until an attempt clears it", () => { assert.equal(backlogStatus([att(1, "FAILED")]), "PENDING"); assert.equal(backlogStatus([att(1, "FAILED"), att(2, "CLEARED")]), "CLEARED"); });
t("attempt numbers count up and earlier attempts are kept", () => { assert.equal(nextAttemptNumber([att(1, "FAILED")]), 2); assert.equal(nextAttemptNumber([att(1, "FAILED"), att(2, "FAILED")]), 3); });
t("a cleared backlog takes no more attempts, and there is a ceiling", () => { assert.throws(() => nextAttemptNumber([att(1, "FAILED"), att(2, "CLEARED")]), /already cleared/); assert.throws(() => nextAttemptNumber(Array.from({ length: 10 }, (_, i) => att(i + 1, "FAILED"))), /At most/); });
t("declared active backlogs cannot be fewer than the pending subjects listed", () => { assert.throws(() => checkActiveBacklogs(0, 1), /fewer/); assert.doesNotThrow(() => checkActiveBacklogs(2, 1)); assert.doesNotThrow(() => checkActiveBacklogs(undefined, 3)); });

// ---- the snapshot other modules read
const semRow = (o: Partial<SemRow> = {}): SemRow => ({ semesterNumber: 1, sgpa: "8.50", resultStatus: "PASS", reviewStatus: "VERIFIED", pendingData: null, subjects: [{ code: null, name: "Maths", marksObtained: "80", maxMarks: "100", credits: null, grade: null, gradePoints: null }], ...o });
const blRow = (o: Partial<BacklogRow> = {}): BacklogRow => ({ subjectName: "DS", subjectCode: null, semesterNumber: 2, attempts: [att(1, "FAILED")], ...o });
const eduRow = (o: Partial<EduRow> = {}): EduRow => ({ level: "School", qualification: "SSLC", institution: "S", boardOrUniversity: null, completionYear: 2019, percentage: null, cgpa: null, obtainedMarks: 450, maxMarks: 500, backlogs: 0, status: "COMPLETED", reviewStatus: "VERIFIED", pendingData: null, ...o });
const recs = (o: Partial<Records> = {}): Records => ({ semesters: [], backlogs: [], education: [], ...o });
const base = { cgpa: 8, tenthPercentage: 70, twelfthPercentage: 72, activeBacklogs: 1 };

t("with no structured records the section data is untouched", () => assert.deepEqual(overlayAcademics(base, recs(), "verified"), base));
t("semesters keep the keys eligibility and intelligence read (semester, sgpa)", () => {
  const out = overlayAcademics(base, recs({ semesters: [semRow()] }), "verified") as { semesters: Record<string, unknown>[]; cgpa: number; activeBacklogs: number };
  assert.equal(out.semesters[0].semester, 1); assert.equal(out.semesters[0].sgpa, 8.5); assert.equal(out.semesters[0].percentage, 80);
  assert.equal(out.cgpa, 8); assert.equal(out.activeBacklogs, 1);
});
t("semesters already in the JSON are kept; a structured record replaces only the same semester", () => {
  const legacy = { ...base, semesters: [{ semester: 1, sgpa: 7 }, { semester: 2, sgpa: 7.5 }] };
  const out = overlayAcademics(legacy, recs({ semesters: [semRow()] }), "verified") as { semesters: Record<string, unknown>[] };
  assert.deepEqual(out.semesters.map((s) => [s.semester, s.sgpa]), [[1, 8.5], [2, 7.5]]);
});
t("only verified records reach the verified snapshot", () => {
  const out = overlayAcademics(base, recs({ semesters: [semRow({ reviewStatus: "SUBMITTED" }), semRow({ semesterNumber: 2, reviewStatus: "VERIFIED" })] }), "verified") as { semesters: Record<string, unknown>[] };
  assert.deepEqual(out.semesters.map((s) => s.semester), [2]);
});
t("a pending edit is shown to the proposed view but never to the verified one", () => {
  const row = semRow({ pendingData: { semesterNumber: 1, sgpa: 9.9, resultStatus: "PASS", subjects: [] } });
  assert.equal((overlayAcademics(base, recs({ semesters: [row] }), "proposed") as { semesters: { sgpa: number }[] }).semesters[0].sgpa, 9.9);
  assert.equal((overlayAcademics(base, recs({ semesters: [row] }), "verified") as { semesters: { sgpa: number }[] }).semesters[0].sgpa, 8.5);
});
t("stale generated semesters are dropped when their records are gone, older entries stay", () => {
  const out = overlayAcademics({ ...base, semesters: [{ semester: 1, sgpa: 8, subjects: [] }, { semester: 3, sgpa: 7 }] }, recs(), "verified") as { semesters: Record<string, unknown>[] };
  assert.deepEqual(out.semesters.map((s) => s.semester), [3]);
});
t("backlog history lists every attempt and its outcome; older count-style entries are kept", () => {
  const out = overlayAcademics({ ...base, backlogHistory: [{ level: "UG", backlogs: 2 }] }, recs({ backlogs: [blRow({ attempts: [att(1, "FAILED"), att(2, "CLEARED", { clearedInSemester: 4 })] })] }), "verified") as { backlogHistory: Record<string, unknown>[] };
  assert.equal(out.backlogHistory.length, 2); assert.equal(out.backlogHistory[1].status, "CLEARED"); assert.equal((out.backlogHistory[1].attempts as unknown[]).length, 2);
});
t("an unverified attempt is not in the verified backlog history", () => {
  const out = overlayAcademics(base, recs({ backlogs: [blRow({ attempts: [att(1, "FAILED"), att(2, "CLEARED", { reviewStatus: "SUBMITTED", clearedInSemester: 4 })] })] }), "verified") as { backlogHistory: { status: string; attempts: unknown[] }[] };
  assert.equal(out.backlogHistory[0].status, "PENDING"); assert.equal(out.backlogHistory[0].attempts.length, 1);
});
t("pending backlog count follows the view", () => {
  const b = [blRow({ attempts: [att(1, "FAILED"), att(2, "CLEARED", { reviewStatus: "SUBMITTED", clearedInSemester: 4 })] })];
  assert.equal(pendingBacklogCount(b, "verified"), 1); assert.equal(pendingBacklogCount(b, "proposed"), 0);
});
t("10th and 12th percentages come from the qualification records, worked out from marks", () => {
  const out = overlayAcademics(base, recs({ education: [eduRow(), eduRow({ level: "Higher Secondary", qualification: "PUC", obtainedMarks: 510, maxMarks: 600 })] }), "verified");
  assert.equal(out.tenthPercentage, 90); assert.equal(out.twelfthPercentage, 85);
});
t("an unverified qualification does not change the verified percentages", () => assert.equal(overlayAcademics(base, recs({ education: [eduRow({ reviewStatus: "SUBMITTED" })] }), "verified").tenthPercentage, 70));
t("a diploma stands in for 12th when there is no 12th record", () => assert.equal(overlayAcademics(base, recs({ education: [eduRow({ level: "Diploma", qualification: "Diploma", obtainedMarks: 640, maxMarks: 800 })] }), "verified").twelfthPercentage, 80));
t("the education history keeps the shape the onboarding submit always produced", () => {
  const out = overlayEducationHistory({}, recs({ education: [eduRow()] }), "verified") as { history: Record<string, unknown>[] };
  assert.deepEqual(Object.keys(out.history[0]), ["level", "qualification", "institution", "board", "year", "percentage", "status"]); assert.equal(out.history[0].percentage, 90);
});
t("a pending qualification edit shows in the proposed history only", () => {
  const row = eduRow({ pendingData: { obtainedMarks: 400, maxMarks: 500 } });
  assert.equal((overlayEducationHistory({}, recs({ education: [row] }), "proposed") as { history: { percentage: number }[] }).history[0].percentage, 80);
  assert.equal((overlayEducationHistory({}, recs({ education: [row] }), "verified") as { history: { percentage: number }[] }).history[0].percentage, 90);
});
t("with no qualification records the history is untouched", () => assert.deepEqual(overlayEducationHistory({ history: [{ level: "x" }] }, recs(), "verified"), { history: [{ level: "x" }] }));

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

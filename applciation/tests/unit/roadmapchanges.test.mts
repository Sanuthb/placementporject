import assert from "node:assert/strict";
import { milestoneCreate, milestonePatch, planMilestoneChange } from "../../lib/roadmapChanges";
import { ApiError } from "../../lib/api/errors";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const plan = (m: Partial<{ status: string; semester: number; source: string; auto: string | null }>, b: object, actor: "STUDENT" | "MENTOR" | "STAFF" = "STUDENT", total = 4) =>
  planMilestoneChange({ status: "PLANNED", semester: 2, source: "TEMPLATE", auto: null, ...m }, milestonePatch.parse(b), { actor }, total, new Date("2026-11-09T00:00:00Z"));
const refused = (f: () => unknown, status: number, msg: RegExp) => assert.throws(f, (e) => e instanceof ApiError && e.status === status && msg.test(e.message));

t("a student can mark a hand-ticked milestone done, and it records who and when", () => {
  const r = plan({}, { status: "DONE" }); assert.equal(r.data.status, "DONE"); assert.equal(r.data.completedBy, "STUDENT"); assert.equal(r.changedStatus, true); assert.ok(r.data.completedAt instanceof Date);
});
t("a student cannot mark an automatically tracked milestone done, and is told what makes it done", () => { refused(() => plan({ auto: "riasec" }, { status: "DONE" }), 409, /ticked automatically.*you have taken the career interests test/i); });
t("a student can still skip or move an automatically tracked milestone", () => {
  assert.equal(plan({ auto: "riasec" }, { status: "SKIPPED" }).data.status, "SKIPPED"); assert.equal(plan({ auto: "riasec" }, { semester: 3 }).data.semester, 3);
});
t("moving to another semester changes its phase, and a semester beyond the programme is refused", () => {
  assert.equal(plan({}, { semester: 4 }).data.phase, "PREPARE"); assert.equal(plan({}, { semester: 1 }).data.phase, "DISCOVER");
  refused(() => plan({}, { semester: 5 }), 400, /4 semesters/);
});
t("standard milestones cannot be renamed; the student's own can", () => {
  refused(() => plan({ source: "TEMPLATE" }, { title: "Something else" }), 400, /skip this one/i);
  assert.equal(plan({ source: "CUSTOM" }, { title: "Finish SQL course" }).data.title, "Finish SQL course"); assert.equal(plan({ source: "RECOMMENDED" }, { description: "x" }).data.description, "x");
});
t("a mentor or staff member can confirm done and reopen, with their own role recorded", () => {
  assert.equal(plan({}, { status: "DONE" }, "MENTOR").data.completedBy, "MENTOR"); assert.equal(plan({}, { status: "DONE" }, "STAFF").data.completedBy, "STAFF");
  const reopened = plan({ status: "DONE" }, { status: "PLANNED" }, "MENTOR"); assert.equal(reopened.data.completedAt, null); assert.equal(reopened.data.completedBy, null);
});
t("a mentor or staff member can confirm an automatically tracked milestone (they are not the student) but cannot rewrite or move the plan", () => {
  assert.equal(plan({ auto: "riasec" }, { status: "DONE" }, "MENTOR").data.status, "DONE");
  refused(() => plan({ source: "CUSTOM" }, { title: "Rewritten" }, "MENTOR"), 400, /not rewrite or move/); refused(() => plan({}, { semester: 3 }, "STAFF"), 400, /not rewrite or move/);
});
t("reopening a done milestone clears who and when; setting the same status changes nothing", () => {
  assert.deepEqual(plan({ status: "PLANNED" }, { status: "PLANNED" }).data, {}); assert.equal(plan({ status: "PLANNED" }, { status: "PLANNED" }).changedStatus, false);
});
t("notes can be added and cleared", () => { assert.equal(plan({}, { note: "talked to mentor" }).data.note, "talked to mentor"); assert.equal(plan({}, { note: "" }).data.note, null); });
t("input limits: a milestone needs a real title, and semesters are 1 to 20", () => {
  assert.equal(milestoneCreate.safeParse({ title: "ab", semester: 1 }).success, false); assert.equal(milestoneCreate.safeParse({ title: "Learn SQL", semester: 0 }).success, false);
  assert.equal(milestoneCreate.safeParse({ title: "Learn SQL", semester: 3 }).success, true); assert.equal(milestoneCreate.parse({ title: "Learn SQL", semester: 3 }).category, "PERSONAL");
  assert.equal(milestoneCreate.safeParse({ title: "Learn SQL", semester: 3, category: "BRIBERY" }).success, false);
});
console.log(n === 10 ? "ALL PASSED" : "COUNT " + n);

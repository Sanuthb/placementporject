import assert from "node:assert/strict";
import { computeCompletion, type CompletionInput } from "../../lib/profileCompletion";
import { hasContent } from "../../lib/profileCompletionLoad";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const base = (o: Partial<CompletionInput> = {}): CompletionInput => ({ required: ["PERSONAL", "ACADEMICS"], sections: [], documents: [], requiredDocuments: [], onboardingStatus: "VERIFIED", optional: ["ACHIEVEMENTS"], ...o });
const V = (section: string) => ({ section, status: "VERIFIED" });

t("nothing done: 0%, and the first required section is the next action", () => {
  const c = computeCompletion(base());
  assert.equal(c.percent, 0); assert.equal(c.verifiedPercent, 0); assert.equal(c.total, 2); assert.equal(c.missing.length, 2);
  assert.equal(c.nextAction.kind, "todo"); assert.equal(c.nextAction.href, "/student/profile/PERSONAL");
});
t("submitted counts for the student, not for verification", () => {
  const c = computeCompletion(base({ sections: [V("PERSONAL"), { section: "ACADEMICS", status: "SUBMITTED" }] }));
  assert.equal(c.percent, 100); assert.equal(c.verifiedPercent, 50); assert.equal(c.nextAction.kind, "wait"); assert.equal(c.nextAction.href, null);
});
t("required documents count as items; a pending upload is waiting, a missing one is to do", () => {
  const c = computeCompletion(base({ sections: [V("PERSONAL"), V("ACADEMICS")], requiredDocuments: ["TENTH_MARKS", "TWELFTH_MARKS"], documents: [{ category: "TENTH_MARKS", status: "PENDING", fileName: "a.pdf" }] }));
  assert.equal(c.total, 4); assert.equal(c.percent, 75); assert.equal(c.verifiedPercent, 50);
  assert.equal(c.nextAction.kind, "todo"); assert.match(c.nextAction.title, /12th marks card/); assert.equal(c.nextAction.href, "/student/onboarding");
});
t("staff feedback comes first: changes requested beats anything left to fill in", () => {
  const c = computeCompletion(base({ sections: [{ section: "ACADEMICS", status: "CHANGES_REQUESTED", reviewComment: "CGPA does not match the marksheet" }] }));
  assert.equal(c.nextAction.kind, "fix"); assert.equal(c.nextAction.detail, "CGPA does not match the marksheet"); assert.equal(c.nextAction.href, "/student/profile/ACADEMICS");
});
t("a rejected document is a fix with the reason, and stays a fix (remove it) even beside a newer pending copy", () => {
  const rej = { category: "TENTH_MARKS", status: "REJECTED", fileName: "blurry.jpg", rejectReason: "Unreadable" };
  const a = computeCompletion(base({ sections: [V("PERSONAL"), V("ACADEMICS")], requiredDocuments: ["TENTH_MARKS"], documents: [rej] }));
  assert.equal(a.nextAction.kind, "fix"); assert.match(a.nextAction.detail, /blurry\.jpg.*Unreadable/);
  const b = computeCompletion(base({ sections: [V("PERSONAL"), V("ACADEMICS")], requiredDocuments: ["TENTH_MARKS"], documents: [rej, { category: "TENTH_MARKS", status: "PENDING", fileName: "clear.pdf" }] }));
  assert.equal(b.nextAction.kind, "fix"); assert.match(b.nextAction.detail, /Remove it/);
  assert.equal(b.percent, 100); // the category itself is covered by the pending copy
});
t("a rejected document that is not required still has to be dealt with, but does not change the percentage", () => {
  const c = computeCompletion(base({ sections: [V("PERSONAL"), V("ACADEMICS")], documents: [{ category: "OTHER", status: "REJECTED", fileName: "x.pdf" }] }));
  assert.equal(c.percent, 100); assert.equal(c.total, 2); assert.equal(c.nextAction.kind, "fix");
});
t("before the onboarding form is submitted, the form is the next step", () => {
  const c = computeCompletion(base({ onboardingStatus: "PROFILE_IN_PROGRESS" }));
  assert.equal(c.nextAction.kind, "onboarding"); assert.equal(c.nextAction.href, "/student/onboarding"); assert.match(c.nextAction.detail, /2 required items/);
});
t("corrections requested on the whole profile point at the onboarding form", () => {
  assert.equal(computeCompletion(base({ onboardingStatus: "CHANGES_REQUESTED", sections: [V("PERSONAL"), V("ACADEMICS")] })).nextAction.kind, "fix");
});
t("all verified: optional achievements are suggested once, then the profile is complete", () => {
  const a = computeCompletion(base({ sections: [V("PERSONAL"), V("ACADEMICS")] }));
  assert.equal(a.percent, 100); assert.equal(a.nextAction.kind, "optional"); assert.equal(a.nextAction.href, "/student/profile/ACHIEVEMENTS");
  const b = computeCompletion(base({ sections: [V("PERSONAL"), V("ACADEMICS"), { section: "ACHIEVEMENTS", status: "DRAFT", hasData: true }] }));
  assert.equal(b.nextAction.kind, "none");
});
t("an optional section never counts against completion", () => { assert.equal(computeCompletion(base({ sections: [V("PERSONAL"), V("ACADEMICS")] })).total, 2); });
t("a required list of nothing is 100% (a college that requires nothing)", () => { const c = computeCompletion(base({ required: [] })); assert.equal(c.percent, 100); assert.equal(c.total, 0); });
t("duplicate required entries are counted once", () => { assert.equal(computeCompletion(base({ required: ["PERSONAL", "PERSONAL"] })).total, 1); });
t("a saved draft says so, an untouched section says not filled in", () => {
  const c = computeCompletion(base({ sections: [{ section: "PERSONAL", status: "DRAFT", hasData: true }] }));
  assert.match(c.items[0].detail!, /draft/); assert.match(c.items[1].detail!, /Not filled in/);
});
t("empty saved content does not count as content", () => {
  assert.equal(hasContent({ achievements: [] }), false); assert.equal(hasContent({ a: "  ", b: [{ c: "" }] }), false);
  assert.equal(hasContent({ cgpa: 0 }), true); assert.equal(hasContent({ achievements: [{ title: "x" }] }), true);
});
console.log(n === 14 ? "ALL PASSED" : "COUNT " + n);

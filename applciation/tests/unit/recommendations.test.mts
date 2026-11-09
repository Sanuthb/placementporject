import assert from "node:assert/strict";
import { coverage, recommend } from "../../lib/careerRecommendations";
import type { Dimension } from "../../lib/intelligence/evidence";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const dim = (key: string, score: number | null, kind: Dimension["kind"] = score == null ? "none" : "measured"): Dimension => ({ key, label: { aptitude: "Aptitude and reasoning", technical: "Technical competencies", digital: "Digital literacy", communication: "Communication", teamwork: "Teamwork and leadership", riasec: "Career interests (RIASEC)", disc: "Behavioural style" }[key] ?? key, kind, score, confidence: score == null ? "none" : "medium", items: [], gaps: [] });
const ids = (r: { id: string }[]) => r.map((x) => x.id);

t("a low skill gets an 'improve' recommendation that says the score, and the weakest comes first", () => {
  const r = recommend([dim("aptitude", 45), dim("digital", 30), dim("technical", 80)]);
  assert.deepEqual(ids(r).slice(0, 2), ["improve:digital", "improve:aptitude"]);
  assert.match(r[0].why, /30%/); assert.equal(r[0].kind, "improve"); assert.equal(r[0].href, "/student/prep");
  assert.ok(ids(r).includes("strength:technical"));
});
t("a skill with no result gets a 'take the test' recommendation pointing at the right place", () => {
  const r = recommend([dim("technical", null), dim("communication", null)]);
  assert.equal(r.find((x) => x.id === "take:technical")?.href, "/student/assessments"); assert.equal(r.find((x) => x.id === "take:communication")?.href, "/student/tests");
});
t("a declared (unmeasured) skill is not treated as missing", () => { assert.deepEqual(ids(recommend([dim("technical", null, "declared")])), []); });
t("scores between 60 and 75 produce no advice either way", () => { assert.deepEqual(recommend([dim("aptitude", 68)]), []); });
t("teamwork: missing gets a prompt, low gets practice advice, high gets none", () => {
  assert.ok(ids(recommend([dim("teamwork", null)])).includes("take:teamwork")); assert.ok(ids(recommend([dim("teamwork", 40)])).includes("improve:teamwork")); assert.deepEqual(recommend([dim("teamwork", 85)]), []);
});
t("interests: the top three types become roles to explore, framed as ideas not predictions", () => {
  const r = recommend([], { riasecRanking: ["I", "R", "C", "S", "E", "A"], styleRanking: null }).find((x) => x.id === "explore:riasec")!;
  assert.match(r.title, /Investigative, Realistic, Conventional/); assert.match(r.action, /Software engineer/); assert.match(r.action, /not a prediction/);
});
t("behavioural style gives one tip for the strongest style, and nothing when it is not available", () => {
  assert.match(recommend([], { riasecRanking: null, styleRanking: ["C", "S", "D", "I"] }).find((x) => x.id === "explore:style")!.action, /accuracy/);
  assert.deepEqual(recommend([], { riasecRanking: null, styleRanking: null }), []); assert.deepEqual(recommend([]), []);
});
t("the same results always give the same, stable ordering", () => {
  const d = [dim("digital", 50), dim("aptitude", 50), dim("technical", 50)];
  assert.deepEqual(ids(recommend(d)), ids(recommend([...d].reverse())));
});
t("no recommendation mentions eligibility, selection or rejection", () => {
  const all = recommend([dim("aptitude", 10), dim("digital", null), dim("communication", 90), dim("teamwork", 20)], { riasecRanking: ["S", "E", "A"], styleRanking: ["D"] });
  for (const r of all) assert.ok(!/eligib|reject|shortlist|not suitable|unfit/i.test(`${r.title} ${r.why} ${r.action}`), r.id);
});
t("coverage counts measured areas and names the missing ones", () => {
  const c = coverage([dim("aptitude", 70), dim("digital", null), dim("technical", null, "declared")]);
  assert.deepEqual(c, { measured: 1, total: 3, missing: ["Digital literacy"] });
});
t("the staff wording speaks about the student, never to them, and has no student-only links", () => {
  const dims = [dim("aptitude", 40), dim("digital", null), dim("communication", null), dim("teamwork", null), dim("technical", 90)];
  const sig = { riasecRanking: ["S", "E", "A"], styleRanking: ["C"] };
  const staff = recommend(dims, sig, "staff"), student = recommend(dims, sig, "student");
  assert.deepEqual(ids(staff), ids(student));
  for (const r of staff) { assert.ok(!/\byour\b|\byou\b/i.test(`${r.title} ${r.why} ${r.action}`), r.id + ": " + r.why + " | " + r.action); assert.equal(r.href, null, r.id); }
  assert.ok(student.some((r) => /\byour\b/i.test(r.why)));
});
console.log(n === 11 ? "ALL PASSED" : "COUNT " + n);

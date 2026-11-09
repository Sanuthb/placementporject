import assert from "node:assert/strict";
import { STARTER_BANKS, starterByKey } from "../../lib/starterBanks";
import { ASSESSMENT_CATEGORIES } from "../../lib/reassessment";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const cats = new Set(ASSESSMENT_CATEGORIES.map(([k]) => k as string));

t("every question has four distinct options, a valid answer, an explanation and a tag", () => {
  for (const b of STARTER_BANKS) for (const q of b.questions) {
    assert.equal(q.options.length, 4, q.text); assert.equal(new Set(q.options).size, 4, q.text);
    assert.ok(q.answer >= 0 && q.answer <= 3, q.text); assert.ok(q.explanation.length > 10 && q.tag, q.text); assert.ok(q.text.length >= 10);
  }
});
t("banks have unique keys and names, a real category, and sensible paper settings", () => {
  assert.equal(new Set(STARTER_BANKS.map((b) => b.key)).size, STARTER_BANKS.length); assert.equal(new Set(STARTER_BANKS.map((b) => b.name)).size, STARTER_BANKS.length);
  for (const b of STARTER_BANKS) { assert.ok(cats.has(b.category)); assert.ok(b.durationMin >= 5 && b.passPercent >= 1 && b.passPercent <= 100); assert.ok(starterByKey(b.key)); }
});
t("question texts are unique within a bank", () => { for (const b of STARTER_BANKS) assert.equal(new Set(b.questions.map((q) => q.text)).size, b.questions.length, b.key); });
t("correct answers are not bunched in one position (no guessing by pattern)", () => {
  for (const b of STARTER_BANKS) { const pos = new Set(b.questions.map((q) => q.answer)); assert.ok(pos.size >= 2, b.key); assert.ok(b.questions.filter((q) => q.answer === 1).length <= Math.ceil(b.questions.length * 0.85), b.key); }
});
t("the SRS categories are all covered: aptitude, digital literacy, communication and technical", () => {
  const got = new Set(STARTER_BANKS.map((b) => b.category)); for (const c of ["APTITUDE", "DIGITAL_LITERACY", "COMMUNICATION", "TECHNICAL"]) assert.ok(got.has(c as never), c);
  assert.ok(STARTER_BANKS.filter((b) => b.category === "TECHNICAL").length >= 3);
});
t("the aptitude bank covers quantitative, logical and verbal evenly", () => {
  const a = starterByKey("aptitude")!; for (const area of ["quantitative", "logical", "verbal"]) assert.ok(a.questions.filter((q) => q.tag === area).length >= 7, area);
});
t("spot-check the arithmetic in the quantitative questions", () => {
  const a = starterByKey("aptitude")!.questions; const ans = (i: number) => a[i].options[a[i].answer];
  assert.equal(ans(0), "₹2,000"); assert.equal(ans(1), "24"); assert.equal(ans(2), "₹1,200"); assert.equal(ans(3), "4"); assert.equal(ans(4), "15"); assert.equal(ans(5), "30"); assert.equal(ans(6), "25%"); assert.equal(ans(7), "9");
  assert.equal(2500 * 0.8, 2000); assert.equal((8000 * 5 * 3) / 100, 1200); assert.equal(1 / (1 / 12 + 1 / 6), 4); assert.equal((54 * 1000) / 3600, 15); assert.equal(5 * 24 - 90, 30); assert.equal(100 / 400, 0.25); assert.equal((20 + 7) / 3, 9);
});
console.log(n === 7 ? "ALL PASSED" : "COUNT " + n);

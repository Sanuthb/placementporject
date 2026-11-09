import assert from "node:assert/strict";
import { achievementsSection, sortedAchievements, MAX_ACHIEVEMENTS } from "../../lib/achievements";
import { sectionSchemas, DEFAULT_REQUIRED_SECTIONS, OPTIONAL_SECTIONS } from "../../lib/verification";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const ok = { title: "Smart India Hackathon", category: "COMPETITION", level: "NATIONAL", date: "2025-03-14", position: "Winner" };
const bad = (data: unknown, msg: RegExp) => { const r = achievementsSection.safeParse(data); assert.equal(r.success, false); assert.match(JSON.stringify(r.error!.issues), msg); };

t("a complete achievement is accepted and empty optional fields are dropped", () => {
  const r = achievementsSection.parse({ achievements: [{ ...ok, issuer: "", link: "" }] });
  assert.equal(r.achievements[0].issuer, undefined); assert.equal(r.achievements[0].link, undefined);
});
t("the section is wired into section validation", () => { assert.equal(sectionSchemas.ACHIEVEMENTS.safeParse({ achievements: [ok] }).success, true); assert.equal(sectionSchemas.ACHIEVEMENTS.safeParse({ achievements: [{ title: "x" }] }).success, false); });
t("an empty section is valid (nothing to declare)", () => { assert.deepEqual(achievementsSection.parse({}).achievements, []); });
t("title, category and date are required", () => {
  bad({ achievements: [{ category: "SPORTS", date: "2024-01-01" }] }, /title/);
  bad({ achievements: [{ title: "Chess", date: "2024-01-01" }] }, /Choose a category/);
  bad({ achievements: [{ title: "Chess", category: "SPORTS" }] }, /date/);
});
t("an unknown category or level is refused", () => { bad({ achievements: [{ ...ok, category: "BRIBERY" }] }, /category/); bad({ achievements: [{ ...ok, level: "GALACTIC" }] }, /level/); });
t("a future date is refused", () => { bad({ achievements: [{ ...ok, date: "2999-01-01" }] }, /future/); });
t("a malformed date is refused", () => { bad({ achievements: [{ ...ok, date: "14/03/2025" }] }, /2025-03-14/); });
t("only http(s) links are accepted", () => { bad({ achievements: [{ ...ok, link: "javascript:alert(1)" }] }, /https/); assert.equal(achievementsSection.safeParse({ achievements: [{ ...ok, link: "https://sih.gov.in/r" }] }).success, true); });
t("the same title on the same date cannot be listed twice", () => { bad({ achievements: [ok, { ...ok, title: "smart india hackathon" }] }, /listed twice/); });
t(`at most ${MAX_ACHIEVEMENTS} achievements`, () => { bad({ achievements: Array.from({ length: MAX_ACHIEVEMENTS + 1 }, (_, i) => ({ ...ok, title: `Award ${i}` })) }, /At most/); });
t("resume and showcase get them newest first, and get nothing from invalid data", () => {
  assert.deepEqual(sortedAchievements({ achievements: [{ ...ok, title: "Old", date: "2020-01-01" }, ok] }).map((a) => a.title), ["Smart India Hackathon", "Old"]);
  assert.deepEqual(sortedAchievements({ achievements: "nope" }), []); assert.deepEqual(sortedAchievements(undefined), []);
});
t("achievements are optional by default, so existing verified students are not demoted", () => {
  assert.ok(OPTIONAL_SECTIONS.includes("ACHIEVEMENTS")); assert.ok(!DEFAULT_REQUIRED_SECTIONS.includes("ACHIEVEMENTS"));
  assert.deepEqual([...DEFAULT_REQUIRED_SECTIONS].sort(), ["ACADEMICS", "DOCUMENTS", "EDUCATION_HISTORY", "INTERNSHIPS", "PERSONAL", "PROJECTS", "RESUME", "SKILLS"]);
});
console.log(n === 12 ? "ALL PASSED" : "COUNT " + n);

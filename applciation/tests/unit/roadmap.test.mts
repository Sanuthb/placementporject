import assert from "node:assert/strict";
import { AUTO, LIBRARY, NO_SIGNALS, PHASES, autoUpdates, generateRoadmap, phaseOfSemester, progressOf, semestersOfPhase, yearOfSemester, type Signals } from "../../lib/roadmap";
import { suggestMilestones, suggestRoles } from "../../lib/roadmapSuggestions";
import type { Recommendation } from "../../lib/careerRecommendations";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const sig = (o: Partial<Signals> = {}): Signals => ({ ...NO_SIGNALS, ...o });

t("an 8-semester programme gives each of the four themes two semesters, in order", () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => phaseOfSemester(i + 1, 8)), ["DISCOVER", "DISCOVER", "BUILD", "BUILD", "SPECIALISE", "SPECIALISE", "PREPARE", "PREPARE"]);
});
t("a 4-semester programme (an MCA) gives each theme one semester", () => { assert.deepEqual(Array.from({ length: 4 }, (_, i) => phaseOfSemester(i + 1, 4)), ["DISCOVER", "BUILD", "SPECIALISE", "PREPARE"]); });
t("a 6-semester programme still covers all four themes in order", () => {
  const p = Array.from({ length: 6 }, (_, i) => phaseOfSemester(i + 1, 6)); assert.equal(p[0], "DISCOVER"); assert.equal(p[5], "PREPARE");
  assert.deepEqual([...new Set(p)], ["DISCOVER", "BUILD", "SPECIALISE", "PREPARE"].filter((x) => p.includes(x as never)));
  for (let i = 1; i < p.length; i++) assert.ok(PHASES.findIndex((x) => x.key === p[i]) >= PHASES.findIndex((x) => x.key === p[i - 1]));
});
t("very short programmes (2 semesters) still give every theme a semester to sit in", () => {
  for (const ph of PHASES) { const s = semestersOfPhase(ph.key, 2); assert.ok(s.length >= 1 && s.every((x) => x >= 1 && x <= 2), ph.key); }
  assert.equal(semestersOfPhase("DISCOVER", 1)[0], 1);
});
t("years: 8 semesters over 4 years is two semesters a year; 4 over 2 years likewise", () => { assert.equal(yearOfSemester(3, 8, 4), 2); assert.equal(yearOfSemester(8, 8, 4), 4); assert.equal(yearOfSemester(3, 4, 2), 2); assert.equal(yearOfSemester(1, 4, 2), 1); });
t("the library has unique keys, every phase is covered, and every auto rule exists", () => {
  assert.equal(new Set(LIBRARY.map((l) => l.key)).size, LIBRARY.length);
  for (const ph of PHASES) assert.ok(LIBRARY.filter((l) => l.phase === ph.key).length >= 5, ph.key);
  for (const l of LIBRARY) if (l.auto) assert.ok(AUTO[l.auto], l.key);
});
t("a generated roadmap places every milestone inside its theme's semesters, for any programme length", () => {
  for (const total of [1, 2, 3, 4, 6, 8, 10]) {
    const r = generateRoadmap(total); assert.equal(r.length, LIBRARY.length, `total ${total}`);
    for (const m of r) { assert.ok(m.semester >= 1 && m.semester <= total, `${m.key} sem ${m.semester} of ${total}`); assert.ok(semestersOfPhase(m.phase, total).includes(m.semester), m.key); }
  }
});
t("generation is deterministic and ordered by semester", () => {
  assert.deepEqual(generateRoadmap(4), generateRoadmap(4));
  const r = generateRoadmap(8); for (let i = 1; i < r.length; i++) assert.ok(r[i].semester >= r[i - 1].semester);
  assert.deepEqual(r.map((m) => m.sortOrder), r.map((_, i) => i));
});
t("early-phase items sit at the start of a phase and late ones at the end", () => {
  const r = generateRoadmap(8), by = (k: string) => r.find((m) => m.key === k)!;
  assert.equal(by("d-profile").semester, 1); assert.equal(by("d-role").semester, 2); assert.equal(by("p-apply").semester, 8); assert.equal(by("p-resume").semester, 7);
});
t("auto rules tick from signals", () => {
  assert.equal(AUTO.riasec.met(sig({ tests: ["riasec"] })), true); assert.equal(AUTO.riasec.met(sig()), false);
  assert.equal(AUTO.mock3.met(sig({ mockInterviews: 2 })), false); assert.equal(AUTO.mock3.met(sig({ mockInterviews: 3 })), true);
  assert.equal(AUTO.communication.met(sig({ tests: ["communication-writing"] })), true); assert.equal(AUTO.communication.met(sig({ categoriesTaken: ["COMMUNICATION"] })), true);
  assert.equal(AUTO.projects2.met(sig({ projectsListed: 1 })), false); assert.equal(AUTO.internship.met(sig({ internshipsCompleted: 1 })), true);
});
t("autoUpdates only returns open, auto-tracked, active milestones whose rule is met - and never reopens or touches skipped ones", () => {
  const ms = [
    { id: "a", auto: "riasec", status: "PLANNED" }, { id: "b", auto: "riasec", status: "DONE" }, { id: "c", auto: "riasec", status: "SKIPPED" },
    { id: "d", auto: null, status: "PLANNED" }, { id: "e", auto: "mock3", status: "PLANNED" }, { id: "f", auto: "riasec", status: "IN_PROGRESS" }, { id: "g", auto: "riasec", status: "PLANNED", archived: true },
  ];
  assert.deepEqual(autoUpdates(ms, sig({ tests: ["riasec"] })).map((m) => m.id).sort(), ["a", "f"]);
});
t("progress: percentage, per theme, overdue (earlier semesters not done) and the next three", () => {
  const ms = [
    { semester: 1, status: "DONE", phase: "DISCOVER" }, { semester: 1, status: "PLANNED", phase: "DISCOVER" }, { semester: 2, status: "PLANNED", phase: "BUILD" },
    { semester: 3, status: "PLANNED", phase: "BUILD" }, { semester: 4, status: "PLANNED", phase: "PREPARE" }, { semester: 4, status: "PLANNED", phase: "PREPARE" }, { semester: 2, status: "SKIPPED", phase: "BUILD" }, { semester: 3, status: "PLANNED", phase: "BUILD", archived: true },
  ];
  const p = progressOf(ms, 2);
  assert.equal(p.total, 6); assert.equal(p.done, 1); assert.equal(p.percent, 17); assert.equal(p.overdue.length, 1); assert.equal(p.onTrack, false); assert.deepEqual(p.next.map((m) => m.semester), [2, 3, 4]);
  assert.deepEqual(p.byPhase.find((x) => x.phase === "BUILD"), { phase: "BUILD", total: 2, done: 0 });
  assert.equal(progressOf([], 1).percent, 0); assert.equal(progressOf([{ semester: 1, status: "DONE" }], 3).onTrack, true);
});
const rec = (id: string, kind: Recommendation["kind"] = "improve"): Recommendation => ({ id, kind, area: "x", title: "t", why: `why ${id}`, action: `do ${id}`, href: null, priority: 1 });
t("suggestions: low skills become proposed milestones in the current semester, with the reason; strengths and tests-to-take do not", () => {
  const s = suggestMilestones([rec("improve:digital"), rec("strength:technical", "strength"), rec("take:communication", "take"), rec("improve:teamwork")], [], 2, 4);
  assert.deepEqual(s.map((x) => x.key), ["rec:improve:digital", "rec:improve:teamwork"]); assert.equal(s[0].semester, 2); assert.equal(s[0].why, "why improve:digital");
});
t("suggestions never repeat something already on the roadmap, and the semester stays inside the programme", () => {
  assert.deepEqual(suggestMilestones([rec("improve:digital")], ["rec:improve:digital"], 2, 4), []);
  assert.equal(suggestMilestones([rec("improve:digital")], [], 9, 4)[0].semester, 4); assert.equal(suggestMilestones([rec("improve:digital")], [], 0, 4)[0].semester, 1);
});
t("role suggestions: the student's own preferences first, then interest-based roles, no repeats, capped", () => {
  const r = suggestRoles({ riasecRanking: ["I", "S"], preferredRoles: ["Developer", "developer", "IT"] });
  assert.deepEqual(r.slice(0, 2).map((x) => x.role), ["Developer", "IT"]); assert.match(r[0].from, /preferred role/); assert.ok(r.some((x) => /Fits your Investigative/.test(x.from)));
  assert.equal(new Set(r.map((x) => x.role.toLowerCase())).size, r.length); assert.ok(r.length <= 12);
  assert.deepEqual(suggestRoles({ riasecRanking: null, preferredRoles: [] }), []);
});
console.log(n === 15 ? "ALL PASSED" : "COUNT " + n);

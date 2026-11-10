import assert from "node:assert/strict"
import { NEVER_SCORED, SCORED_CATEGORIES, bandOf, careerIndex, changesOf, combine, gateOf, improvementValue, jobReadiness, snapshotTrend, type CareerInput, type JobInput } from "../../lib/readiness"

// categories that describe preferences never count
for (const c of NEVER_SCORED) assert.ok(!(SCORED_CATEGORIES as readonly string[]).includes(c), c)

// combine: unmeasurable parts leave the total and lower coverage
const c = combine([{ key: "a", label: "A", weight: 50, value: 1, note: "", evidence: [] }, { key: "b", label: "B", weight: 50, value: null, note: "", evidence: [] }])
assert.equal(c.score, 100); assert.equal(c.coverage, 50)
assert.equal(combine([{ key: "a", label: "A", weight: 10, value: null, note: "", evidence: [] }]).score, 0)
assert.equal(combine([{ key: "a", label: "A", weight: 10, value: 5, note: "", evidence: [] }]).components[0].value, 1, "values are clamped")

assert.deepEqual([0, 29, 30, 49, 50, 69, 70, 84, 85, 100].map(bandOf), ["JUST_STARTING", "JUST_STARTING", "BUILDING", "BUILDING", "PROGRESSING", "PROGRESSING", "STRONG", "STRONG", "VERY_STRONG", "VERY_STRONG"])
assert.equal(improvementValue([]), null); assert.equal(improvementValue([0]), 0.5); assert.equal(improvementValue([20]), 1); assert.equal(improvementValue([-40]), 0)
assert.deepEqual(changesOf([{ percents: [40, 55, 70] }, { percents: [60] }, { percents: [80, 70] }]), [30, -10])

const full: CareerInput = { modules: { assessments: true, interviews: true }, profile: { verifiedPercent: 100 }, academics: { cgpa: 8, verified: true, activeBacklogs: 0 }, skills: { listed: 10, backed: 8 }, tests: [{ title: "Quant", percents: [60, 80] }], interviews: [{ score: 8 }], projects: 3, internships: 1, courses: 3, resources: 5 }
const f = careerIndex(full)
assert.ok(f.score >= 80 && f.score <= 95, `full profile scores high, got ${f.score}`); assert.equal(f.coverage, 100); assert.equal(f.confidence, "GOOD")
assert.ok(f.components.every((x) => x.note.length > 0) && f.disclaimer.includes("not a prediction"))
// nothing done: low score but evidence-poor areas read as zero, not hidden
const none = careerIndex({ ...full, profile: { verifiedPercent: 0 }, academics: { cgpa: null, verified: false, activeBacklogs: null }, skills: { listed: 0, backed: 0 }, tests: [], interviews: [], projects: 0, internships: 0, courses: 0, resources: 0 })
assert.equal(none.score, 0); assert.ok(none.nextSteps.length > 0)
// an unverified CGPA is not counted; modules not bought are left out and lower coverage
const unver = careerIndex({ ...full, academics: { cgpa: 9.5, verified: false, activeBacklogs: 0 } })
assert.equal(unver.components.find((x) => x.key === "academics")!.value, null)
const noMods = careerIndex({ ...full, modules: { assessments: false, interviews: false } })
assert.equal(noMods.components.find((x) => x.key === "assessments")!.value, null); assert.equal(noMods.coverage, 70)
// backlogs lower academics but never below the cap
assert.equal(careerIndex({ ...full, academics: { cgpa: 8, verified: true, activeBacklogs: 9 } }).components.find((x) => x.key === "academics")!.value, 0.5)
// improvement counts only with a retake
assert.equal(careerIndex({ ...full, tests: [{ title: "Quant", percents: [60] }] }).components.find((x) => x.key === "improvement")!.value, null)

const job: JobInput = { eligible: true, eligibilityReasons: [], mandatory: { status: "ALL_MET", met: 2, total: 2, missing: [] }, skills: { value: 0.6, matched: ["Java"], partial: [], missing: ["SQL"] }, tests: { linked: [{ title: "SDE test", percent: 70 }], general: [{ label: "Aptitude", percent: 20 }] }, interviews: { linked: [7], general: [3] }, projects: { value: 0.7, note: "2 projects" }, internship: { value: 0.5, note: "1 internship" }, prep: { suggested: 4, done: 2 }, improvement: [10], modules: { assessments: true, interviews: true } }
const j = jobReadiness(job)
assert.equal(j.gate, "ELIGIBLE"); assert.ok(j.score > 50 && j.score < 85)
assert.equal(j.components.find((x) => x.key === "tests")!.value, 0.7, "tests made for the job are used, not the general ones")
assert.equal(j.components.find((x) => x.key === "interviews")!.value, 0.7)
assert.ok(j.nextSteps.some((s) => s.includes("SQL")), "the next step names the missing skill")
// the gate is separate from the score
const bad = jobReadiness({ ...job, eligible: false, eligibilityReasons: ["CGPA below 7"], mandatory: { status: "UNMET", met: 1, total: 2, missing: ["Degree in CS"] } })
assert.equal(bad.gate, "NOT_ELIGIBLE"); assert.equal(bad.score, j.score, "eligibility does not change the score")
assert.ok(bad.explanation[0].startsWith("Not eligible") && bad.gateReasons.includes("CGPA below 7"))
assert.equal(gateOf({ eligible: true, mandatory: { status: "NEEDS_REVIEW", met: 1, total: 2, missing: [] } }), "NEEDS_REVIEW")
assert.equal(gateOf({ eligible: true, mandatory: { status: "NONE", met: 0, total: 0, missing: [] } }), "NO_CRITERIA")
// fallbacks: general results are used only when nothing is linked, and say so
const gen = jobReadiness({ ...job, tests: { linked: [], general: [{ label: "Aptitude", percent: 60 }] }, interviews: { linked: [], general: [6] } })
assert.equal(gen.components.find((x) => x.key === "tests")!.value, 0.6); assert.ok(gen.components.find((x) => x.key === "tests")!.note.includes("No test is linked"))
// no gaps means preparation is complete; no material for the gaps leaves it out
assert.equal(jobReadiness({ ...job, prep: { suggested: 0, done: 0 } }).components.find((x) => x.key === "prep")!.value, 1)
assert.equal(jobReadiness({ ...job, prep: null }).components.find((x) => x.key === "prep")!.value, null)

assert.deepEqual(snapshotTrend([{ day: "a", score: 40 }]), { sinceFirst: null, sincePrevious: null })
assert.deepEqual(snapshotTrend([{ day: "a", score: 40 }, { day: "b", score: 50 }, { day: "c", score: 47 }]), { sinceFirst: 7, sincePrevious: -3 })
console.log("readiness ok")

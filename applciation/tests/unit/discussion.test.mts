import assert from "node:assert/strict"
import { TOPICS, awaitingStudent, cleanEvaluation, compareSessions, contributionTarget, criteriaFor, deadlineOf, isExpired, nextSpeakers, participationStats, pickParticipants, suggestTopics, words, type Turn } from "../../lib/discussionEngine"

// topics: every kind and domain has some; suggestions rotate and never exceed what exists
for (const k of ["GD", "DEBATE", "PRESENTATION"] as const) for (const d of ["GENERAL", "TECHNOLOGY", "BUSINESS", "SOCIETY"] as const) assert.ok(TOPICS[k][d].length >= 2, `${k}/${d}`)
assert.equal(suggestTopics("GD", "TECHNOLOGY", 5).length, 3); assert.equal(suggestTopics("GD", null, 5).length, 5)
assert.notEqual(suggestTopics("GD", null, 3, 0)[0], suggestTopics("GD", null, 3, 1)[0]); assert.deepEqual(suggestTopics("GD", null, 3, -4), suggestTopics("GD", null, 3, 8))
// no divisive subjects in the curated bank
const all = JSON.stringify(TOPICS).toLowerCase(); for (const w of ["religio", "caste", "party", "election", "government"]) assert.ok(!all.includes(w), w)

// participants
assert.equal(pickParticipants("GD", 3).length, 3); assert.equal(pickParticipants("GD", 9).length, 4); assert.equal(pickParticipants("GD", 0).length, 2)
assert.equal(pickParticipants("DEBATE").length, 1); assert.equal(pickParticipants("PRESENTATION").length, 1)
assert.equal(new Set(pickParticipants("GD", 4).map((p) => p.name)).size, 4)

// length and time
assert.equal(contributionTarget("GD", 5), 3); assert.equal(contributionTarget("GD", 15), 5); assert.equal(contributionTarget("GD", 60), 8); assert.equal(contributionTarget("PRESENTATION", 10), 3)
const t0 = new Date("2026-01-01T10:00:00Z")
assert.equal(deadlineOf(t0, 10).toISOString(), "2026-01-01T10:12:00.000Z"); assert.equal(isExpired(t0, 10, new Date("2026-01-01T10:12:01Z")), true); assert.equal(isExpired(t0, 10, new Date("2026-01-01T10:11:59Z")), false)

// whose turn
const ps = pickParticipants("GD", 3)
const turns: Turn[] = [{ role: "ai", speaker: "Priya", text: "Opening point here" }]
assert.equal(awaitingStudent(turns), true); assert.equal(awaitingStudent([...turns, { role: "student", speaker: "You", text: "My view" }]), false)
// speakers: never the one who just spoke; least recent first; debate keeps its opponent
assert.deepEqual(nextSpeakers(turns, ps).map((p) => p.name), ["Arjun", "Meera"])
const t2: Turn[] = [...turns, { role: "student", speaker: "You", text: "x" }, { role: "ai", speaker: "Arjun", text: "y" }, { role: "ai", speaker: "Meera", text: "z" }]
assert.deepEqual(nextSpeakers(t2, ps).map((p) => p.name), ["Priya", "Arjun"]); assert.ok(!nextSpeakers(t2, ps).some((p) => p.name === "Meera"))
assert.equal(nextSpeakers(turns, pickParticipants("DEBATE")).length, 1); assert.equal(nextSpeakers(turns, ps, 1).length, 1)

// participation facts are counted
assert.equal(words("  one two  three "), 3); assert.equal(words(""), 0)
const st = participationStats([{ role: "ai", speaker: "Priya", text: "a b c d e f g h i j" }, { role: "student", speaker: "You", text: "one two three four five", voice: true }, { role: "student", speaker: "You", text: "six seven" }])
assert.deepEqual(st, { contributions: 2, studentWords: 7, aiWords: 10, sharePercent: 41, averageWords: 4, shortest: 2, longest: 5, spokenContributions: 1 })
assert.equal(participationStats([]).sharePercent, 0)

// evaluation cleaning is per kind
assert.ok(criteriaFor("PRESENTATION").includes("questions") && !criteriaFor("PRESENTATION").includes("listening") && criteriaFor("GD").includes("listening") && !criteriaFor("GD").includes("questions"))
const ev = cleanEvaluation({ summary: " ok ", score: 9, categories: [{ key: "clarity", score: 4, comment: "c" }, { key: "clarity", score: 9 }, { key: "questions", score: 8 }, { key: "bogus", score: 8 }, { key: "listening", score: 6 }, { key: "language", score: 0 }], strengths: ["a", 1], improvements: "x", perContribution: [{ excerpt: "e", comment: "c", better: "b" }, { no: 1 }], missedPoints: ["p"], practice: ["q"] }, "GD")!
assert.deepEqual(ev.categories.map((c) => [c.key, c.score]), [["clarity", 4], ["listening", 6]], "only this kind's categories, once each, scored 1-10")
assert.equal(ev.score, 5, "an overall score more than a point from the mean is replaced by it"); assert.deepEqual(ev.strengths, ["a"]); assert.equal(ev.perContribution.length, 1)
assert.equal(cleanEvaluation({ categories: [{ key: "questions", score: 7 }] }, "PRESENTATION")!.score, 7)
assert.equal(cleanEvaluation(null, "GD"), null); assert.equal(cleanEvaluation({ summary: "x" }, "GD"), null)

const prev = { score: 5, categories: [{ key: "clarity", label: "Clarity of expression", score: 4, comment: "" }, { key: "listening", label: "Listening and response", score: 7, comment: "" }] }
const cur = { score: 6, categories: [{ key: "clarity", label: "Clarity of expression", score: 6, comment: "" }, { key: "listening", label: "Listening and response", score: 5, comment: "" }, { key: "language", label: "Language and vocabulary", score: 8, comment: "" }] }
const c = compareSessions(cur, prev)!
assert.equal(c.overallChange, 1); assert.deepEqual(c.improved, ["Clarity of expression"]); assert.deepEqual(c.slipped, ["Listening and response"]); assert.equal(compareSessions(cur, null), null)
console.log("discussion ok")

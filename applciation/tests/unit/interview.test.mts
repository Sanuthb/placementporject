import assert from "node:assert/strict"
import { answeredCount, askedCount, assignedTo, awaitingAnswer, cleanFeedback, compareInterviews, conversation, currentQuestion, deadlineOf, isExpired, jdBrief, questionCountFor, weakCategories, type Turn } from "../../lib/interviewEngine"

// duration -> number of questions
assert.equal(questionCountFor(10), 3); assert.equal(questionCountFor(20), 5); assert.equal(questionCountFor(45), 10); assert.equal(questionCountFor(5), 3)

// timing: only assessment mode expires, with two minutes' grace
const t0 = new Date("2026-01-01T10:00:00Z")
assert.equal(deadlineOf(t0, 20).toISOString(), "2026-01-01T10:22:00.000Z")
assert.equal(isExpired("ASSESSMENT", t0, 20, new Date("2026-01-01T10:21:59Z")), false)
assert.equal(isExpired("ASSESSMENT", t0, 20, new Date("2026-01-01T10:22:01Z")), true)
assert.equal(isExpired("LEARNING", t0, 20, new Date("2026-01-01T12:00:00Z")), false)

// coach notes are not part of the conversation and never block the next answer
const turns: Turn[] = [{ role: "interviewer", text: "Q1" }, { role: "student", text: "A1" }, { role: "coach", text: "tip", kind: "improve" }, { role: "interviewer", text: "Q2" }]
assert.equal(conversation(turns).length, 3); assert.equal(askedCount(turns), 2); assert.equal(answeredCount(turns), 1)
assert.equal(awaitingAnswer(turns), true); assert.equal(currentQuestion(turns), "Q2")
assert.equal(awaitingAnswer([...turns, { role: "student", text: "A2" }]), false)
assert.equal(awaitingAnswer([...turns, { role: "student", text: "A2" }, { role: "coach", text: "x" }]), false)

// feedback cleaning
const f = cleanFeedback({ summary: " ok ", score: 9, categories: [{ key: "clarity", score: 4, comment: "c" }, { key: "clarity", score: 9 }, { key: "made_up", score: 8 }, { key: "relevance", score: 0 }, { key: "communication", score: 15 }], strengths: ["a", 3, ""], improvements: "no", perAnswer: [{ question: "q", comment: "c" }, { nope: 1 }] })!
assert.deepEqual(f.categories.map((c) => [c.key, c.score]), [["clarity", 4], ["communication", 10]])
assert.equal(f.score, 7, "a score more than a point from the category mean is replaced by the mean")
assert.deepEqual(f.strengths, ["a"]); assert.deepEqual(f.improvements, []); assert.equal(f.perAnswer.length, 1)
assert.equal(cleanFeedback({ score: 6.4 })!.score, 6); assert.equal(cleanFeedback({ summary: "x" }), null); assert.equal(cleanFeedback(null), null)
assert.equal(cleanFeedback({ score: 99 })!.score, 10)

// comparison and weak categories
const prev = { score: 5, categories: [{ key: "clarity", label: "Clarity", score: 4, comment: "" }, { key: "structure", label: "Answer structure", score: 7, comment: "" }] }
const cur = { score: 7, categories: [{ key: "clarity", label: "Clarity", score: 6, comment: "" }, { key: "structure", label: "Answer structure", score: 6, comment: "" }, { key: "examples", label: "Practical examples", score: 3, comment: "" }] }
const cmp = compareInterviews(cur, prev)!
assert.equal(cmp.overallChange, 2); assert.deepEqual(cmp.improved, ["Clarity"]); assert.deepEqual(cmp.slipped, ["Answer structure"]); assert.equal(cmp.categories.length, 2)
assert.equal(compareInterviews(cur, null), null)
assert.deepEqual(weakCategories(cur).map((c) => c.key), ["examples"])

// who an assignment is for
const me = { studentId: "s1", departmentId: "d1", batchId: "b1" }
assert.equal(assignedTo({ targetStudentIds: [], targetDepartmentIds: [], targetBatchIds: [] }, me), true)
assert.equal(assignedTo({ targetStudentIds: [], targetDepartmentIds: ["d2"], targetBatchIds: [] }, me), false)
assert.equal(assignedTo({ targetStudentIds: ["s1"], targetDepartmentIds: ["d2"], targetBatchIds: [] }, me), true)
assert.equal(assignedTo({ targetStudentIds: ["s2"], targetDepartmentIds: [], targetBatchIds: [] }, me), false)

// job brief
const b = jdBrief({ title: "SDE", companyName: "Acme", data: { requirements: [{ text: "Java", level: "MANDATORY" }, { text: "Docker", level: "PREFERRED" }], description: "Build things" } })
assert.ok(b.includes("Must have: Java") && b.includes("Good to have: Docker") && b.includes("Acme"))
assert.equal(jdBrief({ title: "T", companyName: "C", data: null }), "Job: T at C")
console.log("interview ok")

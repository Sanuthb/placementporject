import assert from "node:assert/strict"
import { discussionDoc, cohortDoc, cohortTopics, interviewDoc, performanceDoc, testDoc } from "../../lib/reportBuilders"
import { renderDocx, renderPdf, latin1, safeName, type Block } from "../../lib/reportDoc"

const student = { name: "Asha Rao", enrollmentNo: "21CS001", department: "CSE", batch: "2025" }
const q = { id: "q1", type: "SINGLE" as const, text: "What is 2+2?", context: null, options: ["3", "4"], correct: [1], acceptedAnswers: [], modelAnswer: null, mine: [0], status: "WRONG", awarded: 0, max: 1, explanation: "Basic sum", comment: null, markedBy: null }
const open = { ...q, id: "q2", type: "DESCRIPTIVE" as const, text: "Explain ACID", options: [], correct: [], mine: "my answer", status: "CORRECT", awarded: 2, max: 2, modelAnswer: "model", explanation: null, comment: "Good", markedBy: "AI" }
const base = { college: "Demo College", student, test: { title: "Quant 1", category: "APTITUDE", kind: "Quantitative aptitude", practice: false, jobTitle: "SDE at Acme", attemptNumber: 2, submittedAt: new Date("2026-02-01"), durationMin: 30 },
  report: { score: 2, max: 3, percent: 66.7, provisional: false, pending: 0, passed: true, passPercent: 50, failedSections: [], accuracy: { correct: 1, wrong: 1, partial: 0, skipped: 0, attempted: 2 }, time: { seconds: 125, perQuestionSeconds: 62 }, sections: [{ label: "Quant", score: 2, max: 3, percent: 66.7, cutoff: 60, passed: true }], topics: [{ topic: "Sums", correct: 1, total: 2, percent: 50 }], weakTopics: [{ topic: "Sums", percent: 50 }], questions: [q, open] },
  comparison: { overallChange: 10, improved: ["Sums"], slipped: [] }, plan: { materials: [{ topic: "Sums", resources: [{ title: "Sums notes" }], courses: [] }], uncovered: [], exercises: { available: 4, topics: ["Sums"] }, reassessAt: "2026-02-20", nextTest: null } }

const kinds = (blocks: Block[]) => blocks.map((b) => b.t)
const t = testDoc(base)
assert.ok(t.blocks.some((b) => b.t === "h" && b.text === "Recommended materials") && t.blocks.some((b) => b.t === "h" && b.text === "Improvement plan"))
// student's answers and AI comments are kept apart
const resp = t.blocks.filter((b): b is Extract<Block, { t: "response" }> => b.t === "response")
assert.ok(resp.find((r) => r.label === "Answer given" && r.text === "3" && r.source === "STUDENT"), "choice answers are shown as option text")
assert.ok(resp.find((r) => r.label === "Answer given" && r.text === "my answer" && r.source === "STUDENT"))
assert.ok(resp.find((r) => r.label === "Marker's comment" && r.source === "AI"))
assert.ok(resp.find((r) => r.label === "Correct answer" && r.text === "4" && r.source === "STAFF"))
assert.ok(resp.find((r) => r.label === "Model answer" && r.text === "model"))
// a report whose answers are hidden says so and carries none
const hidden = testDoc({ ...base, report: { ...base.report, questions: null }, plan: null })
assert.ok(!hidden.blocks.some((b) => b.t === "response") && JSON.stringify(hidden.blocks).includes("not part of this report"))
const prov = testDoc({ ...base, report: { ...base.report, provisional: true, passed: null } })
assert.ok(JSON.stringify(prov.blocks).includes("Provisional"))

const turns = [{ role: "interviewer" as const, text: "Tell me about yourself" }, { role: "student" as const, text: "I am Asha", voice: true }, { role: "coach" as const, text: "Add a project", kind: "improve" as const }]
const fb = { summary: "Good", score: 7, categories: [{ key: "clarity", label: "Clarity", score: 7, comment: "ok" }], strengths: ["calm"], improvements: ["examples"], technicalFeedback: "tech", perAnswer: [{ question: "Tell me about yourself", comment: "short", suggested: "I am Asha, a CSE student..." }], practice: ["Mock again"] }
const iv = interviewDoc({ college: "Demo College", student, interview: { role: "SDE", type: "HR", mode: "LEARNING", difficulty: "MEDIUM", language: "English", durationMin: 20, startedAt: new Date("2026-02-01T10:00:00Z"), completedAt: new Date("2026-02-01T10:12:00Z"), jobTitle: null }, transcript: turns, feedback: fb, comparison: { overallChange: 1, improved: ["Clarity"], slipped: [], categories: [] } })
const ir = iv.blocks.filter((b): b is Extract<Block, { t: "response" }> => b.t === "response")
assert.ok(ir.find((r) => r.label.startsWith("Answer 1") && r.label.includes("spoken") && r.source === "STUDENT"))
assert.ok(ir.find((r) => r.label === "Question 1" && r.source === "AI") && ir.find((r) => r.label.startsWith("Coach") && r.source === "AI"))
assert.ok(JSON.stringify(iv.blocks).includes("12 min 0 s") && JSON.stringify(iv.blocks).includes("Suggested answer improvements"))
const unfinished = interviewDoc({ college: "C", student, interview: { role: "SDE", type: "HR", mode: "LEARNING", difficulty: "EASY", language: "English", durationMin: 10, startedAt: new Date(), completedAt: null, jobTitle: null }, transcript: [], feedback: null, comparison: null })
assert.ok(JSON.stringify(unfinished.blocks).includes("not finished"))

// cohort topics: a student counts once per topic
const topics = cohortTopics([[{ topic: "A", percent: 20 }, { topic: "A", percent: 40 }, { topic: "B", percent: 90 }], [{ topic: "A", percent: 60 }]])
assert.deepEqual(topics, [{ topic: "A", averagePercent: 45, students: 2 }, { topic: "B", averagePercent: 90, students: 1 }])
assert.deepEqual(cohortTopics([[{ topic: "A", percent: 20 }], [{ topic: "A", percent: 40 }, { topic: "B", percent: 10 }]], 2).map((x) => x.topic), ["A"])
const co = cohortDoc({ college: "C", scope: "CSE 2025", generatedFor: "TPO", students: [{ name: "A", enrollmentNo: "1", testsTaken: 2, averagePercent: 60, interviews: 0, averageInterview: null }, { name: "B", enrollmentNo: "2", testsTaken: 0, averagePercent: null, interviews: 1, averageInterview: 8 }], topics })
assert.ok(JSON.stringify(co.blocks).includes("1 of 2"))
const pf = performanceDoc({ college: "C", student, viewer: "STAFF", tests: [], interviews: [], weakTopics: [] })
assert.ok(JSON.stringify(pf.blocks).includes("private") && !kinds(pf.blocks).includes("list"))

// rendering produces real files
const pdf = await renderPdf(t), docx = await renderDocx(t), pdf2 = await renderPdf(iv)
assert.equal(pdf.subarray(0, 4).toString(), "%PDF"); assert.equal(docx.subarray(0, 2).toString(), "PK"); assert.equal(pdf2.subarray(0, 4).toString(), "%PDF")
const long = { ...t, blocks: [...t.blocks, ...Array.from({ length: 80 }, (_, i) => ({ t: "p", text: `line ${i} ` + "word ".repeat(60) }) as Block), { t: "p", text: "x".repeat(400) } as Block] }
assert.equal((await renderPdf(long)).subarray(0, 4).toString(), "%PDF", "long text and unbroken strings paginate")
assert.equal(latin1("a–b “q” हिंदी"), 'a-b "q" ?????'.replace("?????", latin1("हिंदी")))
assert.equal(safeName("Asha Rao / Quant #1"), "asha-rao-quant-1")

// group discussion report: student words and AI participants are labelled apart, and measured facts are counted
const dtx = [{ role: "ai" as const, speaker: "Priya", text: "Remote work helps focus." }, { role: "student" as const, speaker: "You", text: "I disagree because teams need contact", voice: true }, { role: "ai" as const, speaker: "Arjun", text: "What evidence do you have?" }]
const dd = discussionDoc({ college: "C", student, session: { kind: "GD", topic: "Remote work", stance: null, difficulty: "MEDIUM", language: "English", durationMin: 10, startedAt: new Date("2026-02-01T10:00:00Z"), completedAt: new Date("2026-02-01T10:09:00Z"), participants: [{ name: "Priya" }, { name: "Arjun" }] }, transcript: dtx, evaluation: { summary: "Fair", score: 6, categories: [{ key: "listening", label: "Listening and response", score: 6, comment: "ok" }], strengths: ["clear"], improvements: ["evidence"], perContribution: [{ excerpt: "teams need contact", comment: "vague", better: "Cite a study" }], missedPoints: ["cost"], practice: ["Use data"] }, comparison: null })
const dr = dd.blocks.filter((b): b is Extract<Block, { t: "response" }> => b.t === "response")
assert.ok(dr.find((r) => r.source === "STUDENT" && r.label.includes("spoken")) && dr.filter((r) => r.source === "AI").length >= 3, "AI turns and suggested versions are labelled AI")
assert.ok(JSON.stringify(dd.blocks).includes("counted, not judged") && JSON.stringify(dd.blocks).includes("Improvement recommendations") && JSON.stringify(dd.blocks).includes("9 min 0 s"))
assert.equal((await renderPdf(dd)).subarray(0, 4).toString(), "%PDF"); assert.equal((await renderDocx(dd)).subarray(0, 2).toString(), "PK")
console.log("reports ok")

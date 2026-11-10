import assert from "node:assert/strict";
import { buildReport, canSee, compareAttempts, markQuestion, nextTest, pickExercises, reassessDate, recommendMaterials, scoreAttempt, sectionOf, shapeReport, topicsOf, typeOf, visibilityOf, type PaperQuestion } from "../../lib/mockTest";

const q = (id: string, o: Partial<PaperQuestion> = {}): PaperQuestion => ({ id, text: `Q ${id}`, options: ["a", "b", "c", "d"], correct: [1], marks: 2, negativeMarks: 0.5, ...o });

// types
assert.equal(typeOf(q("1")), "SINGLE");
assert.equal(typeOf(q("1", { correct: [0, 2] })), "MULTIPLE", "an older question with two right answers is multiple choice");
assert.equal(typeOf(q("1", { type: "TRUE_FALSE", options: ["True", "False"], correct: [0] })), "TRUE_FALSE");
assert.equal(typeOf(q("1", { type: "CHOICE" })), "SINGLE");

// marking: choice
assert.deepEqual(markQuestion(q("1"), [1]), { awarded: 2, status: "CORRECT" });
assert.deepEqual(markQuestion(q("1"), [0]), { awarded: -0.5, status: "WRONG" });
assert.deepEqual(markQuestion(q("1"), []), { awarded: 0, status: "SKIPPED" }, "skipping costs nothing");
assert.equal(markQuestion(q("1"), undefined).status, "SKIPPED");
assert.equal(markQuestion(q("1", { correct: [0, 2] }), [2, 0]).status, "CORRECT", "order does not matter");
assert.equal(markQuestion(q("1", { correct: [0, 2] }), [0]).status, "WRONG", "multiple choice is all or nothing");
assert.equal(markQuestion(q("1", { type: "TRUE_FALSE", options: ["True", "False"], correct: [1] }), [1]).status, "CORRECT");
// fill in the blank
const fb = q("f", { type: "FILL_BLANK", options: [], correct: [], acceptedAnswers: ["Paris", "the city of Paris", "3.0"] });
assert.equal(markQuestion(fb, "  paris. ").status, "CORRECT", "case, spacing and a trailing full stop do not matter");
assert.equal(markQuestion(fb, "Lyon").status, "WRONG");
assert.equal(markQuestion(fb, "3").status, "CORRECT", "numbers are compared as numbers");
assert.equal(markQuestion(fb, "   ").status, "SKIPPED");
// open answers wait for a mark
const ds = q("d", { type: "DESCRIPTIVE", marks: 5, options: [], correct: [] });
assert.equal(markQuestion(ds, "My answer").status, "PENDING");
assert.deepEqual(markQuestion(ds, "My answer", { awarded: 4, by: "AI" }), { awarded: 4, status: "PARTIAL" });
assert.equal(markQuestion(ds, "My answer", { awarded: 9, by: "STAFF" }).awarded, 5, "a mark cannot exceed the question's marks");
assert.equal(markQuestion(ds, "My answer", { awarded: -3, by: "STAFF" }).awarded, 0);
assert.equal(markQuestion(ds, "My answer", { awarded: 2.3, by: "STAFF" }).awarded, 2.5, "marks are in halves");
assert.equal(markQuestion(ds, undefined).status, "SKIPPED");

// attempt: +2, -0.5, -1, and one open answer waiting
const qs = [q("1"), q("2"), q("3", { marks: 1, negativeMarks: 1 }), ds];
const s = scoreAttempt(qs, { "1": [1], "2": [0], "3": [2], d: "text" });
assert.deepEqual([s.score, s.max, s.pending, s.pendingMax], [0.5, 10, 1, 5]);
assert.equal(scoreAttempt([q("1", { negativeMarks: 5 })], { "1": [0] }).score, 0, "the total never goes below zero");
assert.equal(scoreAttempt(qs, { "1": [1], "2": [1], "3": [1], d: "text" }, { d: { awarded: 4, by: "STAFF" } }).score, 9, "marked open answers are added in");

// sections and topics
assert.equal(sectionOf({ tags: ["SQL", "joins"] }), "sql");
assert.equal(sectionOf({ section: "logical", tags: ["sql"] }), "logical", "an explicit section wins");
assert.equal(sectionOf({ tags: ["misc"] }), "general");
assert.deepEqual(topicsOf({ tags: ["SQL", "joins"] }), ["joins"], "a section name is not a topic");
assert.deepEqual(topicsOf({ tags: ["sql"] }), ["SQL"], "with no topic, the section stands in");
assert.deepEqual(topicsOf({ tags: [] }), ["General"]);

// the report: six questions of 2 marks; a, b, c, f right; d, e wrong (-0.5 each): 8 - 1 = 7 of 12
const t0 = new Date("2026-12-01T10:00:00Z"), t1 = new Date("2026-12-01T10:30:00Z");
const rq = [
  q("a", { tags: ["quantitative", "percentages"] }), q("b", { tags: ["quantitative", "percentages"] }), q("c", { tags: ["quantitative", "ratios"] }),
  q("d", { tags: ["sql", "joins"] }), q("e", { tags: ["sql", "joins"] }), q("f", { tags: ["sql", "joins"] }),
];
const ans = { a: [1], b: [1], c: [1], d: [0], e: [0], f: [1] };
const rep = buildReport({ qs: rq, answers: ans, startedAt: t0, submittedAt: t1, passPercent: 50, sectionCutoffs: { sql: 50 } });
assert.deepEqual([rep.score, rep.max, rep.percent], [7, 12, 58.3]);
assert.deepEqual([rep.accuracy.correct, rep.accuracy.wrong, rep.accuracy.skipped, rep.accuracy.percent], [4, 2, 0, 67]);
assert.deepEqual([rep.time.seconds, rep.time.perQuestionSeconds], [1800, 300]);
const sec = Object.fromEntries(rep.sections.map((x) => [x.key, x]));
assert.deepEqual([sec.quantitative.percent, sec.sql.percent, sec.sql.score], [100, 16.7, 1], "a section's marks include its negative marking");
assert.equal(sec.sql.passed, false, "the SQL section is below its own cut-off");
assert.equal(rep.passed, false, "above the overall pass mark, but a section cut-off was missed");
assert.deepEqual(rep.failedSections, ["SQL"]);
assert.deepEqual(rep.topics.map((t) => [t.topic, t.percent]), [["joins", 33], ["percentages", 100], ["ratios", 100]]);
assert.deepEqual(rep.weakTopics.map((t) => t.topic), ["joins"]);
assert.equal(buildReport({ qs: rq, answers: ans, startedAt: t0, submittedAt: t1, passPercent: 50 }).passed, true, "without cut-offs, the overall mark decides");
assert.equal(buildReport({ qs: rq, answers: ans, startedAt: t0, submittedAt: t1, passPercent: null }).passed, null, "no criteria, no verdict");
assert.equal(rep.questions[0].mine?.toString(), "1");
const withOpen = buildReport({ qs: [...rq, ds], answers: { ...ans, d: "my text" }, startedAt: t0, submittedAt: t1, passPercent: 50 });
assert.deepEqual([withOpen.provisional, withOpen.pending, withOpen.passed], [true, 1, null], "while an answer awaits marking the result is provisional and there is no verdict");
assert.deepEqual(buildReport({ qs: [q("x", { tags: ["a"] }), q("y", { tags: ["b"] })], answers: { x: [0], y: [1] }, startedAt: t0, submittedAt: t1, passPercent: null }).weakTopics.map((t) => t.topic), ["a"], "with one question per topic, a wrong one still counts");
assert.deepEqual(buildReport({ qs: rq.slice(0, 3), answers: {}, startedAt: t0, submittedAt: null, passPercent: null }).time.seconds, null);

// what the student may see
assert.equal(visibilityOf(null, true), "IMMEDIATE");
assert.equal(visibilityOf(null, false), "SCORE_ONLY", "a real test keeps showing only the score, as before");
assert.equal(visibilityOf("ANALYSIS", true), "ANALYSIS");
assert.equal(visibilityOf("nonsense", false), "SCORE_ONLY");
const now = new Date("2026-12-02T00:00:00Z"), ends = new Date("2026-12-03T00:00:00Z");
assert.deepEqual(canSee("AFTER_END", now, ends), { analysis: true, answers: false });
assert.deepEqual(canSee("AFTER_END", new Date("2026-12-04T00:00:00Z"), ends), { analysis: true, answers: true });
const so = shapeReport(rep, "SCORE_ONLY", now, ends);
assert.deepEqual([so.sections.length, so.topics.length, so.questions, so.accuracy], [0, 0, null, null], "hidden parts never leave the server");
assert.equal(so.score, 7);
assert.ok(shapeReport(rep, "ANALYSIS", now, ends).topics.length > 0 && shapeReport(rep, "ANALYSIS", now, ends).questions === null);
assert.ok(shapeReport(rep, "IMMEDIATE", now, ends).questions!.length === 6);
assert.deepEqual(shapeReport(rep, "AFTER_END", now, ends).answersAvailableAt, ends);

// targeted exercises
const cand = (id: string, tags: string[], difficulty: string | null = "MEDIUM", o: object = {}) => ({ id, text: id, tags, difficulty, ...o });
const pool = [cand("j1", ["joins"], "HARD"), cand("j2", ["joins"], "EASY"), cand("j3", ["joins"], "MEDIUM"), cand("j4", ["joins"], "EASY"), cand("r1", ["ratios"]), cand("seen", ["joins"], "EASY"), cand("d1", ["joins"], "EASY", { type: "DESCRIPTIVE" })];
const ex = pickExercises(pool, [{ topic: "joins", percent: 20 }], new Set(["seen"]), { per: 3 });
assert.deepEqual(ex.map((x) => x.id), ["j2", "j4", "j3"], "easy first for a very weak topic; seen questions and descriptive ones are left out");
const ex2 = pickExercises(pool, [{ topic: "joins", percent: 50 }], new Set(), { per: 2 });
assert.equal(ex2[0].difficulty, "MEDIUM", "a topic at 40-59% starts at medium");
assert.deepEqual(pickExercises(pool, [{ topic: "ratios", percent: 10 }, { topic: "joins", percent: 30 }], new Set(), { per: 1, total: 1 }).map((x) => x.id), ["r1"], "the weakest topic first, and never more than the total");
assert.deepEqual(pickExercises(pool, [{ topic: "unknown", percent: 0 }], new Set()), []);

// materials
const rm = recommendMaterials([{ topic: "joins" }, { topic: "ratios" }], [{ id: "r1", title: "SQL joins explained", terms: ["sql"] }, { id: "r2", title: "Reasoning", terms: ["ratios"] }], [{ id: "c1", title: "Databases", terms: ["joins", "sql"] }]);
assert.deepEqual([rm[0].resources.map((x) => x.id), rm[0].courses.map((x) => x.id), rm[1].resources.map((x) => x.id), rm[1].courses.length], [["r1"], ["c1"], ["r2"], 0]);

// reassessment and comparison
assert.equal(reassessDate(1, new Date("2026-12-01T10:00:00Z")).toISOString().slice(0, 10), "2026-12-04");
assert.equal(reassessDate(3, new Date("2026-12-01T10:00:00Z")).toISOString().slice(0, 10), "2026-12-08");
assert.equal(reassessDate(40, new Date("2026-12-01T10:00:00Z")).toISOString().slice(0, 10), "2026-12-15", "never more than two weeks");
assert.equal(reassessDate(1, new Date("2026-12-01T10:00:00Z"), 10).toISOString().slice(0, 10), "2026-12-11", "the retake rule's waiting time is respected");
const cmp = compareAttempts({ percent: 70, topics: [{ topic: "joins", correct: 3, total: 4, percent: 75 }, { topic: "ratios", correct: 1, total: 4, percent: 25 }] }, { percent: 55, topics: [{ topic: "joins", correct: 1, total: 4, percent: 25 }, { topic: "ratios", correct: 3, total: 4, percent: 75 }, { topic: "gone", correct: 1, total: 1, percent: 100 }] });
assert.deepEqual([cmp!.overallChange, cmp!.improved, cmp!.slipped], [15, ["joins"], ["ratios"]]);
assert.equal(compareAttempts({ percent: 70, topics: [] }, null), null);

// next test
const day = (n: number) => new Date(Date.UTC(2026, 11, n));
const opt = (id: string, cat: string, start: number, o: object = {}) => ({ id, title: id, category: cat, startsAt: day(start), endsAt: day(start + 5), taken: false, isPractice: false, kind: null as string | null, ...o });
const nt = nextTest({ category: "APTITUDE", scheduleId: "cur" }, [opt("cur", "APTITUDE", 1), opt("p", "APTITUDE", 3, { isPractice: true }), opt("t2", "APTITUDE", 4), opt("other", "TECHNICAL", 2), opt("done", "APTITUDE", 2, { taken: true }), opt("old", "APTITUDE", -20)], day(2));
assert.equal(nt!.id, "t2", "a real test in the same category that is not taken or over, before a practice one");
assert.equal(nextTest({ category: "APTITUDE", scheduleId: "cur" }, [opt("other", "TECHNICAL", 2)], day(2)), null);
assert.equal(nextTest({ category: "OTHER", kind: "SQL", scheduleId: "cur" }, [opt("sq", "TECHNICAL", 2, { kind: "SQL" })], day(2))!.id, "sq", "a test of the same kind counts even in another category");
console.log("mocktest ok");

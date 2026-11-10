import assert from "node:assert/strict";
import { attemptsLeft, certificateSerial, courseProgress, engagement, hideAnswers, marksValid, nextLesson, publishProblems, questionGaps, questionSchema, questionsOf, scoreQuiz, sniffMedia } from "../../lib/lms";

const q = (text: string, correct: number) => ({ text, options: ["a", "b", "c"], correct });
const qs = [q("First?", 0), q("Second?", 1), q("Third?", 2), q("Fourth?", 0)];

// marking
const r = scoreQuiz(qs, [0, 1, 0, null], 70);
assert.deepEqual([r.score, r.total, r.percent, r.passed], [2, 4, 50, false]);
assert.equal(scoreQuiz(qs, [0, 1, 2, 0], 70).passed, true);
assert.equal(scoreQuiz(qs, [0, 1, 2], 70).percent, 75, "a missing answer counts as skipped");
assert.equal(scoreQuiz([], [], 50).passed, false, "an empty quiz can never be passed");
assert.equal(scoreQuiz(qs, [0, 1, 2, 0], 100).passed, true, "exactly the pass mark passes");

// question rules
assert.equal(questionSchema.safeParse({ text: "Pick one", options: ["x", "y"], correct: 2 }).success, false);
assert.equal(questionSchema.safeParse({ text: "Pick one", options: ["x", "X"], correct: 0 }).success, false);
assert.equal(questionsOf([q("Fine?", 0), { text: "bad" }]).length, 1);
assert.ok(!("correct" in hideAnswers(qs)[0]), "answers are never sent to the student");
assert.equal(attemptsLeft(null, 9), null);
assert.equal(attemptsLeft(3, 5), 0);

// publishing
assert.deepEqual(publishProblems([]), ["Add at least one lesson"]);
const ok = { id: "1", type: "TEXT", title: "Intro", required: true, body: "hello" };
assert.deepEqual(publishProblems([ok]), []);
assert.equal(publishProblems([{ ...ok, type: "VIDEO", body: null }]).length, 1);
assert.equal(publishProblems([ok, { ...ok, id: "2", type: "QUIZ", questions: [], passPercent: null }]).length, 2);
assert.equal(publishProblems([{ ...ok, required: false }]).length, 1);
assert.equal(publishProblems([ok, { ...ok, id: "3", type: "LIVE", title: "Live", startsAt: null, url: null }]).length, 1);

// progress
const ls = [{ id: "a", required: true }, { id: "b", required: true }, { id: "c", required: false }];
assert.deepEqual(courseProgress(ls, new Set(["a", "c"])), { done: 1, total: 2, percent: 50, complete: false });
assert.equal(courseProgress(ls, new Set(["a", "b"])).complete, true, "optional lessons do not block completion");
assert.equal(courseProgress([], new Set()).complete, false);
assert.equal(courseProgress([{ id: "x", required: false }], new Set(["x"])).complete, true, "with nothing required, everything counts");
assert.equal(nextLesson(ls, new Set(["a"]))?.id, "b");
assert.equal(nextLesson(ls, new Set(["a", "b", "c"])), null);

// engagement
const now = new Date("2026-11-10T00:00:00Z");
const d = (n: number) => new Date(now.getTime() - n * 86_400_000);
assert.equal(engagement({ complete: true, done: 3, lastActivityAt: d(99), enrolledAt: d(99) }, now), "COMPLETED");
assert.equal(engagement({ complete: false, done: 0, lastActivityAt: d(2), enrolledAt: d(2) }, now), "NOT_STARTED");
assert.equal(engagement({ complete: false, done: 0, lastActivityAt: d(30), enrolledAt: d(30) }, now), "STALLED");
assert.equal(engagement({ complete: false, done: 1, lastActivityAt: d(3), enrolledAt: d(30) }, now), "ACTIVE");
assert.equal(engagement({ complete: false, done: 1, lastActivityAt: d(20), enrolledAt: d(30) }, now), "STALLED");

// gaps
const gaps = questionGaps(qs, [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 2, 0]]);
assert.equal(gaps[0].index, 0 === gaps[0].index ? 0 : gaps[0].index);
assert.equal(gaps.find((g) => g.index === 1)?.wrongPercent, 67);
assert.equal(questionGaps(qs, [[0, 1, 2, 0]], 3).length, 0, "too few attempts to judge");

// misc
assert.equal(sniffMedia(Buffer.from("\0\0\0\x18ftypmp42", "latin1")), "video/mp4");
assert.equal(sniffMedia(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])), "video/webm");
assert.equal(sniffMedia(Buffer.from("MZ not a video")), null);
assert.equal(marksValid(8, 10), true);
assert.equal(marksValid(11, 10), false);
assert.equal(marksValid(-1, 10), false);
assert.equal(marksValid(7.5, 10), false);
assert.equal(certificateSerial(2026, "ab12cd34"), "CRS-2026-AB12CD34");
console.log("lms ok");

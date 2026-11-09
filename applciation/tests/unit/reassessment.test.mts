import assert from "node:assert/strict";
import { DEFAULT_RULE, latestBy, retakeDecision, ruleFor, trend } from "../../lib/reassessment";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const day = 86_400_000, now = new Date("2026-11-09T10:00:00Z");
const done = (k: number, daysAgo: number) => ({ attemptNumber: k, status: "SUBMITTED", submittedAt: new Date(now.getTime() - daysAgo * day) });

t("without a college rule, scheduled tests keep the old behaviour: one attempt", () => {
  assert.deepEqual(ruleFor([], "APTITUDE"), DEFAULT_RULE);
  const d = retakeDecision({ rule: ruleFor([], "APTITUDE"), attempts: [done(1, 30)], now });
  assert.equal(d.kind, "refuse"); assert.equal(d.kind === "refuse" && d.message, "You have already taken this assessment");
});
t("without a college rule, the personality test keeps the old 180-day wait", () => {
  const r = ruleFor([], "PERSONALITY"); assert.deepEqual(r, { maxAttempts: null, cooldownDays: 180 });
  assert.equal(retakeDecision({ rule: r, attempts: [done(1, 179)], now }).kind, "refuse");
  assert.equal(retakeDecision({ rule: r, attempts: [done(1, 181)], now }).kind, "start");
});
t("a college rule replaces the default", () => { assert.deepEqual(ruleFor([{ category: "APTITUDE", maxAttempts: 3, cooldownDays: 7 }], "APTITUDE"), { maxAttempts: 3, cooldownDays: 7 }); });
t("the first attempt always starts as attempt 1", () => { assert.deepEqual(retakeDecision({ rule: DEFAULT_RULE, attempts: [], now }), { kind: "start", attemptNumber: 1 }); });
t("an attempt in progress is resumed, never doubled", () => {
  assert.deepEqual(retakeDecision({ rule: DEFAULT_RULE, attempts: [{ attemptNumber: 1, status: "IN_PROGRESS", submittedAt: null }], now }), { kind: "resume", attemptNumber: 1 });
});
t("attempts are limited and counted", () => {
  const rule = { maxAttempts: 3, cooldownDays: 0 };
  assert.deepEqual(retakeDecision({ rule, attempts: [done(1, 9), done(2, 5)], now }), { kind: "start", attemptNumber: 3 });
  const d = retakeDecision({ rule, attempts: [done(1, 9), done(2, 5), done(3, 1)], now });
  assert.equal(d.kind === "refuse" && d.code, "NO_ATTEMPTS_LEFT"); assert.match(d.kind === "refuse" ? d.message : "", /all 3 attempts/);
});
t("the wait runs from the end of the previous attempt and says when", () => {
  const d = retakeDecision({ rule: { maxAttempts: null, cooldownDays: 7 }, attempts: [done(1, 3)], now });
  assert.equal(d.kind === "refuse" && d.code, "COOLDOWN"); assert.equal(d.kind === "refuse" && d.nextAt?.toISOString().slice(0, 10), "2026-11-13");
});
t("no limit and no wait allows any number of retakes", () => { assert.equal(retakeDecision({ rule: { maxAttempts: null, cooldownDays: 0 }, attempts: [done(1, 0), done(2, 0), done(3, 0)], now }).kind, "start"); });
t("practice tests can always be retaken, whatever the rule", () => { assert.deepEqual(retakeDecision({ rule: DEFAULT_RULE, attempts: [done(1, 0)], isPractice: true, now }), { kind: "start", attemptNumber: 2 }); });
t("attempt order in the input does not matter", () => { assert.deepEqual(retakeDecision({ rule: { maxAttempts: 5, cooldownDays: 0 }, attempts: [done(3, 1), done(1, 9), done(2, 5)], now }), { kind: "start", attemptNumber: 4 }); });
t("averages use each student's newest attempt only", () => {
  const rows = [{ s: "a", attemptNumber: 1, p: 40 }, { s: "a", attemptNumber: 2, p: 70 }, { s: "b", attemptNumber: 1, p: 60 }];
  assert.deepEqual(latestBy(rows, (r) => r.s).map((r) => r.p).sort(), [60, 70]);
});
t("trend shows change since first and since previous attempt", () => {
  const p = (k: number, percent: number) => ({ attemptNumber: k, at: "", percent });
  assert.deepEqual(trend([p(1, 50), p(3, 72.5), p(2, 60)]), { sinceFirst: 22.5, sincePrevious: 12.5, direction: "up" });
  assert.deepEqual(trend([p(1, 50)]), { sinceFirst: null, sincePrevious: null, direction: null });
  assert.equal(trend([p(1, 80), p(2, 70)]).direction, "down");
});
console.log(n === 12 ? "ALL PASSED" : "COUNT " + n);

import assert from "node:assert/strict";
import { INSTRUMENTS, instrumentByKey, instrumentForStudent } from "../../lib/instruments/index";
import { answersSchema, scoreInstrument, scoreWriting } from "../../lib/instruments/scoring";
import { RIASEC_ROLES } from "../../lib/instruments/riasec";

let n = 0;
function t(name: string, fn: () => void) { fn(); n++; console.log("PASS " + name); }
const riasec = instrumentByKey("riasec")!, disc = instrumentByKey("behavioural-style")!, team = instrumentByKey("teamwork-leadership")!, writing = instrumentByKey("communication-writing")!;
const likert = (inst: typeof riasec, f: (scale: string, i: number) => number) => Object.fromEntries(inst.items.map((it, i) => [it.id, f((it as { scale: string }).scale, i)]));

t("every instrument has unique item ids and, for choice items, unique option ids", () => {
  for (const inst of INSTRUMENTS) {
    const ids = inst.items.map((i) => i.id); assert.equal(new Set(ids).size, ids.length, inst.key);
    const opts = inst.items.flatMap((i) => (i.kind === "forced" || i.kind === "situational" ? i.options.map((o) => o.id) : []));
    assert.equal(new Set(opts).size, opts.length, inst.key);
  }
});
t("RIASEC has 36 items, six for each of six types, and every scale has a meaning for every band", () => {
  assert.equal(riasec.items.length, 36);
  for (const s of riasec.scales) { assert.equal(riasec.items.filter((i) => i.kind === "likert" && i.scale === s.key).length, 6); assert.ok(s.meaning.high && s.meaning.moderate && s.meaning.low); assert.ok(RIASEC_ROLES[s.key].length >= 3); }
});
t("RIASEC: liking only Social activities puts S first and gives the Holland code", () => {
  const r = scoreInstrument(riasec, likert(riasec, (s) => (s === "S" ? 5 : s === "E" ? 4 : s === "I" ? 3 : 1)));
  assert.deepEqual(r.ranking.slice(0, 3), ["S", "E", "I"]); assert.equal(r.scales.S.score, 100); assert.equal(r.scales.R.score, 0); assert.equal(r.scales.S.band, "high");
  assert.match(r.headline, /Social, Enterprising, Investigative/);
});
t("RIASEC: answering 'Not sure' to everything is a flat 50 for every type", () => { const r = scoreInstrument(riasec, likert(riasec, () => 3)); assert.ok(Object.values(r.scales).every((s) => s.score === 50 && s.band === "moderate")); });
t("behavioural style: 12 sets, each with exactly one statement per style, in rotating order", () => {
  assert.equal(disc.items.length, 12);
  for (const it of disc.items) { assert.equal(it.kind, "forced"); if (it.kind === "forced") assert.deepEqual(it.options.map((o) => o.scale).sort(), ["C", "D", "I", "S"]); }
  const firsts = new Set(disc.items.map((i) => (i.kind === "forced" ? i.options[0].scale : ""))); assert.equal(firsts.size, 4);
});
t("behavioural style: always choosing D as most and C as least makes D 100 and C 0", () => {
  const a = Object.fromEntries(disc.items.map((it) => { const o = (it as { options: { id: string; scale: string }[] }).options; return [it.id, { most: o.find((x) => x.scale === "D")!.id, least: o.find((x) => x.scale === "C")!.id }]; }));
  const r = scoreInstrument(disc, a);
  assert.equal(r.scales.D.score, 100); assert.equal(r.scales.C.score, 0); assert.equal(r.scales.I.score, 50); assert.equal(r.scales.S.score, 50); assert.equal(r.ranking[0], "D");
});
t("behavioural style: most and least must differ", () => {
  const a = Object.fromEntries(disc.items.map((it) => { const o = (it as { options: { id: string }[] }).options; return [it.id, { most: o[0].id, least: o[1].id }]; }));
  assert.equal(answersSchema(disc).safeParse(a).success, true);
  assert.equal(answersSchema(disc).safeParse({ ...a, "bs-1": { most: "bs-1D", least: "bs-1D" } }).success, false);
});
t("teamwork: 10 scenarios, 4 options, every option scores only on named skills with 0-3 points", () => {
  assert.equal(team.items.length, 10);
  const keys = new Set(team.scales.map((s) => s.key));
  for (const it of team.items) { assert.equal(it.kind, "situational"); if (it.kind === "situational") { assert.equal(it.options.length, 4); for (const o of it.options) for (const [k, p] of Object.entries(o.scores)) { assert.ok(keys.has(k)); assert.ok(p >= 0 && p <= 3); } assert.ok(it.options.some((o) => Object.values(o.scores).every((p) => p === 3))); } }
});
t("teamwork: always choosing the best option scores 100 everywhere; always the weakest scores very low", () => {
  const pick = (best: boolean) => Object.fromEntries(team.items.map((it) => { const o = (it as { options: { id: string; scores: Record<string, number> }[] }).options; const total = (x: { scores: Record<string, number> }) => Object.values(x.scores).reduce((a, b) => a + b, 0); return [it.id, [...o].sort((x, y) => (best ? total(y) - total(x) : total(x) - total(y)))[0].id]; }));
  const hi = scoreInstrument(team, pick(true)), lo = scoreInstrument(team, pick(false));
  assert.ok(Object.values(hi.scales).every((s) => s.score === 100), JSON.stringify(hi.scales)); assert.ok(Object.values(lo.scales).every((s) => s.score <= 15), JSON.stringify(lo.scales));
});
t("teamwork: every one of the four skills is tested by at least three scenarios", () => {
  for (const s of team.scales) assert.ok(team.items.filter((it) => it.kind === "situational" && it.options.some((o) => s.key in o.scores)).length >= 3, s.key);
});
t("answers: every question is required, unknown questions and out-of-range values are refused", () => {
  const ok = likert(riasec, () => 3);
  assert.equal(answersSchema(riasec).safeParse(ok).success, true);
  const { [riasec.items[0].id]: _drop, ...missing } = ok; assert.equal(answersSchema(riasec).safeParse(missing).success, false);
  assert.equal(answersSchema(riasec).safeParse({ ...ok, extra: 1 }).success, false);
  assert.equal(answersSchema(riasec).safeParse({ ...ok, [riasec.items[0].id]: 6 }).success, false);
  assert.equal(answersSchema(team).safeParse({ ...Object.fromEntries(team.items.map((i) => [i.id, (i as { options: { id: string }[] }).options[0].id])), "tw-1": "tw-2a" }).success, false);
});
t("writing: word limits are enforced and the marks become scales plus an overall", () => {
  const words = (k: number) => Array.from({ length: k }, () => "word").join(" ");
  assert.equal(answersSchema(writing).safeParse({ "cw-1": words(40) }).success, false); assert.equal(answersSchema(writing).safeParse({ "cw-1": words(200) }).success, false); assert.equal(answersSchema(writing).safeParse({ "cw-1": words(100) }).success, true);
  const r = scoreWriting(writing, { clarity: 8, tone: 9, structure: 6, language: 7 }, { clarity: "Clear." });
  assert.equal(r.scales.clarity.score, 80); assert.equal(r.scales.overall.score, 75); assert.equal(r.ranking[0], "tone"); assert.equal(r.comments?.clarity, "Clear.");
  assert.equal(scoreWriting(writing, { clarity: 99, tone: -5, structure: 10, language: 0 }, {}).scales.clarity.score, 100);
});
t("what a student receives never contains scoring keys", () => {
  for (const inst of INSTRUMENTS) { const s = JSON.stringify(instrumentForStudent(inst)); assert.ok(!/"scale":|"scores":|"reversed"/.test(s), inst.key); }
});
t("private instruments are exactly the personality-style ones", () => { assert.deepEqual(INSTRUMENTS.filter((i) => i.private).map((i) => i.key).sort(), ["behavioural-style", "riasec"]); });
console.log(n === 14 ? "ALL PASSED" : "COUNT " + n);

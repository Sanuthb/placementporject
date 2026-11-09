import { z } from "zod";
import { band, type Answers, type Instrument, type Result, type ScaleResult } from "@/lib/instruments/types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** The shape a student's answers must have for this instrument. Every question is required, and every value must be one the question offers. */
export function answersSchema(inst: Instrument) {
  return z.record(z.string(), z.unknown()).superRefine((a, ctx) => {
    const known = new Set(inst.items.map((i) => i.id));
    for (const k of Object.keys(a)) if (!known.has(k)) ctx.addIssue({ code: "custom", path: [k], message: `Unknown question ${k}` });
    for (const item of inst.items) {
      const v = a[item.id];
      const bad = (message: string) => ctx.addIssue({ code: "custom", path: [item.id], message });
      if (v === undefined || v === null || v === "") { bad(`Answer question ${item.id}`); continue; }
      if (item.kind === "likert") { if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 5) bad("Choose 1 to 5"); }
      else if (item.kind === "situational") { if (typeof v !== "string" || !item.options.some((o) => o.id === v)) bad("Choose one of the options"); }
      else if (item.kind === "forced") {
        const f = v as { most?: string; least?: string };
        const ids = new Set(item.options.map((o) => o.id));
        if (!f || typeof f !== "object" || !ids.has(f.most ?? "") || !ids.has(f.least ?? "")) bad("Choose one most like you and one least like you");
        else if (f.most === f.least) bad("The most and the least like you must be different statements");
      } else if (item.kind === "writing") {
        const words = typeof v === "string" ? v.trim().split(/\s+/).filter(Boolean).length : 0;
        if (words < item.minWords) bad(`Write at least ${item.minWords} words`);
        else if (words > item.maxWords) bad(`Write at most ${item.maxWords} words`);
      }
    }
  });
}

/** Scores a likert, forced-choice or situational instrument. Writing instruments are scored by `scoreWriting` (an AI call) instead. */
export function scoreInstrument(inst: Instrument, answers: Answers): Result {
  const raw: Record<string, { sum: number; min: number; max: number }> = Object.fromEntries(inst.scales.map((s) => [s.key, { sum: 0, min: 0, max: 0 }]));
  for (const item of inst.items) {
    const v = answers[item.id];
    if (item.kind === "likert") {
      const r = raw[item.scale]; r.sum += item.reversed ? 6 - (v as number) : (v as number); r.min += 1; r.max += 5;
    } else if (item.kind === "forced") {
      const f = v as { most: string; least: string };
      for (const o of item.options) { const r = raw[o.scale]; r.min += -1; r.max += 1; }
      raw[item.options.find((o) => o.id === f.most)!.scale].sum += 1;
      raw[item.options.find((o) => o.id === f.least)!.scale].sum -= 1;
    } else if (item.kind === "situational") {
      const scored = new Set<string>(); for (const o of item.options) for (const k of Object.keys(o.scores)) scored.add(k);
      for (const k of scored) { raw[k].max += Math.max(...item.options.map((o) => o.scores[k] ?? 0)); raw[k].min += Math.min(...item.options.map((o) => o.scores[k] ?? 0)); }
      const chosen = item.options.find((o) => o.id === v)!;
      for (const [k, pts] of Object.entries(chosen.scores)) raw[k].sum += pts;
    }
  }
  const scales: Record<string, ScaleResult> = {};
  for (const s of inst.scales) {
    const r = raw[s.key];
    const score = r.max === r.min ? 0 : clamp(((r.sum - r.min) / (r.max - r.min)) * 100);
    const b = band(score);
    scales[s.key] = { score, band: b, meaning: s.meaning[b] };
  }
  const ranking = [...inst.scales].sort((a, b) => scales[b.key].score - scales[a.key].score || a.key.localeCompare(b.key)).map((s) => s.key);
  return { scales, ranking, headline: headlineFor(inst, scales, ranking) };
}

/** What the ranking means in words. For comparison-style tests ("forced") the top scales describe a style; for the rest they describe strengths or interests. */
export function headlineFor(inst: Instrument, scales: Record<string, ScaleResult>, ranking: string[]) {
  const label = (k: string) => inst.scales.find((s) => s.key === k)!.label;
  const top = ranking.slice(0, inst.key === "riasec" ? 3 : 2).filter((k) => scales[k].score > 0);
  if (!top.length) return "Not enough information to describe a pattern.";
  if (inst.key === "riasec") return `Strongest interest areas: ${top.map(label).join(", ")}.`;
  if (inst.key === "behavioural-style") return `Your answers lean most towards: ${top.map(label).join(" and ")}.`;
  return `Strongest areas: ${top.map(label).join(", ")}.`;
}

/** Combines the AI's per-criterion marks (0-10) into a result. */
export function scoreWriting(inst: Instrument, marks: Record<string, number>, comments: Record<string, string>): Result {
  const item = inst.items.find((i) => i.kind === "writing");
  if (!item || item.kind !== "writing") throw new Error("not a writing instrument");
  const scales: Record<string, ScaleResult> = {};
  for (const c of item.criteria) {
    const score = clamp((Math.max(0, Math.min(10, Number(marks[c.key]) || 0)) / 10) * 100);
    const s = inst.scales.find((x) => x.key === c.key)!; const b = band(score);
    scales[c.key] = { score, band: b, meaning: s.meaning[b] };
  }
  const overall = clamp(Object.values(scales).reduce((t, s) => t + s.score, 0) / item.criteria.length);
  const b = band(overall);
  scales.overall = { score: overall, band: b, meaning: inst.scales.find((x) => x.key === "overall")!.meaning[b] };
  const ranking = [...inst.scales].filter((s) => s.key !== "overall").sort((a, b2) => scales[b2.key].score - scales[a.key].score || a.key.localeCompare(b2.key)).map((s) => s.key);
  return { scales, ranking, headline: `Overall written communication: ${overall}%.`, comments };
}

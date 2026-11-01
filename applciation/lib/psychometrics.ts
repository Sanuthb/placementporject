import { z } from "zod";

/**
 * Built-in instrument, version 1: a 25-item personality inventory (five traits, five items each, 1-5 agreement)
 * and 10 aptitude questions. Results are for guidance and cohort analysis only. They must never feed eligibility,
 * blocking, shortlisting or any decision about a student (spec rule 12.4).
 */
export const INSTRUMENT_VERSION = "1.0";
/** How long a student waits before retaking the assessment. */
export const RETAKE_AFTER_DAYS = 180;
export const TRAITS = ["openness", "conscientiousness", "extraversion", "agreeableness", "emotional_stability"] as const;
export type Trait = (typeof TRAITS)[number];

type PItem = { id: string; text: string; trait: Trait; reversed?: boolean };
export const PERSONALITY: PItem[] = [
  { id: "p1", trait: "openness", text: "I enjoy trying new ideas and ways of doing things." },
  { id: "p2", trait: "openness", text: "I am curious about how things work." },
  { id: "p3", trait: "openness", text: "I prefer routine to variety.", reversed: true },
  { id: "p4", trait: "openness", text: "I like to explore subjects outside my course." },
  { id: "p5", trait: "openness", text: "I find abstract ideas hard to engage with.", reversed: true },
  { id: "p6", trait: "conscientiousness", text: "I finish what I start." },
  { id: "p7", trait: "conscientiousness", text: "I plan my work ahead of deadlines." },
  { id: "p8", trait: "conscientiousness", text: "I often leave tasks until the last minute.", reversed: true },
  { id: "p9", trait: "conscientiousness", text: "I pay attention to details." },
  { id: "p10", trait: "conscientiousness", text: "I find it hard to keep my things organised.", reversed: true },
  { id: "p11", trait: "extraversion", text: "I feel energised when I am around other people." },
  { id: "p12", trait: "extraversion", text: "I am comfortable speaking up in a group." },
  { id: "p13", trait: "extraversion", text: "I prefer to stay in the background.", reversed: true },
  { id: "p14", trait: "extraversion", text: "I find it easy to start conversations with strangers." },
  { id: "p15", trait: "extraversion", text: "I tire quickly of social gatherings.", reversed: true },
  { id: "p16", trait: "agreeableness", text: "I try to understand other people's point of view." },
  { id: "p17", trait: "agreeableness", text: "I am willing to compromise to keep the peace." },
  { id: "p18", trait: "agreeableness", text: "I can be quite critical of others.", reversed: true },
  { id: "p19", trait: "agreeableness", text: "I enjoy helping teammates succeed." },
  { id: "p20", trait: "agreeableness", text: "I am not interested in other people's problems.", reversed: true },
  { id: "p21", trait: "emotional_stability", text: "I stay calm under pressure." },
  { id: "p22", trait: "emotional_stability", text: "I recover quickly after setbacks." },
  { id: "p23", trait: "emotional_stability", text: "I worry a lot about things going wrong.", reversed: true },
  { id: "p24", trait: "emotional_stability", text: "My mood changes quickly.", reversed: true },
  { id: "p25", trait: "emotional_stability", text: "I feel confident handling difficult situations." },
];

type AItem = { id: string; area: "numerical" | "verbal" | "logical"; text: string; options: string[]; answer: number };
const APTITUDE_KEY: AItem[] = [
  { id: "a1", area: "numerical", text: "A train travels 180 km in 3 hours. At the same speed, how far does it go in 5 hours?", options: ["240 km", "270 km", "300 km", "360 km"], answer: 2 },
  { id: "a2", area: "numerical", text: "What is 15% of 240?", options: ["24", "30", "36", "42"], answer: 2 },
  { id: "a3", area: "numerical", text: "If 6 workers finish a job in 10 days, how many days would 15 workers take?", options: ["2", "4", "6", "8"], answer: 1 },
  { id: "a4", area: "numerical", text: "The average of 4, 8, 12 and x is 10. What is x?", options: ["10", "14", "16", "20"], answer: 2 },
  { id: "a5", area: "verbal", text: "Choose the word closest in meaning to 'concise'.", options: ["Lengthy", "Brief", "Vague", "Loud"], answer: 1 },
  { id: "a6", area: "verbal", text: "Choose the word opposite in meaning to 'scarce'.", options: ["Rare", "Plentiful", "Costly", "Fragile"], answer: 1 },
  { id: "a7", area: "verbal", text: "Pick the correctly spelt word.", options: ["Accomodate", "Acommodate", "Accommodate", "Acomodate"], answer: 2 },
  { id: "a8", area: "logical", text: "Complete the series: 2, 6, 12, 20, 30, ?", options: ["38", "40", "42", "44"], answer: 2 },
  { id: "a9", area: "logical", text: "All engineers are logical. Some logical people are writers. Which must be true?", options: ["All writers are engineers", "Some engineers are writers", "All engineers are logical", "No writer is logical"], answer: 2 },
  { id: "a10", area: "logical", text: "Ravi is taller than Sam. Sam is taller than Tej. Who is the shortest?", options: ["Ravi", "Sam", "Tej", "Cannot tell"], answer: 2 },
];

/** What the student sees: the questions without the answer key. */
export function instrumentForStudent() {
  return {
    version: INSTRUMENT_VERSION,
    scale: { min: 1, max: 5, labels: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"] },
    personality: PERSONALITY.map(({ id, text }) => ({ id, text })),
    aptitude: APTITUDE_KEY.map(({ id, area, text, options }) => ({ id, area, text, options })),
  };
}

export const answersSchema = z.object({
  personality: z.record(z.string(), z.number().int().min(1).max(5)),
  aptitude: z.record(z.string(), z.number().int().min(0).max(3)),
}).superRefine((v, ctx) => {
  for (const q of PERSONALITY) if (v.personality[q.id] === undefined) ctx.addIssue({ code: "custom", message: `Missing answer for ${q.id}`, path: ["personality", q.id] });
  for (const q of APTITUDE_KEY) if (v.aptitude[q.id] === undefined) ctx.addIssue({ code: "custom", message: `Missing answer for ${q.id}`, path: ["aptitude", q.id] });
});

const band = (n: number) => (n >= 70 ? "high" : n >= 40 ? "moderate" : "low");
const MEANING: Record<Trait, Record<string, string>> = {
  openness: { high: "Curious and open to new approaches.", moderate: "Balances new ideas with proven methods.", low: "Prefers practical, familiar approaches." },
  conscientiousness: { high: "Organised, dependable and detail-minded.", moderate: "Generally organised, with room to tighten planning.", low: "May benefit from structure, checklists and earlier planning." },
  extraversion: { high: "Energised by people; comfortable leading discussions.", moderate: "Comfortable both in groups and working alone.", low: "Reflective; may need practice speaking up in group rounds." },
  agreeableness: { high: "Cooperative and considerate of teammates.", moderate: "Balances cooperation with directness.", low: "Direct and independent; practise collaborative framing." },
  emotional_stability: { high: "Calm under pressure.", moderate: "Handles pressure well most of the time.", low: "May feel stress strongly; practise interviews to build composure." },
};

export type PsychScores = { personality: Record<Trait, { score: number; band: string; meaning: string }>; aptitude: { overall: number; correct: number; total: number; byArea: Record<string, number> } };

/** Traits are scaled 0-100 (reverse-scored items flipped); aptitude is percent correct overall and by area. */
export function scoreAttempt(a: z.infer<typeof answersSchema>): PsychScores {
  const personality = {} as PsychScores["personality"];
  for (const trait of TRAITS) {
    const items = PERSONALITY.filter((q) => q.trait === trait);
    const sum = items.reduce((t, q) => t + (q.reversed ? 6 - a.personality[q.id] : a.personality[q.id]), 0);
    const score = Math.round(((sum - items.length) / (items.length * 4)) * 100);
    personality[trait] = { score, band: band(score), meaning: MEANING[trait][band(score)] };
  }
  const correct = APTITUDE_KEY.filter((q) => a.aptitude[q.id] === q.answer);
  const byArea: Record<string, number> = {};
  for (const area of ["numerical", "verbal", "logical"]) {
    const qs = APTITUDE_KEY.filter((q) => q.area === area);
    byArea[area] = Math.round((qs.filter((q) => a.aptitude[q.id] === q.answer).length / qs.length) * 100);
  }
  return { personality, aptitude: { overall: Math.round((correct.length / APTITUDE_KEY.length) * 100), correct: correct.length, total: APTITUDE_KEY.length, byArea } };
}

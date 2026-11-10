/**
 * Assessment categories and reassessment (retake) rules. Pure, so the rules are the same wherever they are applied and can be unit-tested.
 *
 * A college sets a rule per category: how many attempts a student gets and how long they wait between them. Without a rule the defaults
 * below apply, which are exactly how the platform behaved before rules existed (one attempt at a scheduled test; the personality test
 * every 180 days), so nothing changes for a college until an admin decides otherwise.
 */

export const ASSESSMENT_CATEGORIES = [
  ["APTITUDE", "Aptitude (quantitative, logical, verbal)"],
  ["TECHNICAL", "Technical / domain knowledge"],
  ["COMMUNICATION", "Communication"],
  ["DIGITAL_LITERACY", "Digital literacy"],
  ["TEAMWORK_LEADERSHIP", "Teamwork and leadership"],
  ["PERSONALITY", "Personality"],
  ["CAREER_INTEREST", "Career interests"],
  ["BEHAVIOURAL_STYLE", "Behavioural style"],
  ["OTHER", "Other"],
] as const;
export type AssessmentCategory = (typeof ASSESSMENT_CATEGORIES)[number][0];
export const categoryLabel = (c: string) => ASSESSMENT_CATEGORIES.find(([k]) => k === c)?.[1] ?? c;

/** `maxAttempts: null` means no limit. `cooldownDays` is counted from the end of the previous attempt. */
export type Rule = { maxAttempts: number | null; cooldownDays: number };
export const DEFAULT_RULE: Rule = { maxAttempts: 1, cooldownDays: 0 };
export const DEFAULT_RULES: Partial<Record<AssessmentCategory, Rule>> = { PERSONALITY: { maxAttempts: null, cooldownDays: 180 } };
export const ruleFor = (stored: { category: string; maxAttempts: number | null; cooldownDays: number }[], category: string): Rule => {
  const r = stored.find((x) => x.category === category);
  return r ? { maxAttempts: r.maxAttempts, cooldownDays: r.cooldownDays } : DEFAULT_RULES[category as AssessmentCategory] ?? DEFAULT_RULE;
};

export type PastAttempt = { attemptNumber: number; status: string; submittedAt: Date | null; startedAt?: Date };
export type Decision =
  | { kind: "resume"; attemptNumber: number }
  | { kind: "start"; attemptNumber: number }
  | { kind: "refuse"; code: "NO_ATTEMPTS_LEFT" | "COOLDOWN"; message: string; nextAt?: Date };

const DAY = 86_400_000;

/**
 * May the student start (or resume) an attempt now? An attempt in progress is always resumed. Practice tests have no limit and no wait,
 * since their whole point is repetition. Otherwise the category's rule applies.
 */
export function retakeDecision(o: { rule: Rule; attempts: PastAttempt[]; isPractice?: boolean; now?: Date }): Decision {
  const now = o.now ?? new Date();
  const sorted = [...o.attempts].sort((a, b) => a.attemptNumber - b.attemptNumber);
  const last = sorted.at(-1);
  if (last?.status === "IN_PROGRESS") return { kind: "resume", attemptNumber: last.attemptNumber };
  const next = (last?.attemptNumber ?? 0) + 1;
  if (!last || o.isPractice) return { kind: "start", attemptNumber: next };
  const { maxAttempts, cooldownDays } = o.rule;
  if (maxAttempts != null && sorted.length >= maxAttempts) {
    return { kind: "refuse", code: "NO_ATTEMPTS_LEFT", message: maxAttempts === 1 ? "You have already taken this assessment" : `You have used all ${maxAttempts} attempts at this assessment` };
  }
  const ended = last.submittedAt ?? last.startedAt;
  if (cooldownDays > 0 && ended) {
    const nextAt = new Date(ended.getTime() + cooldownDays * DAY);
    if (nextAt > now) return { kind: "refuse", code: "COOLDOWN", message: `You can try again from ${nextAt.toISOString().slice(0, 10)}`, nextAt };
  }
  return { kind: "start", attemptNumber: next };
}

/** One attempt per key (student, or student + test): the newest by attempt number. Averages and rankings use this, so retakes never count twice. */
export function latestBy<T extends { attemptNumber: number }>(rows: T[], key: (r: T) => string): T[] {
  const best = new Map<string, T>();
  for (const r of rows) { const k = key(r), cur = best.get(k); if (!cur || r.attemptNumber > cur.attemptNumber) best.set(k, r); }
  return [...best.values()];
}

export type HistoryPoint = { attemptNumber: number; at: string; percent: number; id?: string };
/** Change from the first to the latest attempt, and from the previous one, in percentage points. */
export function trend(points: HistoryPoint[]) {
  const s = [...points].sort((a, b) => a.attemptNumber - b.attemptNumber);
  if (s.length < 2) return { sinceFirst: null, sincePrevious: null, direction: null as null | "up" | "down" | "same" };
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const last = s.at(-1)!.percent, prev = s.at(-2)!.percent;
  return { sinceFirst: r1(last - s[0].percent), sincePrevious: r1(last - prev), direction: last > prev ? "up" as const : last < prev ? "down" as const : "same" as const };
}

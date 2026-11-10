/**
 * The mock test engine, pure: question types and how each is marked, the report on one attempt (overall, by section, by topic, accuracy, time, question by question,
 * weak topics), passing criteria, and the improvement engine (what to study, which targeted questions to set, when to reassess, how this attempt compares).
 * No database and no AI here. Open answers (descriptive, coding, SQL) are marked elsewhere and passed in as `marks`.
 */

export const QTYPES = ["SINGLE", "MULTIPLE", "TRUE_FALSE", "FILL_BLANK", "DESCRIPTIVE", "CODING", "SQL"] as const;
export type QType = (typeof QTYPES)[number];
export const QTYPE_LABEL: Record<QType, string> = { SINGLE: "Single choice", MULTIPLE: "Multiple choice", TRUE_FALSE: "True or false", FILL_BLANK: "Fill in the blank", DESCRIPTIVE: "Descriptive", CODING: "Coding", SQL: "SQL" };
export const OPEN_TYPES: QType[] = ["DESCRIPTIVE", "CODING", "SQL"];

/** Parts of a test, as in the SRS. A question belongs to one section. */
export const SECTIONS = [["quantitative", "Quantitative aptitude"], ["logical", "Logical reasoning"], ["verbal", "Verbal ability"], ["technical", "Technical knowledge"], ["programming", "Programming"], ["coding", "Coding"], ["sql", "SQL"], ["domain", "Domain knowledge"], ["company", "Company-specific"], ["case_study", "Case study"]] as const;
export type SectionKey = (typeof SECTIONS)[number][0];
export const sectionLabel = (k: string) => SECTIONS.find(([key]) => key === k)?.[1] ?? (k === "general" ? "General" : k);

export type PaperQuestion = {
  id: string; text: string; options: string[]; correct: number[]; marks: number; negativeMarks: number; explanation?: string | null
  type?: QType | "CHOICE"; context?: string | null; section?: string | null; tags?: string[]; difficulty?: string | null; acceptedAnswers?: string[]; modelAnswer?: string | null; rubric?: string | null; language?: string | null
}
export type Answer = number[] | string;
export type Marks = Record<string, { awarded: number; by: "AI" | "STAFF"; comment?: string }>;

/** The type of a question. Questions made before types existed are single or multiple choice by how many answers are correct. */
export const typeOf = (q: Pick<PaperQuestion, "type" | "correct">): QType => (q.type && q.type !== "CHOICE" ? q.type : q.correct.length > 1 ? "MULTIPLE" : "SINGLE");
export const isOpen = (q: PaperQuestion) => OPEN_TYPES.includes(typeOf(q));
export const sectionOf = (q: Pick<PaperQuestion, "section" | "tags">): string => {
  const known = new Set<string>(SECTIONS.map(([k]) => k));
  if (q.section && known.has(q.section)) return q.section;
  return (q.tags ?? []).map((t) => t.toLowerCase().replace(/[\s-]+/g, "_")).find((t) => known.has(t)) ?? "general";
};
/** Topics are the tags that are not themselves a section name. A question with no topic tag counts under its section. */
export const topicsOf = (q: Pick<PaperQuestion, "section" | "tags">): string[] => {
  const known = new Set<string>(SECTIONS.map(([k]) => k));
  const t = (q.tags ?? []).map((x) => x.trim()).filter((x) => x && !known.has(x.toLowerCase().replace(/[\s-]+/g, "_")));
  return t.length ? [...new Set(t)] : [sectionLabel(sectionOf(q))];
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.,;:!?]+$/g, "").trim();
const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export type QStatus = "CORRECT" | "WRONG" | "PARTIAL" | "SKIPPED" | "PENDING";
/** Marks one answer. Objective types are marked at once; an open answer is PENDING until `marks` has its mark. */
export function markQuestion(q: PaperQuestion, answer: Answer | undefined, mark?: Marks[string]): { awarded: number; status: QStatus } {
  const t = typeOf(q);
  const blank = answer === undefined || (Array.isArray(answer) ? answer.length === 0 : answer.trim() === "");
  if (blank) return { awarded: 0, status: "SKIPPED" };
  if (OPEN_TYPES.includes(t)) {
    if (!mark) return { awarded: 0, status: "PENDING" };
    const a = Math.min(q.marks, Math.max(0, Math.round(mark.awarded * 2) / 2));
    return { awarded: a, status: a >= q.marks ? "CORRECT" : a > 0 ? "PARTIAL" : "WRONG" };
  }
  if (t === "FILL_BLANK") {
    const given = typeof answer === "string" ? norm(answer) : "";
    const ok = (q.acceptedAnswers ?? []).some((x) => { const w = norm(x); const na = Number(given), nb = Number(w); return given === w || (given !== "" && w !== "" && Number.isFinite(na) && Number.isFinite(nb) && na === nb); });
    return ok ? { awarded: q.marks, status: "CORRECT" } : { awarded: -q.negativeMarks, status: "WRONG" };
  }
  const given = Array.isArray(answer) ? answer : [];
  return sameSet(given, q.correct) ? { awarded: q.marks, status: "CORRECT" } : { awarded: -q.negativeMarks, status: "WRONG" };
}

/** The score of an attempt. A wrong objective answer costs its negative marks; the total never goes below zero. Open answers not yet marked are counted as pending. */
export function scoreAttempt(qs: PaperQuestion[], answers: Record<string, Answer>, marks: Marks = {}) {
  let score = 0, max = 0, pendingMax = 0, pending = 0;
  const per = qs.map((q) => {
    max += q.marks;
    const r = markQuestion(q, answers[q.id], marks[q.id]);
    score += r.awarded;
    if (r.status === "PENDING") { pending++; pendingMax += q.marks; }
    return { id: q.id, ...r };
  });
  return { score: Math.max(0, Math.round(score * 100) / 100), max, pending, pendingMax, per };
}

// ---- the report ----
export type Report = ReturnType<typeof buildReport>;
export type SectionResult = { key: string; label: string; score: number; max: number; percent: number; correct: number; total: number; cutoff: number | null; passed: boolean | null };
export type TopicResult = { topic: string; correct: number; total: number; percent: number };

/** Everything about one attempt: overall, accuracy, time, sections against their cut-offs, topics, weak topics, and each question with the mark it earned. */
export function buildReport(o: { qs: PaperQuestion[]; answers: Record<string, Answer>; marks?: Marks; startedAt: Date; submittedAt: Date | null; passPercent: number | null; sectionCutoffs?: Record<string, number> }) {
  const marks = o.marks ?? {};
  const s = scoreAttempt(o.qs, o.answers, marks);
  const percent = s.max ? Math.round((s.score / s.max) * 1000) / 10 : 0;
  const questions = o.qs.map((q, i) => {
    const r = s.per[i];
    return { id: q.id, type: typeOf(q), text: q.text, context: q.context ?? null, options: q.options, correct: q.correct, acceptedAnswers: q.acceptedAnswers ?? [], modelAnswer: q.modelAnswer ?? null, mine: o.answers[q.id] ?? null, status: r.status, awarded: r.awarded, max: q.marks, explanation: q.explanation ?? null, comment: marks[q.id]?.comment ?? null, markedBy: marks[q.id]?.by ?? null, section: sectionOf(q), topics: topicsOf(q), difficulty: q.difficulty ?? null };
  });
  const answered = questions.filter((q) => q.status !== "SKIPPED"), settled = questions.filter((q) => q.status !== "PENDING" && q.status !== "SKIPPED");
  const correct = questions.filter((q) => q.status === "CORRECT").length;
  const seconds = o.submittedAt ? Math.max(0, Math.round((o.submittedAt.getTime() - o.startedAt.getTime()) / 1000)) : null;

  const bySection = new Map<string, typeof questions>();
  for (const q of questions) bySection.set(q.section, [...(bySection.get(q.section) ?? []), q]);
  const sections: SectionResult[] = [...bySection.entries()].map(([key, qs]) => {
    const score = Math.max(0, qs.reduce((a, q) => a + q.awarded, 0)), max = qs.reduce((a, q) => a + q.max, 0), cutoff = o.sectionCutoffs?.[key] ?? null, pct = max ? Math.round((score / max) * 1000) / 10 : 0;
    return { key, label: sectionLabel(key), score: Math.round(score * 100) / 100, max, percent: pct, correct: qs.filter((q) => q.status === "CORRECT").length, total: qs.length, cutoff, passed: cutoff === null ? null : pct >= cutoff };
  });
  const byTopic = new Map<string, { correct: number; total: number }>();
  for (const q of questions) for (const t of q.topics) { const x = byTopic.get(t) ?? { correct: 0, total: 0 }; if (q.status !== "PENDING") { x.total++; if (q.status === "CORRECT") x.correct++; } byTopic.set(t, x); }
  const topics: TopicResult[] = [...byTopic.entries()].filter(([, v]) => v.total > 0).map(([topic, v]) => ({ topic, correct: v.correct, total: v.total, percent: Math.round((v.correct / v.total) * 100) })).sort((a, b) => a.percent - b.percent || a.topic.localeCompare(b.topic));
  // A topic is weak below 60%. With only one question per topic there is too little to judge, so a single wrong answer counts only when no topic has two or more.
  const multi = topics.some((t) => t.total >= 2);
  const weakTopics = topics.filter((t) => t.percent < 60 && (t.total >= 2 || !multi));
  const cutoffsMet = sections.every((x) => x.passed !== false);
  const provisional = s.pending > 0;
  return {
    score: s.score, max: s.max, percent, provisional, pending: s.pending,
    passed: o.passPercent === null && sections.every((x) => x.cutoff === null) ? null : provisional ? null : (o.passPercent === null || percent >= o.passPercent) && cutoffsMet,
    passPercent: o.passPercent, failedSections: sections.filter((x) => x.passed === false).map((x) => x.label),
    accuracy: { correct, wrong: questions.filter((q) => q.status === "WRONG").length, partial: questions.filter((q) => q.status === "PARTIAL").length, skipped: questions.filter((q) => q.status === "SKIPPED").length, pending: s.pending, attempted: answered.length, percent: settled.length ? Math.round((correct / settled.length) * 100) : null },
    time: { seconds, perQuestionSeconds: seconds !== null && o.qs.length ? Math.round(seconds / o.qs.length) : null }, sections, topics, weakTopics, questions,
  };
}

/** What a student may see of their report, set by the schedule. SCORE_ONLY: totals. ANALYSIS: also sections, topics and weak topics. AFTER_END: analysis now, answers once the window closes. IMMEDIATE: everything. */
export type Visibility = "SCORE_ONLY" | "ANALYSIS" | "AFTER_END" | "IMMEDIATE";
export const VISIBILITY_LABEL: Record<Visibility, string> = { SCORE_ONLY: "Score only", ANALYSIS: "Score and analysis (no answers)", AFTER_END: "Analysis now, answers after the window closes", IMMEDIATE: "Everything, straight away" };
export const visibilityOf = (v: string | null | undefined, isPractice: boolean): Visibility => (v === "SCORE_ONLY" || v === "ANALYSIS" || v === "AFTER_END" || v === "IMMEDIATE" ? v : isPractice ? "IMMEDIATE" : "SCORE_ONLY");
export const canSee = (v: Visibility, now: Date, endsAt: Date) => ({ analysis: v !== "SCORE_ONLY", answers: v === "IMMEDIATE" || (v === "AFTER_END" && now > endsAt) });

/** The report cut down to what the schedule allows, so hidden parts never leave the server. */
export function shapeReport(r: Report, vis: Visibility, now: Date, endsAt: Date) {
  const can = canSee(vis, now, endsAt);
  return {
    score: r.score, max: r.max, percent: r.percent, provisional: r.provisional, pending: r.pending, passed: r.passed, passPercent: r.passPercent, failedSections: can.analysis ? r.failedSections : [], accuracy: can.analysis ? r.accuracy : null, time: r.time,
    sections: can.analysis ? r.sections : [], topics: can.analysis ? r.topics : [], weakTopics: can.analysis ? r.weakTopics : [],
    questions: can.answers ? r.questions : null, visibility: vis, answersAvailableAt: vis === "AFTER_END" && !can.answers ? endsAt : null,
  };
}

// ---- the improvement engine ----
export type Candidate = { id: string; text: string; tags: string[]; section?: string | null; difficulty?: string | null; type?: string };
/**
 * Targeted exercises for the topics a student got wrong: questions from the college's banks on those topics that they did not just see. A topic below 40% gets
 * easier questions first (so they can build up); 40-59% gets medium ones. At most `per` per topic and `total` overall.
 */
export function pickExercises(candidates: Candidate[], weak: { topic: string; percent: number }[], seen: ReadonlySet<string>, o: { per?: number; total?: number } = {}) {
  const per = o.per ?? 4, total = o.total ?? 15;
  const out: Candidate[] = [], used = new Set<string>(seen);
  const order = (d?: string | null, pct = 50) => { const rank = { EASY: 0, MEDIUM: 1, HARD: 2 }[d ?? "MEDIUM"] ?? 1; return pct < 40 ? rank : Math.abs(rank - 1); };
  for (const w of [...weak].sort((a, b) => a.percent - b.percent)) {
    const wt = w.topic.toLowerCase();
    const pool = candidates.filter((c) => !used.has(c.id) && c.type !== "DESCRIPTIVE" && (c.tags.some((t) => t.toLowerCase() === wt) || (c.section ?? "").toLowerCase() === wt.replace(/\s+/g, "_") || sectionLabel(c.section ?? "").toLowerCase() === wt)).sort((a, b) => order(a.difficulty, w.percent) - order(b.difficulty, w.percent) || a.id.localeCompare(b.id));
    for (const c of pool.slice(0, per)) { if (out.length >= total) return out; out.push(c); used.add(c.id); }
  }
  return out;
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? [];
/** Study material and courses on the weak topics. A topic matches an item when it appears in its title, topic, subject or skills. */
export function recommendMaterials<T extends { id: string; title: string; terms: string[] }>(weak: { topic: string }[], resources: T[], courses: T[], per = 2) {
  const hit = (item: T, topic: string) => { const w = words(topic); return [item.title, ...item.terms].some((t) => { const lt = t.toLowerCase(); return lt === topic.toLowerCase() || (w.length > 0 && w.every((x) => lt.includes(x))); }); };
  return weak.map((t) => ({ topic: t.topic, resources: resources.filter((r) => hit(r, t.topic)).slice(0, per).map((r) => ({ id: r.id, title: r.title })), courses: courses.filter((c) => hit(c, t.topic)).slice(0, per).map((c) => ({ id: c.id, title: c.title })) }));
}

/** When to take the test again: after enough days to work on every weak topic (three, then two more for each extra topic), at most two weeks. */
export function reassessDate(weakCount: number, from: Date, cooldownDays = 0): Date {
  const days = Math.min(14, Math.max(cooldownDays, 3 + 2 * Math.max(0, weakCount - 1)));
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days));
}

/** How this attempt compares with the one before: the change overall and per topic. */
export function compareAttempts(cur: { percent: number; topics: TopicResult[] }, prev: { percent: number; topics: TopicResult[] } | null) {
  if (!prev) return null;
  const pt = new Map(prev.topics.map((t) => [t.topic, t.percent]));
  const topics = cur.topics.flatMap((t) => (pt.has(t.topic) ? [{ topic: t.topic, before: pt.get(t.topic)!, now: t.percent, change: t.percent - pt.get(t.topic)! }] : []));
  return { overallChange: Math.round((cur.percent - prev.percent) * 10) / 10, improved: topics.filter((t) => t.change >= 10).map((t) => t.topic), slipped: topics.filter((t) => t.change <= -10).map((t) => t.topic), topics };
}

/** The test to take next: one scheduled for the same category (or section) that the student has not done and that is open or coming, soonest first; otherwise a targeted practice. */
export function nextTest<T extends { id: string; title: string; category: string; startsAt: Date; endsAt: Date; taken: boolean; isPractice: boolean; kind?: string | null }>(cur: { category: string; kind?: string | null; scheduleId: string }, options: T[], now = new Date()) {
  const open = options.filter((s) => s.id !== cur.scheduleId && !s.taken && s.endsAt > now && (s.category === cur.category || (!!cur.kind && s.kind === cur.kind)));
  return open.sort((a, b) => Number(a.isPractice) - Number(b.isPractice) || a.startsAt.getTime() - b.startsAt.getTime())[0] ?? null;
}

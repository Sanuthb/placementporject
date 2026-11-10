/**
 * Pure rules for the group discussion and communication simulator: the kinds of session, curated topics, who the AI participants are, how long a session runs, simple
 * measurable facts about participation, and how the AI's evaluation is cleaned up and compared. No database, no AI.
 * Evaluation is of what was said in words. Nothing is inferred from voice, accent, pace of speech, face or appearance.
 */
export const KINDS = [["GD", "Group discussion"], ["DEBATE", "Debate"], ["PRESENTATION", "Presentation practice"]] as const;
export type Kind = (typeof KINDS)[number][0];
export const KIND_LABEL = Object.fromEntries(KINDS) as Record<Kind, string>;
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export const LANGUAGES = ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati"] as const;
export const DURATIONS = [5, 10, 15, 20] as const;
export const DOMAINS = [["GENERAL", "General"], ["TECHNOLOGY", "Technology"], ["BUSINESS", "Business and careers"], ["SOCIETY", "Campus and society"]] as const;
export type Domain = (typeof DOMAINS)[number][0];

/** Curated topics, so a student can always pick one even when the AI is off. They are deliberately neutral: no party politics, religion or caste. */
export const TOPICS: Record<Kind, Record<Domain, string[]>> = {
  GD: {
    GENERAL: ["Is a four-day work week better for employees and companies?", "Should students be allowed to use AI tools for assignments?", "Does social media help or hurt a student's focus?"],
    TECHNOLOGY: ["Will AI tools reduce entry-level jobs or create new ones?", "Should coding be a compulsory subject in every school?", "Is open-source software better for society than closed-source?"],
    BUSINESS: ["Startup or established company: which is better for a fresher?", "Are soft skills now more important than technical skills in hiring?", "Is the gig economy an opportunity or a risk for young workers?"],
    SOCIETY: ["Should internships be compulsory for every degree?", "Online learning versus classroom learning: which prepares students better?", "How can a campus become more sustainable?"],
  },
  DEBATE: {
    GENERAL: ["This house believes that homework should be abolished in colleges.", "This house believes that students learn more from failure than from success."],
    TECHNOLOGY: ["This house believes that remote work is better than office work for freshers.", "This house believes that AI should be allowed to grade student work."],
    BUSINESS: ["This house believes that companies should hire for attitude over skills.", "This house believes that job hopping is good for early careers."],
    SOCIETY: ["This house believes that attendance should not be mandatory in colleges.", "This house believes that exams should be replaced by projects."],
  },
  PRESENTATION: {
    GENERAL: ["Introduce yourself and your strongest project in two minutes.", "A challenge you solved and what you learned from it."],
    TECHNOLOGY: ["A technology that will change your field in five years.", "Explain a technical concept you know well to a non-technical audience."],
    BUSINESS: ["Why should a company hire a fresher like you?", "Pitch a small product or service for your campus."],
    SOCIETY: ["A cause or club on campus worth supporting, and why.", "A book, course or talk that changed how you think."],
  },
};
/** `n` curated topics for a kind, spread over the domain asked for (all domains when none), in a stable order from `seed`. */
export function suggestTopics(kind: Kind, domain: Domain | null, n = 5, seed = 0): string[] {
  const pool = (domain ? TOPICS[kind][domain] : Object.values(TOPICS[kind]).flat()).slice();
  const k = pool.length ? ((seed % pool.length) + pool.length) % pool.length : 0;
  return [...pool.slice(k), ...pool.slice(0, k)].slice(0, n);
}

/** Who the AI plays. Each has a distinct way of taking part, so a discussion has different voices and the student has to listen to respond. */
export const PERSONAS = [
  { name: "Priya", style: "data-driven: backs points with facts and examples" },
  { name: "Arjun", style: "sceptical: questions assumptions and asks for evidence" },
  { name: "Meera", style: "collaborative: builds on others' points and looks for common ground" },
  { name: "Karan", style: "practical: asks how it would work in real life" },
  { name: "Sana", style: "devil's advocate: argues the other side to test the argument" },
] as const;
export type Participant = { name: string; style: string };
/** The AI participants for a session. A group discussion has `count` of them (2 to 4); a debate has one opponent; a presentation has an audience of one questioner. */
export function pickParticipants(kind: Kind, count = 3): Participant[] {
  const n = kind === "GD" ? Math.min(4, Math.max(2, Math.round(count))) : 1;
  if (kind === "DEBATE") return [{ name: "Sana", style: PERSONAS[4].style }];
  if (kind === "PRESENTATION") return [{ name: "Arjun", style: "an audience member who asks one clear question at a time and listens to the answer" }];
  return PERSONAS.slice(0, n).map((p) => ({ name: p.name, style: p.style }));
}

export type Turn = { role: "student" | "ai"; speaker: string; text: string; voice?: boolean; kind?: "presentation" | "answer" };
/** How many contributions the student makes: about one every three minutes, 3 to 8. A presentation is one talk and two answers. */
export const contributionTarget = (kind: Kind, durationMin: number) => (kind === "PRESENTATION" ? 3 : Math.min(8, Math.max(3, Math.round(durationMin / 3))));
/** The session is timed: the chosen duration plus two minutes for the last contribution. */
export const deadlineOf = (startedAt: Date, durationMin: number) => new Date(startedAt.getTime() + (durationMin + 2) * 60_000);
export const isExpired = (startedAt: Date, durationMin: number, now = new Date()) => now > deadlineOf(startedAt, durationMin);
export const studentTurns = (t: Turn[]) => t.filter((x) => x.role === "student");
/** It is the student's turn when the last thing said was by an AI participant (the opening line counts), and not before. */
export const awaitingStudent = (t: Turn[]) => t.at(-1)?.role === "ai";
export const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** Who the AI participants should answer next: those who have spoken least recently, never the same one twice in a row, up to `max`. A debate always has its one opponent. */
export function nextSpeakers(turns: Turn[], participants: Participant[], max = 2): Participant[] {
  if (participants.length <= 1) return participants;
  const last = new Map<string, number>(); turns.forEach((t, i) => { if (t.role === "ai") last.set(t.speaker, i); });
  const lastSpeaker = [...turns].reverse().find((t) => t.role === "ai")?.speaker;
  return [...participants].sort((a, b) => (last.get(a.name) ?? -1) - (last.get(b.name) ?? -1)).filter((p) => p.name !== lastSpeaker).slice(0, Math.min(max, participants.length - 1));
}

/** Plain facts about how the student took part. These come from counting, not from the AI. */
export function participationStats(turns: Turn[]) {
  const mine = studentTurns(turns), theirs = turns.filter((t) => t.role === "ai");
  const mw = mine.reduce((a, t) => a + words(t.text), 0), aw = theirs.reduce((a, t) => a + words(t.text), 0);
  return { contributions: mine.length, studentWords: mw, aiWords: aw, sharePercent: mw + aw ? Math.round((mw / (mw + aw)) * 100) : 0, averageWords: mine.length ? Math.round(mw / mine.length) : 0, shortest: mine.length ? Math.min(...mine.map((t) => words(t.text))) : 0, longest: mine.length ? Math.max(...mine.map((t) => words(t.text))) : 0, spokenContributions: mine.filter((t) => t.voice).length };
}

/** What a kind of session is judged on. Listening applies where there are other speakers to listen to; a presentation is judged on handling the audience's questions instead. */
export const CRITERIA = [
  ["clarity", "Clarity of expression"], ["content", "Content and relevance"], ["structure", "Structure"], ["argument", "Quality of arguments and evidence"],
  ["listening", "Listening and response"], ["counterarguments", "Handling counterarguments"], ["questions", "Answering questions"], ["language", "Language and vocabulary"],
] as const;
export const CRITERIA_LABEL = Object.fromEntries(CRITERIA) as Record<string, string>;
export const criteriaFor = (kind: Kind): string[] => ({ GD: ["clarity", "content", "structure", "argument", "listening", "counterarguments", "language"], DEBATE: ["clarity", "content", "structure", "argument", "listening", "counterarguments", "language"], PRESENTATION: ["clarity", "content", "structure", "argument", "questions", "language"] }[kind]);

export type Category = { key: string; label: string; score: number; comment: string };
export type Evaluation = {
  summary: string; score: number; categories: Category[]; strengths: string[]; improvements: string[]
  perContribution: { excerpt: string; comment: string; better: string }[]; missedPoints: string[]; practice: string[]
};
const clamp10 = (n: unknown) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(10, Math.max(1, v)) : null; };
const strs = (v: unknown, max = 8) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 400)).slice(0, max) : []);

/** Turns whatever the model returned into a safe evaluation for this kind: only that kind's categories, each scored 1 to 10, an overall score kept within a point of their mean. */
export function cleanEvaluation(raw: unknown, kind: Kind): Evaluation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>, allowed = new Set(criteriaFor(kind));
  const categories: Category[] = [];
  for (const c of Array.isArray(r.categories) ? r.categories : []) {
    const o = c as Record<string, unknown>, key = String(o?.key ?? ""), s = clamp10(o?.score);
    if (!allowed.has(key) || s === null || Number(o.score) < 1 || categories.some((x) => x.key === key)) continue;
    categories.push({ key, label: CRITERIA_LABEL[key], score: s, comment: typeof o.comment === "string" ? o.comment.trim().slice(0, 400) : "" });
  }
  const mean = categories.length ? Math.round(categories.reduce((a, c) => a + c.score, 0) / categories.length) : null;
  let score = clamp10(r.score) ?? mean;
  if (score === null) return null;
  if (mean !== null && Math.abs(score - mean) > 1) score = mean;
  const per = (Array.isArray(r.perContribution) ? r.perContribution : []).flatMap((p) => { const o = p as Record<string, unknown>; return typeof o?.excerpt === "string" ? [{ excerpt: o.excerpt.slice(0, 300), comment: typeof o.comment === "string" ? o.comment.slice(0, 500) : "", better: typeof o.better === "string" ? o.better.slice(0, 800) : "" }] : []; }).slice(0, 10);
  return { summary: typeof r.summary === "string" ? r.summary.trim().slice(0, 800) : "", score, categories, strengths: strs(r.strengths), improvements: strs(r.improvements), perContribution: per, missedPoints: strs(r.missedPoints, 6), practice: strs(r.practice) };
}

/** How this session compares with the previous one of the same kind: the change overall and in each category both scored. */
export function compareSessions(cur: Pick<Evaluation, "score" | "categories">, prev: Pick<Evaluation, "score" | "categories"> | null) {
  if (!prev) return null;
  const p = new Map(prev.categories.map((c) => [c.key, c.score]));
  const categories = cur.categories.flatMap((c) => (p.has(c.key) ? [{ key: c.key, label: c.label, before: p.get(c.key)!, now: c.score, change: c.score - p.get(c.key)! }] : []));
  return { overallChange: cur.score - prev.score, improved: categories.filter((c) => c.change >= 1).map((c) => c.label), slipped: categories.filter((c) => c.change <= -1).map((c) => c.label), categories };
}

/** Pure rules for the mock interview engine: what an interview can be, how long it runs, how the AI's evaluation is cleaned up and compared. No database, no AI. */

export const INTERVIEW_TYPES = [
  ["HR", "HR"], ["TECHNICAL", "Technical"], ["DOMAIN", "Domain"], ["BEHAVIOURAL", "Behavioural"], ["MANAGERIAL", "Managerial"], ["SITUATIONAL", "Situational"], ["INTERNSHIP", "Internship"], ["COMPANY", "Company-specific"],
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number][0];
export const TYPE_LABEL = Object.fromEntries(INTERVIEW_TYPES) as Record<InterviewType, string>;
export const MODES = [["LEARNING", "Learning mode: hints and a better version of each answer"], ["ASSESSMENT", "Assessment mode: no hints, feedback only at the end"]] as const;
export type Mode = "LEARNING" | "ASSESSMENT";
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const LANGUAGES = ["English", "Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "Bengali", "Gujarati"] as const;
export const DURATIONS = [10, 15, 20, 30, 45] as const;

/** The nine things the SRS says an interview is judged on. Scores are 1 to 10; a category the interview gave no chance to show is left out, not scored zero. */
export const CRITERIA = [
  ["technical_accuracy", "Technical accuracy"], ["relevance", "Relevance"], ["clarity", "Clarity"], ["structure", "Answer structure"], ["communication", "Communication"],
  ["problem_solving", "Problem solving"], ["conceptual", "Conceptual understanding"], ["examples", "Practical examples"], ["behavioural", "Behavioural responses"],
] as const;
export const CRITERIA_LABEL = Object.fromEntries(CRITERIA) as Record<string, string>;

/** About four minutes an answer, between 3 and 10 questions. */
export const questionCountFor = (durationMin: number) => Math.min(10, Math.max(3, Math.round(durationMin / 4)));
/** Assessment mode is timed: the window is the chosen duration plus two minutes for the last answer. */
export const deadlineOf = (startedAt: Date, durationMin: number) => new Date(startedAt.getTime() + (durationMin + 2) * 60_000);
export const isExpired = (mode: string, startedAt: Date, durationMin: number, now = new Date()) => mode === "ASSESSMENT" && now > deadlineOf(startedAt, durationMin);

export type Turn = { role: "interviewer" | "student" | "coach"; text: string; kind?: "hint" | "improve"; voice?: boolean };
/** The conversation the interviewer model sees: the AI coach's notes are never part of it. */
export const conversation = (t: Turn[]) => t.filter((x) => x.role !== "coach");
export const askedCount = (t: Turn[]) => t.filter((x) => x.role === "interviewer").length;
export const answeredCount = (t: Turn[]) => t.filter((x) => x.role === "student").length;
/** Waiting for the student: the last turn that is not a coach note is a question. */
export const awaitingAnswer = (t: Turn[]) => conversation(t).at(-1)?.role === "interviewer";
export const currentQuestion = (t: Turn[]) => (awaitingAnswer(t) ? conversation(t).at(-1)!.text : null);

export type Category = { key: string; label: string; score: number; comment: string };
export type Feedback = {
  summary: string; score: number; categories: Category[]; strengths: string[]; improvements: string[]; technicalFeedback: string
  perAnswer: { question: string; comment: string; suggested: string }[]; practice: string[]
};

const clamp10 = (n: unknown) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(10, Math.max(1, v)) : null; };
const strs = (v: unknown, max = 8) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 400)).slice(0, max) : []);

/**
 * Turns whatever the model returned into a safe report. Categories must be known; a category scored 0 or missing is dropped. The overall score is the model's own when it gave one,
 * otherwise the mean of the categories, so a report never claims a score the categories do not support by more than a point.
 */
export function cleanFeedback(raw: unknown): Feedback | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const cats: Category[] = [];
  for (const c of Array.isArray(r.categories) ? r.categories : []) {
    const o = c as Record<string, unknown>; const key = String(o?.key ?? ""); const s = clamp10(o?.score);
    if (!CRITERIA_LABEL[key] || s === null || Number(o.score) < 1 || cats.some((x) => x.key === key)) continue;
    cats.push({ key, label: CRITERIA_LABEL[key], score: s, comment: typeof o.comment === "string" ? o.comment.trim().slice(0, 400) : "" });
  }
  const mean = cats.length ? Math.round(cats.reduce((a, c) => a + c.score, 0) / cats.length) : null;
  let score = clamp10(r.score) ?? mean;
  if (score === null) return null;
  if (mean !== null && Math.abs(score - mean) > 1) score = mean;
  const per = (Array.isArray(r.perAnswer) ? r.perAnswer : []).flatMap((p) => { const o = p as Record<string, unknown>; return typeof o?.question === "string" ? [{ question: o.question.slice(0, 600), comment: typeof o.comment === "string" ? o.comment.slice(0, 600) : "", suggested: typeof o.suggested === "string" ? o.suggested.slice(0, 1200) : "" }] : []; }).slice(0, 12);
  return { summary: typeof r.summary === "string" ? r.summary.trim().slice(0, 800) : "", score, categories: cats, strengths: strs(r.strengths), improvements: strs(r.improvements), technicalFeedback: typeof r.technicalFeedback === "string" ? r.technicalFeedback.trim().slice(0, 1500) : "", perAnswer: per, practice: strs(r.practice) };
}

/** How this attempt compares with the one before it (same type): the change overall and in each category both reports scored. */
export function compareInterviews(cur: Pick<Feedback, "score" | "categories">, prev: Pick<Feedback, "score" | "categories"> | null) {
  if (!prev) return null;
  const p = new Map(prev.categories.map((c) => [c.key, c.score]));
  const categories = cur.categories.flatMap((c) => (p.has(c.key) ? [{ key: c.key, label: c.label, before: p.get(c.key)!, now: c.score, change: c.score - p.get(c.key)! }] : []));
  return { overallChange: cur.score - prev.score, improved: categories.filter((c) => c.change >= 1).map((c) => c.label), slipped: categories.filter((c) => c.change <= -1).map((c) => c.label), categories };
}

/** The weakest categories (below 6), lowest first, for the practice advice and the staff view. */
export const weakCategories = (f: Pick<Feedback, "categories">, limit = 3) => [...f.categories].filter((c) => c.score < 6).sort((a, b) => a.score - b.score).slice(0, limit);

export type Assignment = { targetStudentIds: string[]; targetDepartmentIds: string[]; targetBatchIds: string[] };
/** Whether an assigned interview is meant for this student. */
export const assignedTo = (a: Assignment, me: { studentId: string; departmentId: string; batchId: string }) =>
  a.targetStudentIds.length ? a.targetStudentIds.includes(me.studentId) : (!a.targetDepartmentIds.length || a.targetDepartmentIds.includes(me.departmentId)) && (!a.targetBatchIds.length || a.targetBatchIds.includes(me.batchId));

/** What the interviewer is told about the job, from an approved JD. Only role-relevant text goes in; the length is capped. */
export function jdBrief(jd: { title: string; companyName: string; data: unknown }) {
  const d = (jd.data ?? {}) as { requirements?: { text?: string; level?: string }[]; description?: string };
  const reqs = (d.requirements ?? []).filter((r) => typeof r?.text === "string");
  const must = reqs.filter((r) => r.level === "MANDATORY").map((r) => r.text!).slice(0, 12), nice = reqs.filter((r) => r.level !== "MANDATORY").map((r) => r.text!).slice(0, 8);
  return [`Job: ${jd.title} at ${jd.companyName}`, must.length ? `Must have: ${must.join("; ")}` : "", nice.length ? `Good to have: ${nice.join("; ")}` : "", d.description ? `About the job: ${d.description.slice(0, 800)}` : ""].filter(Boolean).join("\n");
}

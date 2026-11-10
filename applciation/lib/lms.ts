import { z } from "zod";

/** Pure course rules: quiz marking, progress, when a course can be published, who is falling behind. No database here. */

export const LESSON_TYPES = ["VIDEO", "DOCUMENT", "LINK", "TEXT", "ASSIGNMENT", "QUIZ", "LIVE"] as const;
export type LessonKind = (typeof LESSON_TYPES)[number];

/** Files staff may attach to a lesson. Checked from the file's bytes, not its name. */
export const COURSE_FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "video/mp4", "video/webm"] as const;
export const COURSE_DOC_MAX = 10 * 1024 * 1024;
export const COURSE_VIDEO_MAX = 50 * 1024 * 1024;
export const STALLED_AFTER_DAYS = 14;

export const questionSchema = z.object({
  text: z.string().trim().min(3).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  correct: z.number().int().min(0),
  explanation: z.string().trim().max(1000).optional(),
}).refine((q) => q.correct < q.options.length, { message: "The correct answer must be one of the options", path: ["correct"] })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, { message: "Two options are the same", path: ["options"] });
export type Question = z.infer<typeof questionSchema>;

export const questionsOf = (json: unknown): Question[] => (Array.isArray(json) ? json.flatMap((q) => { const r = questionSchema.safeParse(q); return r.success ? [r.data] : [] }) : []);

/** The same questions without the answers, for the student taking the quiz. */
export const hideAnswers = (qs: Question[]) => qs.map((q) => ({ text: q.text, options: q.options }));

/** Marks one attempt. `answers[i]` is the option chosen for question i, or null when skipped. Extra or missing entries count as skipped. */
export function scoreQuiz(qs: Question[], answers: (number | null)[], passPercent: number) {
  const perQuestion = qs.map((q, i) => ({ chosen: answers[i] ?? null, correct: answers[i] === q.correct }));
  const score = perQuestion.filter((p) => p.correct).length;
  const total = qs.length;
  const percent = total ? Math.round((score / total) * 100) : 0;
  return { score, total, percent, passed: total > 0 && percent >= passPercent, perQuestion };
}

/** Whether a student may start another attempt. maxAttempts null = no limit. */
export const attemptsLeft = (maxAttempts: number | null, used: number) => (maxAttempts === null ? null : Math.max(0, maxAttempts - used));

export type LessonShape = {
  id: string; type: string; title: string; required: boolean; url?: string | null; filePath?: string | null; body?: string | null;
  questions?: unknown; passPercent?: number | null; startsAt?: Date | null; maxMarks?: number | null;
};

/** What stops a course from being published. An empty list means it is ready. */
export function publishProblems(lessons: LessonShape[]): string[] {
  const out: string[] = [];
  if (lessons.length === 0) return ["Add at least one lesson"];
  if (!lessons.some((l) => l.required)) out.push("At least one lesson must be required, or nobody can finish the course");
  for (const l of lessons) {
    const t = `"${l.title}"`;
    if (l.type === "VIDEO" && !l.url && !l.filePath) out.push(`${t} needs a video link or an uploaded video`);
    if (l.type === "DOCUMENT" && !l.url && !l.filePath) out.push(`${t} needs a document link or an uploaded file`);
    if (l.type === "LINK" && !l.url) out.push(`${t} needs a link`);
    if (l.type === "TEXT" && !l.body?.trim()) out.push(`${t} has no text`);
    if (l.type === "ASSIGNMENT" && !l.body?.trim()) out.push(`${t} needs instructions`);
    if (l.type === "LIVE" && (!l.startsAt || !l.url)) out.push(`${t} needs a start time and a meeting link`);
    if (l.type === "QUIZ") {
      if (questionsOf(l.questions).length === 0) out.push(`${t} has no questions`);
      if (l.passPercent == null) out.push(`${t} needs a pass mark`);
    }
  }
  return out;
}

/** Progress counted over the required lessons (or over all of them when none is marked required). */
export function courseProgress(lessons: { id: string; required: boolean }[], done: ReadonlySet<string>) {
  const counted = lessons.some((l) => l.required) ? lessons.filter((l) => l.required) : lessons;
  const finished = counted.filter((l) => done.has(l.id)).length;
  return { done: finished, total: counted.length, percent: counted.length ? Math.round((finished / counted.length) * 100) : 0, complete: counted.length > 0 && finished === counted.length };
}

/** The first lesson, in course order, that is not finished yet. */
export const nextLesson = <T extends { id: string }>(ordered: T[], done: ReadonlySet<string>) => ordered.find((l) => !done.has(l.id)) ?? null;

export type Engagement = "COMPLETED" | "NOT_STARTED" | "ACTIVE" | "STALLED";
/** Where one enrolment stands. Stalled = started but nothing for two weeks. */
export function engagement(e: { complete: boolean; done: number; lastActivityAt: Date; enrolledAt: Date }, now = new Date()): Engagement {
  if (e.complete) return "COMPLETED";
  const idleDays = (now.getTime() - e.lastActivityAt.getTime()) / 86_400_000;
  if (e.done === 0) return (now.getTime() - e.enrolledAt.getTime()) / 86_400_000 > STALLED_AFTER_DAYS ? "STALLED" : "NOT_STARTED";
  return idleDays > STALLED_AFTER_DAYS ? "STALLED" : "ACTIVE";
}

/** Questions most students get wrong, from every student's latest attempt. Questions asked fewer than `minAnswers` times are left out as too small to judge. */
export function questionGaps(qs: Question[], latestAnswers: (number | null)[][], minAnswers = 3) {
  return qs.map((q, i) => {
    const asked = latestAnswers.length;
    const wrong = latestAnswers.filter((a) => a[i] !== q.correct).length;
    return { index: i, text: q.text, asked, wrongPercent: asked ? Math.round((wrong / asked) * 100) : 0 };
  }).filter((g) => g.asked >= minAnswers).sort((a, b) => b.wrongPercent - a.wrongPercent);
}

export const certificateSerial = (year: number, rand: string) => `CRS-${year}-${rand.toUpperCase()}`;

/** A video or document file's real type from its first bytes. */
export function sniffMedia(b: Uint8Array): "video/mp4" | "video/webm" | null {
  const s = Buffer.from(b.subarray(0, 12));
  if (s.subarray(4, 8).toString("latin1") === "ftyp") return "video/mp4";
  if (s[0] === 0x1a && s[1] === 0x45 && s[2] === 0xdf && s[3] === 0xa3) return "video/webm";
  return null;
}

/** Marks must be a whole number from 0 up to the assignment's maximum. */
export const marksValid = (marks: number, max: number | null | undefined) => Number.isInteger(marks) && marks >= 0 && marks <= (max ?? 100);

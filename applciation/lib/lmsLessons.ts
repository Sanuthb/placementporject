import { z } from "zod";
import { LESSON_TYPES, questionSchema } from "@/lib/lms";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";

const text = (n: number) => z.string().trim().max(n);
export const lessonFields = z.object({
  type: z.enum(LESSON_TYPES),
  title: text(200).min(2),
  body: text(20000).nullish(),
  url: z.url().max(1000).nullish(),
  downloadable: z.boolean(),
  required: z.boolean(),
  maxMarks: z.number().int().min(1).max(1000).nullish(),
  dueAt: z.coerce.date().nullish(),
  startsAt: z.coerce.date().nullish(),
  durationMin: z.number().int().min(5).max(600).nullish(),
  passPercent: z.number().int().min(1).max(100).nullish(),
  maxAttempts: z.number().int().min(1).max(20).nullish(),
  questions: z.array(questionSchema).max(50).nullish(),
});

export const createLesson = lessonFields.partial({ downloadable: true, required: true }).extend({ moduleId: z.uuid() });
export const patchLesson = lessonFields.omit({ type: true }).partial().extend({ move: z.enum(["up", "down"]).optional(), moduleId: z.uuid().optional() });

/** Only the settings that belong to a lesson's type are kept, so a quiz never carries an assignment's due date. */
export function cleanFor(type: string, v: Partial<z.infer<typeof lessonFields>>) {
  const keep = <K extends keyof typeof v>(...ks: K[]) => Object.fromEntries(ks.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]));
  const common = keep("title", "required");
  switch (type) {
    case "VIDEO": case "DOCUMENT": return { ...common, ...keep("body", "url", "downloadable") };
    case "LINK": return { ...common, ...keep("body", "url") };
    case "TEXT": return { ...common, ...keep("body") };
    case "ASSIGNMENT": return { ...common, ...keep("body", "maxMarks", "dueAt") };
    case "QUIZ": return { ...common, ...keep("body", "passPercent", "maxAttempts", "questions") };
    case "LIVE": return { ...common, ...keep("body", "url", "startsAt", "durationMin") };
    default: return common;
  }
}

/** True when students have already done something in the lesson, so deleting it or changing its questions would lose their work. */
export async function lessonInUse(lessonId: string) {
  const [p, a, s] = await Promise.all([db.lessonProgress.count({ where: { lessonId } }), db.quizAttempt.count({ where: { lessonId } }), db.assignmentSubmission.count({ where: { lessonId } })]);
  return p + a + s > 0;
}

export function assertTypeFields(type: string, merged: { url?: string | null; startsAt?: Date | null }) {
  if (type === "LINK" && !merged.url) throw badRequest("A link lesson needs a link");
}

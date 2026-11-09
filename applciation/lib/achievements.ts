import { z } from "zod";

/** Kinds of achievement a student can record. Labels are what students and staff see. */
export const ACHIEVEMENT_CATEGORIES = [
  ["ACADEMIC", "Academic award or rank"],
  ["COMPETITION", "Competition or hackathon"],
  ["CERTIFICATION", "Certification"],
  ["PUBLICATION", "Paper or publication"],
  ["SPORTS", "Sports"],
  ["CULTURAL", "Cultural"],
  ["LEADERSHIP", "Leadership or volunteering"],
  ["OTHER", "Other"],
] as const;
export const ACHIEVEMENT_LEVELS = [
  ["INSTITUTION", "Institution"],
  ["UNIVERSITY", "University"],
  ["STATE", "State"],
  ["NATIONAL", "National"],
  ["INTERNATIONAL", "International"],
] as const;
export const MAX_ACHIEVEMENTS = 30;

const keys = <T extends readonly (readonly [string, string])[]>(xs: T) => xs.map(([k]) => k) as [T[number][0], ...T[number][0][]];
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/** One achievement. A date in the future is refused: an achievement is something that already happened. */
export const achievementItem = z.object({
  title: z.string().trim().min(3, "Give the achievement a title (3+ characters)").max(150),
  category: z.enum(keys(ACHIEVEMENT_CATEGORIES), { message: "Choose a category" }),
  level: z.enum(keys(ACHIEVEMENT_LEVELS)).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2025-03-14").refine((d) => !Number.isNaN(Date.parse(d)) && Date.parse(d) <= Date.now() + 86_400_000, "The date cannot be in the future"),
  issuer: optText(150),
  position: optText(60),
  description: optText(1000),
  link: z.string().trim().url("Use a full link starting with https://").max(500).refine((u) => /^https?:\/\//i.test(u), "Use a full link starting with https://").optional().or(z.literal("").transform(() => undefined)),
});
export type Achievement = z.infer<typeof achievementItem>;

/**
 * The ACHIEVEMENTS section. Same shape as other list sections (`{ achievements: [...] }`) so the existing editor, review screen, resume and
 * showcase can read it. Duplicate entries (same title and date) are refused so a student cannot pad the list.
 */
export const achievementsSection = z.looseObject({
  achievements: z.array(achievementItem).max(MAX_ACHIEVEMENTS, `At most ${MAX_ACHIEVEMENTS} achievements`).default([]),
}).superRefine((v, ctx) => {
  const seen = new Set<string>();
  v.achievements.forEach((a, i) => {
    const k = `${a.title.toLowerCase()}|${a.date}`;
    if (seen.has(k)) ctx.addIssue({ code: "custom", path: ["achievements", i, "title"], message: `"${a.title}" on ${a.date} is listed twice` });
    seen.add(k);
  });
});

/** Achievements newest first, for the resume and the public showcase. */
export function sortedAchievements(data: unknown): Achievement[] {
  const r = achievementsSection.safeParse(data ?? {});
  return r.success ? [...r.data.achievements].sort((a, b) => b.date.localeCompare(a.date)) : [];
}

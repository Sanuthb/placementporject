/** Picks courses a student is likely to need, from their own roadmap goal and assessment results. Pure: no database, no AI. */

/** Words that tie an assessment area to what a course is about. */
export const AREA_TERMS: Record<string, string[]> = {
  aptitude: ["aptitude", "quantitative", "reasoning", "logical", "numerical"],
  technical: ["programming", "coding", "technical", "data structures", "algorithm", "sql", "database"],
  digital: ["digital", "computer", "excel", "office", "spreadsheet"],
  communication: ["communication", "english", "speaking", "writing", "soft skills", "interview"],
  teamwork: ["teamwork", "leadership", "team", "collaboration"],
};
const AREA_NAME: Record<string, string> = { aptitude: "aptitude", technical: "technical", digital: "digital literacy", communication: "communication", teamwork: "teamwork" };
const STOP = new Set(["with", "and", "the", "for", "senior", "junior", "lead", "manager", "engineer", "developer", "analyst", "officer", "executive", "associate", "intern", "that", "from", "into", "want", "work"]);

export type Want = { term: string; weight: number; why: string };
export type CourseLite = { id: string; title: string; summary: string | null; category: string | null; skills: string[] };

/** What the student needs, as words to look for with a weight and the reason to show. Weak assessment areas count most. */
export function wants(o: { targetRole?: string | null; careerGoal?: string | null; improveAreas: string[] }): Want[] {
  const out: Want[] = [];
  for (const a of o.improveAreas) for (const t of AREA_TERMS[a] ?? []) out.push({ term: t, weight: 3, why: `Helps with your ${AREA_NAME[a] ?? a} result` });
  const words = (s?: string | null) => (s ?? "").toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  for (const w of words(o.targetRole)) out.push({ term: w, weight: 2, why: `Matches your target role: ${o.targetRole!.trim()}` });
  for (const w of words(o.careerGoal)) out.push({ term: w, weight: 1, why: "Matches your career goal" });
  return out;
}

/** Courses ordered by how well they match, each with up to three reasons. Courses that match nothing are left out. */
export function rankCourses(courses: CourseLite[], w: Want[], limit = 6) {
  return courses.flatMap((c) => {
    const hay = [c.title, c.summary, c.category, ...c.skills].filter(Boolean).join(" ").toLowerCase();
    const hits = new Map<string, number>(); // reason -> weight, counted once
    for (const x of w) if (hay.includes(x.term) && !hits.has(x.why)) hits.set(x.why, x.weight);
    if (!hits.size) return [];
    return [{ id: c.id, score: [...hits.values()].reduce((a, b) => a + b, 0), why: [...hits.keys()].slice(0, 3) }];
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

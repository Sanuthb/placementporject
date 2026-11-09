import type { Recommendation } from "@/lib/careerRecommendations";
import { RIASEC_ROLES } from "@/lib/instruments/riasec";
import type { Category } from "@/lib/roadmap";

/**
 * Turns assessment results into things a student might add to their roadmap. Nothing is added automatically: the student decides.
 * Each suggestion carries the reason it was made, so the student can see which result it came from.
 */
export type SuggestedMilestone = { key: string; title: string; description: string; category: Category; semester: number; why: string };

const SKILL_TITLE: Record<string, { title: string; category: Category }> = {
  aptitude: { title: "Raise your aptitude score to 60% or more", category: "SKILL" },
  technical: { title: "Raise your technical assessment score to 60% or more", category: "SKILL" },
  digital: { title: "Raise your digital literacy score to 60% or more", category: "SKILL" },
  communication: { title: "Improve your communication score to 60% or more", category: "SKILL" },
  teamwork: { title: "Practise teamwork and leadership in a group project", category: "PERSONAL" },
};

/** Improvement and strength-building suggestions from the student's own recommendations, skipping anything already on the roadmap. */
export function suggestMilestones(recs: Recommendation[], existingKeys: Iterable<string>, currentSemester: number, totalSemesters: number): SuggestedMilestone[] {
  const have = new Set(existingKeys);
  const target = Math.min(Math.max(1, currentSemester), Math.max(1, totalSemesters));
  const out: SuggestedMilestone[] = [];
  for (const r of recs) {
    if (r.kind !== "improve") continue;
    const area = r.id.split(":")[1], meta = SKILL_TITLE[area];
    if (!meta) continue;
    const key = `rec:${r.id}`;
    if (have.has(key)) continue;
    out.push({ key, title: meta.title, description: r.action, category: meta.category, semester: target, why: r.why });
  }
  return out;
}

export const RIASEC_NAME: Record<string, string> = { R: "Realistic", I: "Investigative", A: "Artistic", S: "Social", E: "Enterprising", C: "Conventional" };

/** Roles to consider as a target: first from the student's own stated preferences, then from their strongest interest types. */
export function suggestRoles(o: { riasecRanking: string[] | null; preferredRoles: string[] }): { role: string; from: string }[] {
  const out: { role: string; from: string }[] = [];
  const seen = new Set<string>();
  const add = (role: string, from: string) => { const k = role.trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push({ role: role.trim(), from }); } };
  for (const r of o.preferredRoles) add(r, "You listed it as a preferred role");
  for (const k of (o.riasecRanking ?? []).slice(0, 3)) for (const role of RIASEC_ROLES[k] ?? []) add(role, `Fits your ${RIASEC_NAME[k]} interests`);
  return out.slice(0, 12);
}

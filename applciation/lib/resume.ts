import type { ProfileSection } from "@/generated/prisma/client";

export type SectionData = Partial<Record<ProfileSection, Record<string, unknown> | undefined>>;

/** Reads a list from `{ key: [...] }` or from a section that is itself a list. */
export function listOf(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) return data;
  const v = (data as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(v) ? v : [];
}
const text = (v: unknown) => (typeof v === "string" ? v : "");
const nonEmpty = (d: unknown) => !!d && typeof d === "object" && Object.keys(d as object).length > 0;
const STOP = new Set("with that this from have been were will your their about which also into over such than then them these those only more most some very when what where while using used build built work worked".split(" "));

export type ResumeCheck = { key: string; label: string; weight: number; ok: boolean; hint: string };

/** Scores how complete a student's resume material is and lists what to improve. Expects RESUME data like `{ text, summary, url }`. */
export function analyzeResume(student: { email: string; phone: string | null }, sections: SectionData, resumeVerified: boolean) {
  const resume = sections.RESUME ?? {};
  const body = [text(resume.text), text(resume.summary)].join(" ").trim();
  const skills = listOf(sections.SKILLS, "skills");
  const checks: ResumeCheck[] = [
    { key: "resume", label: "Resume provided", weight: 20, ok: !!(body || text(resume.url) || text(resume.fileName)), hint: "Upload a resume or paste its text." },
    { key: "verified", label: "Resume verified by staff", weight: 10, ok: resumeVerified, hint: "Submit the resume section for verification." },
    { key: "contact", label: "Email and phone present", weight: 10, ok: !!student.email && !!student.phone, hint: "Add a phone number to the profile." },
    { key: "summary", label: "Professional summary (50+ characters)", weight: 10, ok: body.length >= 50, hint: "Write a short summary of strengths and goals." },
    { key: "skills", label: "At least 5 skills", weight: 15, ok: skills.length >= 5, hint: "List more technical and soft skills." },
    { key: "projects", label: "At least 2 projects", weight: 15, ok: listOf(sections.PROJECTS, "projects").length >= 2, hint: "Add projects with what you built and the tools used." },
    { key: "internships", label: "At least 1 internship", weight: 10, ok: listOf(sections.INTERNSHIPS, "internships").length >= 1, hint: "Add internships or training, even short ones." },
    { key: "education", label: "Education history", weight: 5, ok: nonEmpty(sections.EDUCATION_HISTORY), hint: "Fill in the education history section." },
    { key: "academics", label: "Academics on record", weight: 5, ok: nonEmpty(sections.ACADEMICS), hint: "Complete and submit academics." },
  ];
  const score = checks.filter((c) => c.ok).reduce((a, c) => a + c.weight, 0);
  const skillNames = skills.map((x) => text(typeof x === "object" && x ? (x as { name?: unknown }).name : x).trim()).filter(Boolean);
  const freq = new Map<string, number>();
  for (const w of body.toLowerCase().match(/[a-z][a-z+#.]{3,}/g) ?? []) if (!STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const fromText = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
  return {
    score, ready: score >= 70 && resumeVerified,
    checks: checks.map(({ key, label, ok, weight }) => ({ key, label, ok, weight })),
    improvements: checks.filter((c) => !c.ok).map((c) => c.hint),
    keywords: [...new Set([...skillNames.map((k) => k.toLowerCase()), ...fromText])].slice(0, 20),
  };
}

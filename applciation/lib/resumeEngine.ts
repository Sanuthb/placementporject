/**
 * The resume engine, pure: the master career profile built from every source, the evidence behind each skill, the document each resume type makes from it,
 * and what changed since a resume was approved. No database and no AI here.
 */

export type EvidenceType = "VERIFIED" | "PROJECT" | "COURSE" | "INTERNSHIP" | "ASSESSMENT" | "ACHIEVEMENT";
export type Evidence = { type: EvidenceType; label: string };
/** VERIFIED: staff checked the student's skills list. EVIDENCED: college records back it (a project, course, internship, assessment or achievement). CLAIMED: only the student says so. */
export type SkillLevel = "VERIFIED" | "EVIDENCED" | "CLAIMED";
export type MasterSkill = { name: string; level: SkillLevel; evidence: Evidence[] };

export type MasterProject = { key: string; title: string; description: string; skills: string[]; role: string | null; teammates: string[]; repo: string | null; link: string | null; resultPercent: number | null; source: "PROFILE" | "COLLEGE"; verified: boolean };
export type MasterInternship = { key: string; company: string; role: string; period: string; description: string; certificateVerified: boolean; preplacementOffer: boolean; source: "PROFILE" | "COLLEGE"; verified: boolean };
export type MasterCourse = { key: string; title: string; completedOn: string; serial: string | null };
export type MasterAchievement = { key: string; title: string; category: string; level: string | null; date: string; issuer: string | null; position: string | null; description: string; verified: boolean };
export type MasterEducation = { key: string; heading: string; sub: string; date: string; bullets: string[]; verified: boolean };
export type MasterProfile = {
  identity: { name: string; email: string; phone: string | null; department: string; batch: string; enrollmentNo: string; programme: string | null; college: string };
  summary: { text: string; verified: boolean } | null;
  education: MasterEducation[]; skills: MasterSkill[]; projects: MasterProject[]; internships: MasterInternship[]; courses: MasterCourse[]; achievements: MasterAchievement[];
  assessments: { key: string; label: string; percent: number }[];
};

export type Sections = Partial<Record<string, { status: string; data: Record<string, unknown> } | undefined>>;
export type Inputs = {
  student: { name: string; email: string; phone: string | null; department: string; batch: string; enrollmentNo: string; programme: string | null; college: string };
  sections: Sections;
  collegeProjects: { key: string; title: string; problem: string; summary: string | null; skills: string[]; role: string | null; teammates: string[]; repo: string | null; resultPercent: number | null }[];
  collegeInternships: { key: string; company: string; role: string; from: string; to: string; certificateVerified: boolean; preplacementOffer: boolean }[];
  courses: { key: string; title: string; skills: string[]; completedOn: string; serial: string | null }[];
  /** Only categories fit for a resume (never personality or interests). Best result per paper. */
  assessments: { key: string; title: string; percent: number }[];
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const words = (s: string) => s.toLowerCase().match(/[a-z0-9][a-z0-9+#.]*/g) ?? [];
/** Whether `skill` appears in `text` as its own word or phrase (so "C" does not match "cat"). */
export const mentions = (text: string, skill: string) => { const s = skill.trim().toLowerCase(); return s.length > 0 && new RegExp(`(^|[^a-z0-9+#])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9+#])`).test(text.toLowerCase()); };

/** Skills from `{ skills: [...] }`, a plain list, or a comma-separated string. */
export function skillList(data: unknown): string[] {
  const d = Array.isArray(data) ? data : obj(data).skills ?? data;
  const raw = typeof d === "string" ? d.split(",") : arr(d).map((x) => (typeof x === "string" ? x : str(obj(x).name)));
  const seen = new Set<string>();
  return raw.map((x) => String(x).trim()).filter((x) => x && x.length <= 40 && !seen.has(x.toLowerCase()) && !!seen.add(x.toLowerCase()));
}

export const LEVEL_RANK: Record<SkillLevel, number> = { VERIFIED: 0, EVIDENCED: 1, CLAIMED: 2 };

/** Builds the master profile. Everything a resume can say starts here; nothing is copied, so it is always as current as the records. */
export function buildMaster(i: Inputs): MasterProfile {
  const sec = (n: string) => i.sections[n];
  const ok = (n: string) => sec(n)?.status === "VERIFIED";

  // projects: college records win over a self-listed project with the same title
  const mine = arr(obj(sec("PROJECTS")?.data).projects ?? sec("PROJECTS")?.data).map(obj).filter((p) => str(p.title));
  const projects: MasterProject[] = i.collegeProjects.map((p) => ({ key: `project:c:${p.key}`, title: p.title, description: p.summary ?? p.problem, skills: p.skills, role: p.role, teammates: p.teammates, repo: p.repo, link: null, resultPercent: p.resultPercent, source: "COLLEGE", verified: true }));
  mine.forEach((p, n) => {
    const title = str(p.title), tools = skillList(str(p.tools)), twin = projects.find((x) => same(x.title, title));
    if (twin) { twin.skills = [...new Set([...twin.skills, ...tools])]; twin.link = twin.link ?? (str(p.link) || null); return; }
    projects.push({ key: `project:p${n}:${slug(title)}`, title, description: str(p.description), skills: tools, role: null, teammates: [], repo: null, link: str(p.link) || null, resultPercent: null, source: "PROFILE", verified: ok("PROJECTS") });
  });

  const myInterns = arr(obj(sec("INTERNSHIPS")?.data).internships ?? sec("INTERNSHIPS")?.data).map(obj).filter((x) => str(x.company) || str(x.role));
  const internships: MasterInternship[] = i.collegeInternships.map((x) => ({ key: `internship:c:${x.key}`, company: x.company, role: x.role, period: `${x.from} to ${x.to}`, description: "", certificateVerified: x.certificateVerified, preplacementOffer: x.preplacementOffer, source: "COLLEGE", verified: true }));
  myInterns.forEach((x, n) => {
    const company = str(x.company), role = str(x.role);
    if (internships.some((c) => same(c.company, company) && (!role || same(c.role, role)))) return;
    internships.push({ key: `internship:s${n}:${slug(company + role)}`, company, role, period: str(x.duration), description: str(x.description), certificateVerified: false, preplacementOffer: false, source: "PROFILE", verified: ok("INTERNSHIPS") });
  });

  const achievements: MasterAchievement[] = arr(obj(sec("ACHIEVEMENTS")?.data).achievements).map(obj).filter((a) => str(a.title)).map((a) => ({ key: `achievement:${slug(str(a.title))}-${str(a.date)}`, title: str(a.title), category: str(a.category), level: str(a.level) || null, date: str(a.date), issuer: str(a.issuer) || null, position: str(a.position) || null, description: str(a.description), verified: ok("ACHIEVEMENTS") })).sort((a, b) => b.date.localeCompare(a.date));

  const courses: MasterCourse[] = i.courses.map((c) => ({ key: `course:${c.key}`, title: c.title, completedOn: c.completedOn, serial: c.serial }));

  // skills and the evidence behind each
  const skillsOk = ok("SKILLS");
  const map = new Map<string, MasterSkill>();
  const get = (name: string) => { const k = name.toLowerCase(); return map.get(k) ?? (map.set(k, { name, level: "CLAIMED", evidence: [] }), map.get(k)!); };
  for (const n of skillList(sec("SKILLS")?.data)) { const s = get(n); if (skillsOk) s.evidence.push({ type: "VERIFIED", label: "Checked by the placement office" }); }
  for (const p of projects) for (const n of p.skills) { const s = get(n); if (!s.evidence.some((e) => e.label === p.title)) s.evidence.push({ type: "PROJECT", label: p.title }); }
  for (const c of i.courses) for (const n of c.skills) { const s = get(n); s.evidence.push({ type: "COURSE", label: c.title }); }
  for (const x of internships) if (x.source === "COLLEGE" || x.verified) for (const s of map.values()) if (mentions(`${x.role} ${x.description}`, s.name)) s.evidence.push({ type: "INTERNSHIP", label: `${x.role} at ${x.company}` });
  for (const a of i.assessments) if (a.percent >= 60) for (const s of map.values()) if (mentions(a.title, s.name)) s.evidence.push({ type: "ASSESSMENT", label: `${a.title}: ${Math.round(a.percent)}%` });
  for (const a of achievements) if (a.verified) for (const s of map.values()) if (mentions(`${a.title} ${a.description}`, s.name)) s.evidence.push({ type: "ACHIEVEMENT", label: a.title });
  const skills = [...map.values()].map((s) => ({ ...s, level: (s.evidence.some((e) => e.type === "VERIFIED") ? "VERIFIED" : s.evidence.length ? "EVIDENCED" : "CLAIMED") as SkillLevel }))
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.evidence.length - a.evidence.length || a.name.localeCompare(b.name));

  // education
  const edu: MasterEducation[] = [];
  const ac = obj(sec("ACADEMICS")?.data);
  const cg = typeof ac.cgpa === "number" ? ac.cgpa : Number(ac.cgpa);
  edu.push({ key: "education:current", heading: i.student.programme ?? i.student.department, sub: i.student.college, date: i.student.batch, bullets: Number.isFinite(cg) && cg > 0 ? [`CGPA: ${cg}`] : [], verified: ok("ACADEMICS") });
  arr(obj(sec("EDUCATION_HISTORY")?.data).history).map(obj).forEach((h, n) => {
    const q = str(h.qualification) || str(h.level);
    if (!q && !str(h.institution)) return;
    const pct = typeof h.percentage === "number" ? `${h.percentage}%` : str(h.percentage);
    edu.push({ key: `education:h${n}`, heading: q, sub: [str(h.institution), str(h.board)].filter(Boolean).join(", "), date: str(h.year), bullets: pct ? [`Score: ${pct}`] : [], verified: ok("EDUCATION_HISTORY") });
  });

  const text = str(obj(sec("RESUME")?.data).summary);
  return {
    identity: { ...i.student }, summary: text ? { text, verified: ok("RESUME") } : null, education: edu, skills, projects, internships, courses, achievements,
    assessments: i.assessments.map((a) => ({ key: `assessment:${a.key}`, label: a.title, percent: Math.round(a.percent) })).sort((a, b) => b.percent - a.percent),
  };
}

// ---- keywords and tailoring ----
const STOP = new Set("with that this from have been were will your their about which also into over such than then them these those only more most some very when what where while using used build built work worked should must able strong good experience years year team role company candidate looking required preferred ability skills knowledge understanding responsibilities requirements".split(" "));
/** The meaningful words of a job description or a list of skills, most frequent first. */
export function keywordsOf(text: string, limit = 40): string[] {
  const freq = new Map<string, number>();
  for (const w of words(text)) { const t = w.replace(/^[.+#]+|[.]+$/g, ""); if ((t.length >= 3 || /^(c|r|go)$/.test(t) || ["c++", "c#"].includes(t)) && !STOP.has(t) && !/^\d+$/.test(t)) freq.set(t, (freq.get(t) ?? 0) + 1); }
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([w]) => w);
}
const hits = (text: string, kw: string[]) => kw.filter((k) => mentions(text, k)).length;

// ---- templates (named here so screens can list them without loading the PDF and Word writers) ----
export const TEMPLATES = ["ATS", "CLASSIC", "MODERN", "COMPACT"] as const;
export type Template = (typeof TEMPLATES)[number];
export const TEMPLATE_LABEL: Record<Template, string> = { ATS: "Plain (best for online applications)", CLASSIC: "Classic", MODERN: "Modern (college colour)", COMPACT: "Compact (fits more on a page)" };

// ---- resume kinds ----
export const KINDS = ["MASTER", "TECHNICAL", "MANAGEMENT", "INTERNSHIP", "FRESHER", "PROJECT_BASED", "COMPANY_SPECIFIC"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { MASTER: "Master resume (everything)", TECHNICAL: "Technical resume", MANAGEMENT: "Management resume", INTERNSHIP: "Internship resume", FRESHER: "Fresher resume", PROJECT_BASED: "Project-based resume", COMPANY_SPECIFIC: "Company-specific resume" };
export type SectionId = "summary" | "education" | "skills" | "projects" | "internships" | "courses" | "achievements" | "assessments";
type Layout = { order: SectionId[]; caps: Partial<Record<SectionId, number>>; bullets: number; softSkillsFirst?: boolean };
const BIG = 99;
export const LAYOUT: Record<Kind, Layout> = {
  MASTER: { order: ["summary", "education", "skills", "projects", "internships", "courses", "achievements", "assessments"], caps: {}, bullets: 4 },
  TECHNICAL: { order: ["summary", "skills", "projects", "internships", "education", "courses", "achievements", "assessments"], caps: { projects: 5, internships: 3, achievements: 4, courses: 6, assessments: 3 }, bullets: 3 },
  MANAGEMENT: { order: ["summary", "education", "internships", "achievements", "projects", "skills", "courses"], caps: { projects: 3, achievements: 6, courses: 4 }, bullets: 3, softSkillsFirst: true },
  INTERNSHIP: { order: ["summary", "education", "skills", "projects", "courses", "achievements", "internships"], caps: { projects: 4, courses: 6, achievements: 4 }, bullets: 3 },
  FRESHER: { order: ["education", "summary", "skills", "projects", "internships", "achievements", "courses"], caps: { projects: 4, internships: 2, achievements: 5, courses: 5 }, bullets: 3 },
  PROJECT_BASED: { order: ["summary", "projects", "skills", "education", "internships", "achievements"], caps: { projects: 8, internships: 2, achievements: 3 }, bullets: 5 },
  COMPANY_SPECIFIC: { order: ["summary", "skills", "projects", "internships", "education", "courses", "achievements"], caps: { projects: 4, internships: 3, achievements: 3, courses: 4 }, bullets: 3 },
};
const SOFT = new Set(["communication", "leadership", "teamwork", "management", "problem solving", "time management", "critical thinking", "presentation", "negotiation", "collaboration", "adaptability", "public speaking"]);
const SECTION_TITLE: Record<SectionId, string> = { summary: "Summary", education: "Education", skills: "Skills", projects: "Projects", internships: "Internships", courses: "Courses completed", achievements: "Achievements and certifications", assessments: "Assessments" };

// ---- the document ----
export type DocItem = { key: string; heading: string; sub?: string; date?: string; bullets: string[]; link?: string };
export type DocSection = { id: SectionId; title: string; text?: string; items?: DocItem[]; skills?: { name: string; backed: boolean }[] };
export type ResumeDoc = { name: string; contact: string[]; headline: string | null; sections: DocSection[]; evidenceNote: boolean };
export type Edits = { summary?: string; headline?: string; hide?: string[]; text?: Record<string, string> };
export type Options = { kind: Kind; target?: { company?: string; role?: string; text?: string }; edits?: Edits; claims?: "ALL" | "VERIFIED_ONLY"; markEvidence?: boolean };

const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 2);
const bullets = (t: string, n: number) => sentences(t).slice(0, n).map((s) => s.replace(/^[-•*]\s*/, ""));

/** What a plain, factual summary says when the student wrote none. Built only from the profile, so it cannot claim anything the records do not support. */
export function factSummary(m: MasterProfile): string {
  const top = m.skills.filter((s) => s.level !== "CLAIMED").slice(0, 5).map((s) => s.name);
  const parts = [`${m.identity.programme ?? m.identity.department} student (${m.identity.batch}) at ${m.identity.college}.`];
  if (top.length) parts.push(`Skills backed by college records include ${top.join(", ")}.`);
  const done = [m.projects.length && `${m.projects.length} project${m.projects.length === 1 ? "" : "s"}`, m.internships.length && `${m.internships.length} internship${m.internships.length === 1 ? "" : "s"}`, m.courses.length && `${m.courses.length} completed course${m.courses.length === 1 ? "" : "s"}`].filter(Boolean);
  if (done.length) parts.push(`Has completed ${done.join(", ")}.`);
  return parts.join(" ");
}

/**
 * The document for one resume: which sections, in which order, how much of each, with the target's keywords moving relevant skills and projects first.
 * Items the student hid are left out and their own edited wording replaces the generated text. With VERIFIED_ONLY, anything staff have not checked and
 * the college's records do not back is left out.
 */
export function composeDoc(m: MasterProfile, o: Options): ResumeDoc {
  const L = LAYOUT[o.kind], e = o.edits ?? {}, hidden = new Set(e.hide ?? []), verifiedOnly = o.claims === "VERIFIED_ONLY";
  const kw = o.kind === "COMPANY_SPECIFIC" || o.target?.text || o.target?.role ? keywordsOf([o.target?.text ?? "", o.target?.role ?? "", o.target?.company ?? ""].join(" ")) : [];
  const edit = (key: string, fallback: string) => e.text?.[key]?.trim() || fallback;
  const keep = <T extends { key: string; verified?: boolean }>(xs: T[]) => xs.filter((x) => !hidden.has(x.key) && (!verifiedOnly || x.verified !== false));
  const cap = (id: SectionId, n: number) => Math.min(n, L.caps[id] ?? BIG);
  const relevance = (text: string) => (kw.length ? hits(text, kw) : 0);
  const sections: DocSection[] = [];

  for (const id of L.order) {
    if (id === "summary") {
      const text = e.summary?.trim() || (m.summary && (!verifiedOnly || m.summary.verified) ? m.summary.text : verifiedOnly ? "" : factSummary(m));
      if (text) sections.push({ id, title: SECTION_TITLE[id], text });
    } else if (id === "education") {
      const items = keep(m.education).map((x) => ({ key: x.key, heading: x.heading, sub: x.sub, date: x.date, bullets: x.bullets }));
      if (items.length) sections.push({ id, title: SECTION_TITLE[id], items });
    } else if (id === "skills") {
      let sk = m.skills.filter((s) => !hidden.has(`skill:${s.name.toLowerCase()}`) && (!verifiedOnly || s.level !== "CLAIMED"));
      sk = [...sk].sort((a, b) => (L.softSkillsFirst ? Number(SOFT.has(b.name.toLowerCase())) - Number(SOFT.has(a.name.toLowerCase())) : 0) || (kw.length ? Number(kw.some((k) => mentions(b.name, k) || mentions(k, b.name))) - Number(kw.some((k) => mentions(a.name, k) || mentions(k, a.name))) : 0) || LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
      if (sk.length) sections.push({ id, title: SECTION_TITLE[id], skills: sk.slice(0, 30).map((s) => ({ name: s.name, backed: s.level !== "CLAIMED" })) });
    } else if (id === "projects") {
      const xs = keep(m.projects).sort((a, b) => relevance(`${b.title} ${b.description} ${b.skills.join(" ")}`) - relevance(`${a.title} ${a.description} ${a.skills.join(" ")}`) || Number(b.source === "COLLEGE") - Number(a.source === "COLLEGE"));
      const items = xs.slice(0, cap(id, 12)).map((p) => ({ key: p.key, heading: p.title, sub: [p.role, p.teammates.length ? `team of ${p.teammates.length + 1}` : ""].filter(Boolean).join(", ") || undefined, link: p.repo ?? p.link ?? undefined,
        bullets: [...bullets(edit(p.key, p.description), L.bullets), ...(p.skills.length ? [`Tools: ${p.skills.slice(0, 8).join(", ")}`] : []), ...(p.resultPercent !== null ? [`College evaluation: ${p.resultPercent}%`] : [])] }));
      if (items.length) sections.push({ id, title: SECTION_TITLE[id], items });
    } else if (id === "internships") {
      const xs = keep(m.internships).sort((a, b) => relevance(`${b.role} ${b.description}`) - relevance(`${a.role} ${a.description}`));
      const items = xs.slice(0, cap(id, 10)).map((x) => ({ key: x.key, heading: x.role || x.company, sub: x.role ? x.company : undefined, date: x.period, bullets: [...bullets(edit(x.key, x.description), L.bullets), ...(x.certificateVerified ? ["Completion certificate verified by the college"] : []), ...(x.preplacementOffer ? ["Received a pre-placement offer"] : [])] }));
      if (items.length) sections.push({ id, title: SECTION_TITLE[id], items });
    } else if (id === "courses") {
      const items = keep(m.courses.map((c) => ({ ...c, verified: true }))).slice(0, cap(id, 12)).map((c) => ({ key: c.key, heading: c.title, date: c.completedOn.slice(0, 10), bullets: c.serial ? [`Certificate ${c.serial}`] : [] }));
      if (items.length) sections.push({ id, title: SECTION_TITLE[id], items });
    } else if (id === "achievements") {
      const rank = (a: MasterAchievement) => (o.kind === "MANAGEMENT" ? Number(a.category === "LEADERSHIP") * 2 : 0) + (o.kind === "TECHNICAL" ? Number(a.category === "COMPETITION" || a.category === "CERTIFICATION" || a.category === "PUBLICATION") : 0);
      const xs = keep(m.achievements).sort((a, b) => rank(b) - rank(a) || b.date.localeCompare(a.date));
      const items = xs.slice(0, cap(id, 12)).map((a) => ({ key: a.key, heading: a.title, sub: [a.position, a.issuer, a.level ? a.level.toLowerCase() : ""].filter(Boolean).join(", ") || undefined, date: a.date.slice(0, 7), bullets: bullets(edit(a.key, a.description), 2) }));
      if (items.length) sections.push({ id, title: SECTION_TITLE[id], items });
    } else if (id === "assessments") {
      const keepA = m.assessments.filter((a) => !hidden.has(a.key)).slice(0, cap(id, 5));
      if (keepA.length) sections.push({ id, title: SECTION_TITLE[id], items: keepA.map((a) => ({ key: a.key, heading: a.label, bullets: [`Score: ${a.percent}%`] })) });
    }
  }
  const role = o.target?.role?.trim(), company = o.target?.company?.trim();
  return {
    name: m.identity.name, contact: [m.identity.email, m.identity.phone ?? "", `${m.identity.department}, ${m.identity.batch}`].filter(Boolean),
    headline: e.headline?.trim() || (o.kind === "COMPANY_SPECIFIC" && role ? `Application for ${role}${company ? ` at ${company}` : ""}` : null),
    sections, evidenceNote: !!o.markEvidence && sections.some((s) => s.skills?.some((k) => k.backed)),
  };
}

// ---- what changed since a resume was approved ----
export function profileKeys(m: MasterProfile): { key: string; label: string }[] {
  return [
    ...m.skills.map((s) => ({ key: `skill:${s.name.toLowerCase()}`, label: `Skill: ${s.name}` })), ...m.projects.map((p) => ({ key: p.key, label: `Project: ${p.title}` })), ...m.internships.map((x) => ({ key: x.key, label: `Internship: ${x.role || x.company}` })),
    ...m.courses.map((c) => ({ key: c.key, label: `Course: ${c.title}` })), ...m.achievements.map((a) => ({ key: a.key, label: `Achievement: ${a.title}` })),
  ];
}
/** New items in the profile that an approved resume does not know about, so the student can be told to update it. */
export function drift(saved: string[], m: MasterProfile) {
  const had = new Set(saved);
  const now = profileKeys(m);
  return { added: now.filter((x) => !had.has(x.key)), removed: saved.filter((k) => !now.some((x) => x.key === k)).length };
}

// ---- AI suggestions must not add facts ----
/** Numbers and capitalised names that a suggestion contains but the source facts do not. An empty list means it added nothing new. */
export function newFacts(suggestion: string, source: string): string[] {
  const src = source.toLowerCase();
  const out = new Set<string>();
  for (const n of suggestion.match(/\d[\d,.]*%?/g) ?? []) if (!src.includes(n.toLowerCase().replace(/[.,]$/, ""))) out.add(n);
  for (const m of suggestion.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][A-Za-z0-9+#.]{2,})\b/g)) if (!src.includes(m[1].toLowerCase())) out.add(m[1]);
  return [...out];
}

/** The facts the AI may use for a suggestion: the doc as plain text. */
export function docText(d: ResumeDoc): string {
  return d.sections.flatMap((s) => [s.text ?? "", ...(s.skills?.map((k) => k.name) ?? []), ...(s.items?.flatMap((i) => [i.heading, i.sub ?? "", ...i.bullets]) ?? [])]).join("\n");
}

export function atsWarnings(d: ResumeDoc, template: string): string[] {
  const w: string[] = [];
  if (!d.sections.some((s) => s.id === "skills")) w.push("Add a skills section: recruiter software looks for it.");
  if (!d.contact.some((c) => c.includes("@"))) w.push("Your email is missing from the contact line.");
  if (!d.sections.some((s) => s.id === "education")) w.push("Add your education.");
  const bulletCount = d.sections.flatMap((s) => s.items ?? []).reduce((a, i) => a + i.bullets.length, 0);
  if (bulletCount > 60) w.push("The resume is long. Recruiters read a page or two: hide older or less relevant items.");
  if (template !== "ATS") w.push("This template uses styling. For online application forms, the plain ATS template is safest.");
  return w;
}

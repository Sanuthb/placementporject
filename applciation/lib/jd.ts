import { z } from "zod";

/**
 * Pure job-description rules: the structured shape of a JD, cleaning what the AI extracted (and checking it against the document), matching branch names
 * to the college's departments, what must be settled before a JD can be approved, and what it gives a drive. No database and no AI here.
 */

export const JOB_TYPES = ["FULL_TIME", "INTERNSHIP", "INTERNSHIP_WITH_OFFER"] as const;
export const REQ_KINDS = ["SKILL", "QUALIFICATION", "EXPERIENCE", "COMMUNICATION", "OTHER"] as const;
export const REQ_LABEL: Record<(typeof REQ_KINDS)[number], string> = { SKILL: "Skill", QUALIFICATION: "Qualification", EXPERIENCE: "Experience", COMMUNICATION: "Communication", OTHER: "Other" };
export const SCORE_AREAS = ["skills", "qualification", "experience", "assessments", "communication"] as const;
export const DEFAULT_SCORING: Record<(typeof SCORE_AREAS)[number], number> = { skills: 40, qualification: 15, experience: 20, assessments: 15, communication: 10 };

const pct = z.number().min(0).max(100).nullable();
export const requirement = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(REQ_KINDS),
  text: z.string().trim().min(2).max(300),
  level: z.enum(["MANDATORY", "PREFERRED"]),
  weight: z.number().int().min(1).max(10),
  /** The words in the document this came from (only for AI-extracted items). */
  quote: z.string().max(400).optional(),
  /** True while a person still has to look at it: the AI could not point to where the document says it. Editing or confirming clears it. */
  needsCheck: z.boolean().default(false),
});
export type Requirement = z.infer<typeof requirement>;

export const jdData = z.object({
  title: z.string().trim().max(150),
  company: z.string().trim().max(200),
  description: z.string().trim().max(12000),
  jobType: z.enum(JOB_TYPES).nullable(),
  location: z.string().trim().max(200).nullable(),
  salaryMinLpa: z.number().min(0).max(1000).nullable(),
  salaryMaxLpa: z.number().min(0).max(1000).nullable(),
  experienceText: z.string().trim().max(300).nullable(),
  requirements: z.array(requirement).max(60),
  eligibility: z.object({
    minCgpa: z.number().min(0).max(10).nullable(), minTenthPct: pct, minTwelfthPct: pct, maxActiveBacklogs: z.number().int().min(0).max(50).nullable(),
    departmentIds: z.array(z.uuid()).max(100), programIds: z.array(z.uuid()).max(100), batchIds: z.array(z.uuid()).max(100), allowPlaced: z.boolean(),
    /** Branches exactly as the document names them, kept so the reviewer can match them to the college's departments. */
    branchesAsStated: z.array(z.string().max(120)).max(30),
  }),
  selectionProcess: z.array(z.string().trim().min(2).max(100)).max(12),
  scoring: z.object({ skills: z.number().int().min(0).max(100), qualification: z.number().int().min(0).max(100), experience: z.number().int().min(0).max(100), assessments: z.number().int().min(0).max(100), communication: z.number().int().min(0).max(100) }),
  other: z.string().trim().max(2000).nullable(),
});
export type JdData = z.infer<typeof jdData>;

export const blankJd = (o: { title?: string; company?: string; description?: string } = {}): JdData => ({
  title: o.title ?? "", company: o.company ?? "", description: o.description ?? "", jobType: null, location: null, salaryMinLpa: null, salaryMaxLpa: null, experienceText: null, requirements: [],
  eligibility: { minCgpa: null, minTenthPct: null, minTwelfthPct: null, maxActiveBacklogs: null, departmentIds: [], programIds: [], batchIds: [], allowPlaced: false, branchesAsStated: [] },
  selectionProcess: [], scoring: { ...DEFAULT_SCORING }, other: null,
});

// ---- checking the AI against the document ----
const squash = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9+#.%'"-]+/g, " ").trim();
/** Whether `quote` really appears in the document (ignoring case, spacing and punctuation). Very short quotes never count: they match anything. */
export function groundedIn(quote: string | undefined, text: string): boolean {
  const q = squash(quote ?? "");
  return q.length >= 6 && squash(text).includes(q);
}

const num = (v: unknown, lo: number, hi: number) => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[^0-9.]/g, "")) : NaN; return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const list = (v: unknown, max: number, each: number) => (Array.isArray(v) ? [...new Set(v.map((x) => text(x, each)).filter((x): x is string => !!x))].slice(0, max) : []);
const mapType = (v: unknown) => { const s = String(v ?? "").toUpperCase().replace(/[^A-Z]+/g, "_"); return (JOB_TYPES as readonly string[]).includes(s) ? (s as (typeof JOB_TYPES)[number]) : /PPO|PRE_?PLACEMENT/.test(s) || /INTERN.*(OFFER|FTE|FULL)/.test(s) ? "INTERNSHIP_WITH_OFFER" : /INTERN/.test(s) ? "INTERNSHIP" : /FULL|PERMANENT|FTE/.test(s) ? "FULL_TIME" : null; };

/** What the model returned, turned into a JD the reviewer can edit. Numbers outside sensible ranges are dropped, every requirement is checked against the document, and items the document does not back are flagged for a person to look at. */
export function normalizeExtraction(raw: unknown, source: string): { data: JdData; notes: string[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const notes: string[] = [];
  const d = blankJd({ title: text(r.title, 150) ?? "", company: text(r.company, 200) ?? "", description: text(r.description, 12000) ?? "" });
  d.jobType = mapType(r.jobType); d.location = text(r.location, 200); d.experienceText = text(r.experience, 300); d.other = text(r.otherRequirements, 2000);
  d.salaryMinLpa = num(r.salaryMinLpa, 0, 1000); d.salaryMaxLpa = num(r.salaryMaxLpa, 0, 1000);
  if (d.salaryMinLpa !== null && d.salaryMaxLpa !== null && d.salaryMinLpa > d.salaryMaxLpa) { [d.salaryMinLpa, d.salaryMaxLpa] = [d.salaryMaxLpa, d.salaryMinLpa]; notes.push("The salary range was the wrong way round and was swapped."); }
  const el = (r.eligibility && typeof r.eligibility === "object" ? r.eligibility : {}) as Record<string, unknown>;
  d.eligibility.minCgpa = num(el.minCgpa, 0, 10); d.eligibility.minTenthPct = num(el.minTenthPct, 0, 100); d.eligibility.minTwelfthPct = num(el.minTwelfthPct, 0, 100);
  const bl = num(el.maxActiveBacklogs, 0, 50); d.eligibility.maxActiveBacklogs = bl === null ? null : Math.floor(bl);
  d.eligibility.branchesAsStated = list(el.branches, 30, 120);
  d.selectionProcess = list(r.selectionProcess, 12, 100);

  const seen = new Set<string>();
  const reqs = Array.isArray(r.requirements) ? r.requirements : [];
  reqs.forEach((x, i) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const t = text(o.text, 300);
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    const kind = (REQ_KINDS as readonly string[]).includes(String(o.kind)) ? (String(o.kind) as Requirement["kind"]) : "OTHER";
    const quote = text(o.quote, 400) ?? undefined;
    const grounded = groundedIn(quote, source);
    d.requirements.push({ id: `r${i + 1}`, kind, text: t, level: String(o.level).toUpperCase() === "PREFERRED" ? "PREFERRED" : "MANDATORY", weight: 5, quote, needsCheck: !grounded });
  });
  const flagged = d.requirements.filter((x) => x.needsCheck).length;
  if (flagged) notes.push(`${flagged} requirement${flagged === 1 ? "" : "s"} could not be found word for word in the document. Check ${flagged === 1 ? "it" : "them"} before approving.`);
  const stated = [["CGPA", d.eligibility.minCgpa, el.minCgpaQuote], ["10th marks", d.eligibility.minTenthPct, el.minTenthQuote], ["12th marks", d.eligibility.minTwelfthPct, el.minTwelfthQuote], ["backlog limit", d.eligibility.maxActiveBacklogs, el.backlogQuote]] as const;
  for (const [label, value, quote] of stated) if (value !== null && !groundedIn(typeof quote === "string" ? quote : undefined, source)) notes.push(`The ${label} rule (${value}) is not clearly stated in the document. Check it.`);
  return { data: d, notes };
}

// ---- matching branch names to the college ----
const strip = (s: string) => s.toLowerCase().replace(/\b(department|dept|of|and|&|engineering|technology|science|sciences|studies|branch|in)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const ABBR: Record<string, string> = { cse: "computer", cs: "computer", it: "information", ece: "electronics", eee: "electrical", mech: "mechanical", civil: "civil", mca: "computer applications", bca: "computer applications", mba: "business", bba: "business", ai: "artificial intelligence", aiml: "artificial intelligence", ds: "data" };
/** Which of the college's options a name from a document most likely means. Names that match nothing are returned so a person can decide. */
export function matchNames(names: string[], options: { id: string; name: string; code?: string | null }[]) {
  const ids = new Set<string>(), unmatched: string[] = [];
  for (const n of names) {
    const raw = n.toLowerCase().trim(), key = strip(n);
    // The most exact kind of match wins: the college's own code, then the name, then a common abbreviation (only when it points to one department).
    const byCode = options.filter((o) => (o.code ?? "").toLowerCase() === raw);
    const byName = key ? options.filter((o) => { const on = strip(o.name); return on === key || on.includes(key) || key.includes(on); }) : [];
    const ex = ABBR[raw] ? strip(ABBR[raw]) : "";
    const byAbbr = ex ? options.filter((o) => strip(o.name).includes(ex)) : [];
    const hit = byCode.length ? byCode : byName.length ? byName : byAbbr.length === 1 ? byAbbr : [];
    if (hit.length) hit.slice(0, 3).forEach((h) => ids.add(h.id)); else unmatched.push(n);
  }
  return { ids: [...ids], unmatched };
}

// ---- review ----
export function scoringProblem(s: JdData["scoring"]): string | null {
  const sum = SCORE_AREAS.reduce((a, k) => a + s[k], 0);
  return sum === 100 ? null : `The scoring weights add up to ${sum}. They must add up to 100.`;
}

/** What must be settled before a JD can be approved. An empty list means it can. */
export function reviewProblems(d: JdData): string[] {
  const out: string[] = [];
  if (d.title.trim().length < 2) out.push("Add the job title");
  if (d.company.trim().length < 2) out.push("Add the company");
  if (d.description.trim().length < 30) out.push("Add the job description (at least 30 characters)");
  if (!d.jobType) out.push("Choose the employment type");
  if (d.requirements.length === 0) out.push("Add at least one requirement, so students and the matching engine know what the job needs");
  const unchecked = d.requirements.filter((r) => r.needsCheck).length;
  if (unchecked) out.push(`${unchecked} extracted requirement${unchecked === 1 ? "" : "s"} still need${unchecked === 1 ? "s" : ""} checking against the document`);
  const w = scoringProblem(d.scoring);
  if (w) out.push(w);
  if (d.salaryMinLpa !== null && d.salaryMaxLpa !== null && d.salaryMinLpa > d.salaryMaxLpa) out.push("The lowest salary is more than the highest");
  if (d.eligibility.branchesAsStated.length && !d.eligibility.departmentIds.length && !d.eligibility.programIds.length) out.push("The document names branches. Match them to your departments, or clear them");
  return out;
}

/** Each requirement's share of its area's score: mandatory items count double a preferred one of the same weight. Used by the matching engine. */
export function requirementShares(d: JdData) {
  const by = new Map<string, Requirement[]>();
  for (const r of d.requirements) by.set(r.kind, [...(by.get(r.kind) ?? []), r]);
  return d.requirements.map((r) => {
    const group = by.get(r.kind)!;
    const w = (x: Requirement) => x.weight * (x.level === "MANDATORY" ? 2 : 1);
    return { id: r.id, kind: r.kind, level: r.level, share: Math.round((w(r) / group.reduce((a, x) => a + w(x), 0)) * 1000) / 10 };
  });
}

/** Round types for the names a document uses ("Online test", "Technical interview", "HR round"). */
export function roundTypeOf(name: string): "APTITUDE" | "CODING" | "GROUP_DISCUSSION" | "TECHNICAL" | "HR" | "OTHER" {
  const n = name.toLowerCase();
  if (/\b(gd|group discussion)\b/.test(n)) return "GROUP_DISCUSSION";
  if (/(aptitude|reasoning|quantitative|verbal|online test|screening test)/.test(n)) return "APTITUDE";
  if (/(coding|programming|hackerrank|machine test|assessment)/.test(n)) return "CODING";
  if (/\bhr\b|human resources|managerial|cultural/.test(n)) return "HR";
  if (/(technical|tech interview|domain)/.test(n)) return "TECHNICAL";
  return "OTHER";
}

/** What a JD gives a new drive. The company, dates and venue come from the person creating the drive. */
export function driveFromJd(d: JdData) {
  const e = d.eligibility;
  return {
    role: d.title, jobType: d.jobType ?? "FULL_TIME", location: d.location ?? undefined, packageMinLpa: d.salaryMinLpa ?? undefined, packageMaxLpa: d.salaryMaxLpa ?? undefined, description: d.description,
    minCgpa: e.minCgpa ?? undefined, minTenthPct: e.minTenthPct ?? undefined, minTwelfthPct: e.minTwelfthPct ?? undefined, maxActiveBacklogs: e.maxActiveBacklogs ?? undefined,
    departmentIds: e.departmentIds, programIds: e.programIds, batchIds: e.batchIds, allowPlaced: e.allowPlaced,
    rounds: d.selectionProcess.map((n) => ({ type: roundTypeOf(n), name: n })),
  };
}

/** What students see of an approved JD: the requirements and rules, not the reviewer's notes or the extraction. */
export function publicView(d: JdData) {
  return {
    title: d.title, company: d.company, description: d.description, jobType: d.jobType, location: d.location, salaryMinLpa: d.salaryMinLpa, salaryMaxLpa: d.salaryMaxLpa, experience: d.experienceText, selectionProcess: d.selectionProcess,
    mandatory: d.requirements.filter((r) => r.level === "MANDATORY").map((r) => ({ kind: r.kind, text: r.text })), preferred: d.requirements.filter((r) => r.level === "PREFERRED").map((r) => ({ kind: r.kind, text: r.text })),
    minCgpa: d.eligibility.minCgpa, maxActiveBacklogs: d.eligibility.maxActiveBacklogs, other: d.other,
  };
}

// ---- reading an uploaded file ----
export const JD_MAX_CHARS = 30000;
export const cleanText = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
/** Text out of a Word document's XML (paragraphs and line breaks kept). */
export function docxXmlText(xml: string): string {
  return cleanText(xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
}

// ---- the review workflow ----
export type JdState = "DRAFT" | "IN_REVIEW" | "APPROVED" | "ARCHIVED";
export type JdAction = "SUBMIT" | "APPROVE" | "REJECT" | "REOPEN" | "ARCHIVE";
/**
 * A JD is published only after an authorised person approves it. Staff send a draft for review; only the placement admin approves (and may approve a draft
 * directly), rejects it back to draft with a reason, or reopens an approved one (not once its drive is live). Returns the new state or a message.
 */
export function nextJdState(current: JdState, action: JdAction, o: { admin: boolean; problems: string[]; driveLive: boolean; note?: string }): { state: JdState } | { error: string } {
  switch (action) {
    case "SUBMIT": return current === "DRAFT" ? (o.problems.length ? { error: `Not ready for review: ${o.problems[0]}` } : { state: "IN_REVIEW" }) : { error: "Only a draft can be sent for review" };
    case "APPROVE":
      if (!o.admin) return { error: "Only the placement admin can approve a job description" };
      if (current !== "DRAFT" && current !== "IN_REVIEW") return { error: "Only a draft or a job description in review can be approved" };
      return o.problems.length ? { error: `Cannot approve yet: ${o.problems[0]}` } : { state: "APPROVED" };
    case "REJECT":
      if (!o.admin) return { error: "Only the placement admin can send a job description back" };
      if (current !== "IN_REVIEW") return { error: "Only a job description in review can be sent back" };
      return (o.note ?? "").trim().length >= 3 ? { state: "DRAFT" } : { error: "Say what needs to change" };
    case "REOPEN":
      if (!o.admin) return { error: "Only the placement admin can reopen an approved job description" };
      if (current !== "APPROVED") return { error: "Only an approved job description can be reopened" };
      return o.driveLive ? { error: "Its drive is already published, so it cannot be reopened" } : { state: "DRAFT" };
    case "ARCHIVE": return current === "ARCHIVED" ? { error: "Already archived" } : o.driveLive ? { error: "Its drive is published. Close or cancel the drive first" } : { state: "ARCHIVED" };
  }
}

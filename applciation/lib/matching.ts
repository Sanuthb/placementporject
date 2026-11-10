import { MATCH_LABEL, MATCH_PARAMS, type JdData, type MatchParam, type Requirement } from "@/lib/jd";
import { mentions, type MasterProfile } from "@/lib/resumeEngine";

/**
 * Candidate matching, pure. For one student and one approved job description it works out, separately: the mandatory criteria (met, partly met, missing, or unknown),
 * and a 0-100 match score from the college's weights, with the evidence behind every part. Eligibility is decided elsewhere and is never mixed into the score.
 * Only evidence from the student's profile and the college's own records is used: personality and interest results never enter, and a skill the student merely
 * claims counts for less than one a project, course, assessment or staff check supports. Every result carries a plain explanation built from that evidence.
 */

// ---- skill names ----
const ALIAS: Record<string, string> = {
  js: "javascript", ts: "typescript", reactjs: "react", "react.js": "react", node: "node.js", nodejs: "node.js", postgres: "postgresql", mongo: "mongodb", "ms excel": "excel", "microsoft excel": "excel",
  "power-bi": "power bi", powerbi: "power bi", ml: "machine learning", ai: "artificial intelligence", py: "python", cpp: "c++", "c plus plus": "c++", "c sharp": "c#", k8s: "kubernetes", html5: "html", css3: "css",
  "google sheets": "spreadsheet", spreadsheets: "spreadsheet", "sql server": "sql", mssql: "sql", "rest api": "rest", restful: "rest", "problem-solving": "problem solving",
};
export const canon = (s: string) => { const t = s.toLowerCase().trim().replace(/[()]/g, " ").replace(/\s+/g, " "); return ALIAS[t] ?? t; };
const RELATED: string[][] = [["tableau", "power bi", "looker", "qlik"], ["react", "angular", "vue", "svelte"], ["python", "r"], ["aws", "azure", "gcp"], ["javascript", "typescript"], ["excel", "spreadsheet"], ["docker", "kubernetes"], ["sql", "mysql", "postgresql", "sqlite", "oracle"], ["java", "kotlin"], ["django", "flask", "fastapi"], ["pandas", "numpy"]];
const related = (a: string, b: string) => a !== b && RELATED.some((g) => g.includes(a) && g.includes(b));

export const CREDIT = { backed: 1, text: 0.6, claimed: 0.5, related: 0.4 } as const;
export type Status = "MET" | "PARTIAL" | "MISSING" | "UNKNOWN";
export type ReqResult = { id: string; kind: string; level: "MANDATORY" | "PREFERRED"; text: string; status: Status; credit: number; evidence: string[]; note?: string };

const statusOf = (credit: number): Status => (credit >= 0.9 ? "MET" : credit > 0 ? "PARTIAL" : "MISSING");
const STOP = new Set("the and for with from of in a an to or at on by is are be as good strong knowledge understanding experience skills ability basic working proficiency proficient familiarity must have should preferred required degree bachelor master batch year years".split(" "));

function skillMatch(req: Requirement, m: MasterProfile): { credit: number; evidence: string[]; note?: string } {
  const want = canon(req.text);
  let best: { credit: number; evidence: string[]; note?: string } = { credit: 0, evidence: [] };
  const take = (credit: number, evidence: string[], note?: string) => { if (credit > best.credit) best = { credit, evidence, note }; };
  for (const s of m.skills) {
    const have = canon(s.name);
    const same = have === want || mentions(want, have) || mentions(have, want);
    if (same) { if (s.level === "CLAIMED") take(CREDIT.claimed, ["Listed by the student, with nothing backing it yet"], "Claimed only"); else take(CREDIT.backed, s.evidence.map((e) => e.label)); }
    else if (related(have, want) && s.level !== "CLAIMED") take(CREDIT.related, [`${s.name} (a related skill)`], `Has ${s.name}, which is related`);
  }
  if (best.credit < CREDIT.text) {
    const texts = [...m.projects.map((p) => ({ label: `Project: ${p.title}`, t: `${p.title} ${p.description}` })), ...m.internships.map((i) => ({ label: `Internship: ${i.role} at ${i.company}`, t: `${i.role} ${i.description}` }))];
    const hit = texts.filter((x) => mentions(x.t, want));
    if (hit.length) take(CREDIT.text, hit.slice(0, 3).map((x) => x.label), "Mentioned in the student's own descriptions");
  }
  return best;
}

const tokens = (s: string) => s.toLowerCase().match(/[a-z][a-z0-9+#.]*|\d+/g)?.filter((w) => !STOP.has(w) && !/^\d{4}$/.test(w) && w.length >= 2) ?? [];
function qualificationMatch(req: Requirement, m: MasterProfile): { status: Status; credit: number; evidence: string[]; note?: string } {
  const t = req.text, a = m.academics, low = t.toLowerCase();
  const num = /(\d+(?:\.\d+)?)/.exec(t)?.[1];
  const need = num ? Number(num) : null;
  const unverified = { status: "UNKNOWN" as Status, credit: 0, evidence: [], note: "Academic details are not verified by staff yet" };
  if (/cgpa|\bgpa\b|sgpa/.test(low) && need !== null) return a.cgpa === null || !a.verified ? unverified : a.cgpa >= need ? { status: "MET", credit: 1, evidence: [`CGPA ${a.cgpa} (verified)`] } : { status: "MISSING", credit: 0, evidence: [`CGPA ${a.cgpa} (verified)`], note: `Needs ${need}` };
  if (/10th|tenth|sslc|\bssc\b/.test(low) && need !== null) return a.tenthPct === null || !a.verified ? unverified : a.tenthPct >= need ? { status: "MET", credit: 1, evidence: [`10th: ${a.tenthPct}% (verified)`] } : { status: "MISSING", credit: 0, evidence: [`10th: ${a.tenthPct}% (verified)`], note: `Needs ${need}%` };
  if (/12th|twelfth|\bpuc\b|\bhsc\b/.test(low) && need !== null) return a.twelfthPct === null || !a.verified ? unverified : a.twelfthPct >= need ? { status: "MET", credit: 1, evidence: [`12th: ${a.twelfthPct}% (verified)`] } : { status: "MISSING", credit: 0, evidence: [`12th: ${a.twelfthPct}% (verified)`], note: `Needs ${need}%` };
  if (/backlog/.test(low)) return a.activeBacklogs === null || !a.verified ? unverified : /\b(no|zero|nil|without)\b/.test(low) || need === 0 ? (a.activeBacklogs === 0 ? { status: "MET", credit: 1, evidence: ["No active backlogs (verified)"] } : { status: "MISSING", credit: 0, evidence: [`${a.activeBacklogs} active backlogs (verified)`] }) : need !== null && a.activeBacklogs <= need ? { status: "MET", credit: 1, evidence: [`${a.activeBacklogs} active backlogs (verified)`] } : { status: "MISSING", credit: 0, evidence: [`${a.activeBacklogs} active backlogs (verified)`] };
  const have = `${m.identity.programme ?? ""} ${m.identity.department} ${m.education.map((e) => e.heading).join(" ")}`.toLowerCase();
  const alts = t.split(/\bor\b|,|\/|;/).map((x) => tokens(x.replace(/\(.*?\)/g, (p) => ` ${p.slice(1, -1)} `))).filter((x) => x.length);
  const ok = alts.some((alt) => alt.every((w) => have.includes(w)));
  return ok ? { status: "MET", credit: 1, evidence: [m.identity.programme ?? m.identity.department] } : { status: "UNKNOWN", credit: 0, evidence: [m.identity.programme ?? m.identity.department], note: "A person should compare this with the student's qualification" };
}

const months = (period: string) => { const m = /(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(period); return m ? Math.max(0, (Date.parse(m[2]) - Date.parse(m[1])) / (30.44 * 86_400_000)) : 0; };
function experienceMatch(req: Requirement, m: MasterProfile): { status: Status; credit: number; evidence: string[]; note?: string } {
  const low = req.text.toLowerCase();
  const done = m.internships.filter((i) => i.source === "COLLEGE");
  const have = done.reduce((a, i) => a + months(i.period), 0);
  const ev = done.map((i) => `${i.role} at ${i.company}`);
  if (/fresher|entry.?level|no experience|0 ?years/.test(low)) return { status: "MET", credit: 1, evidence: [] };
  const y = /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/.exec(low)?.[1];
  if (y) { const need = Number(y) * 12; return have >= need ? { status: "MET", credit: 1, evidence: ev } : have >= need * 0.25 ? { status: "PARTIAL", credit: 0.5, evidence: ev, note: `${Math.round(have)} months of verified internship against ${Math.round(need)} wanted` } : { status: "MISSING", credit: 0, evidence: ev, note: `Needs ${y} years` }; }
  if (/intern|project|hands.?on|practical/.test(low)) return done.length || m.projects.length ? { status: "MET", credit: 1, evidence: [...ev, ...m.projects.slice(0, 2).map((p) => `Project: ${p.title}`)] } : { status: "MISSING", credit: 0, evidence: [] };
  return { status: "UNKNOWN", credit: 0, evidence: ev, note: "A person should judge this" };
}

function communicationMatch(m: MasterProfile): { status: Status; credit: number; evidence: string[]; note?: string } {
  const c = bestOf(m, "COMMUNICATION");
  if (c) return c.percent >= 60 ? { status: "MET", credit: 1, evidence: [`${c.label}: ${c.percent}%`] } : c.percent >= 40 ? { status: "PARTIAL", credit: 0.5, evidence: [`${c.label}: ${c.percent}%`] } : { status: "MISSING", credit: 0, evidence: [`${c.label}: ${c.percent}%`] };
  const claim = m.skills.find((s) => /communicat/.test(s.name.toLowerCase()));
  return claim ? { status: "PARTIAL", credit: CREDIT.claimed, evidence: ["Listed by the student; no communication assessment taken"], note: "Claimed only" } : { status: "UNKNOWN", credit: 0, evidence: [], note: "No communication assessment taken" };
}
const bestOf = (m: MasterProfile, category: string) => m.assessments.filter((a) => a.category === category).sort((a, b) => b.percent - a.percent)[0] ?? null;

export function matchRequirement(req: Requirement, m: MasterProfile): ReqResult {
  const base = { id: req.id, kind: req.kind, level: req.level, text: req.text };
  if (req.kind === "SKILL") { const r = skillMatch(req, m); return { ...base, status: statusOf(r.credit), credit: r.credit, evidence: r.evidence, note: r.note }; }
  if (req.kind === "QUALIFICATION") return { ...base, ...qualificationMatch(req, m) };
  if (req.kind === "EXPERIENCE") return { ...base, ...experienceMatch(req, m) };
  if (req.kind === "COMMUNICATION") return { ...base, ...communicationMatch(m) };
  return { ...base, status: "UNKNOWN", credit: 0, evidence: [], note: "A person should judge this" };
}

// ---- the score ----
export type Weights = JdData["scoring"];
export type ParamResult = { key: MatchParam; label: string; weight: number; value: number | null; points: number; note: string };
export type MatchResult = {
  score: number; parameters: ParamResult[]; requirements: ReqResult[];
  mandatory: { total: number; met: number; partial: number; missing: number; unknown: number; status: "ALL_MET" | "NEEDS_REVIEW" | "UNMET" | "NONE" };
  skills: { matched: string[]; partial: string[]; missing: string[] };
  projects: { title: string; why: string }[]; internships: { title: string; why: string }[]; gaps: string[]; explanation: string[];
};

function relevant<T extends { title: string; text: string }>(items: T[], wants: string[]) {
  return items.flatMap((it) => { const hit = wants.filter((w) => mentions(it.text, canon(w))); return hit.length ? [{ title: it.title, why: `Uses ${hit.slice(0, 4).join(", ")}` }] : []; });
}

/** The match of one student to one job description: mandatory criteria and the score, apart, each with its evidence. */
export function matchStudent(jd: JdData, m: MasterProfile): MatchResult {
  const reqs = jd.requirements.map((r) => matchRequirement(r, m));
  const skillReqs = reqs.filter((r) => r.kind === "SKILL");
  const wants = skillReqs.map((r) => r.text);
  const mand = reqs.filter((r) => r.level === "MANDATORY");
  const mandatory = {
    total: mand.length, met: mand.filter((r) => r.status === "MET").length, partial: mand.filter((r) => r.status === "PARTIAL").length, missing: mand.filter((r) => r.status === "MISSING").length, unknown: mand.filter((r) => r.status === "UNKNOWN").length,
    status: (mand.length === 0 ? "NONE" : mand.some((r) => r.status === "MISSING") ? "UNMET" : mand.every((r) => r.status === "MET") ? "ALL_MET" : "NEEDS_REVIEW") as MatchResult["mandatory"]["status"],
  };

  const w = jd.scoring;
  const val: Record<MatchParam, { value: number | null; note: string }> = {
    technical: { value: null, note: "" }, academic: { value: null, note: "" }, projects: { value: null, note: "" }, aptitude: { value: null, note: "" }, communication: { value: null, note: "" }, internship: { value: null, note: "" }, certifications: { value: null, note: "" },
  };
  // technical: required skills count double a preferred one of the same weight; a claimed skill earns half, evidence earns all
  if (skillReqs.length) {
    const wt = (r: ReqResult) => (jd.requirements.find((x) => x.id === r.id)?.weight ?? 5) * (r.level === "MANDATORY" ? 2 : 1);
    const total = skillReqs.reduce((a, r) => a + wt(r), 0);
    val.technical = { value: skillReqs.reduce((a, r) => a + wt(r) * r.credit, 0) / total, note: `${skillReqs.filter((r) => r.status === "MET").length} of ${skillReqs.length} skills met` };
  } else val.technical = { value: null, note: "The job description lists no skills" };
  // academic: the verified CGPA out of 10
  val.academic = m.academics.cgpa !== null && m.academics.verified ? { value: Math.min(1, m.academics.cgpa / 10), note: `CGPA ${m.academics.cgpa} (verified)` } : { value: 0, note: m.academics.cgpa === null ? "No CGPA on record" : "CGPA not verified by staff, so it earns nothing" };
  // projects: how many wanted skills are shown in a project, and whether there are any
  const projSkillsShown = wants.filter((s) => m.projects.some((p) => mentions(`${p.title} ${p.description} ${p.skills.join(" ")}`, canon(s))));
  const relProjects = relevant(m.projects.map((p) => ({ title: p.title, text: `${p.title} ${p.description} ${p.skills.join(" ")}` })), wants);
  val.projects = m.projects.length === 0 ? { value: 0, note: "No projects on record" } : { value: (wants.length ? 0.7 * (projSkillsShown.length / wants.length) : 0.7) + 0.3 * Math.min(1, m.projects.length / 3), note: `${m.projects.length} project${m.projects.length === 1 ? "" : "s"}${wants.length ? `, ${projSkillsShown.length} of ${wants.length} wanted skills shown in them` : ""}` };
  const apt = bestOf(m, "APTITUDE"), com = bestOf(m, "COMMUNICATION");
  val.aptitude = apt ? { value: apt.percent / 100, note: `${apt.label}: ${apt.percent}%` } : { value: 0, note: "No aptitude assessment taken" };
  val.communication = com ? { value: com.percent / 100, note: `${com.label}: ${com.percent}%` } : { value: 0, note: "No communication assessment taken" };
  const done = m.internships.filter((i) => i.source === "COLLEGE" || i.verified);
  const titleWords = tokens(jd.title);
  const relInterns = done.flatMap((i) => { const hit = [...wants.filter((s) => mentions(`${i.role} ${i.description}`, canon(s))), ...titleWords.filter((t) => t.length > 3 && mentions(`${i.role} ${i.description}`, t))]; return hit.length ? [{ title: `${i.role} at ${i.company}`, why: `Relevant: ${[...new Set(hit)].slice(0, 4).join(", ")}` }] : []; });
  val.internship = done.length === 0 ? { value: 0, note: "No verified internship" } : { value: Math.min(1, 0.5 + 0.5 * Math.min(1, relInterns.length)), note: `${done.length} verified internship${done.length === 1 ? "" : "s"}, ${relInterns.length} relevant` };
  const certs = [...m.courses.map((c) => c.title), ...m.achievements.filter((a) => a.verified && a.category === "CERTIFICATION").map((a) => a.title)];
  const relCerts = wants.length ? certs.filter((c) => wants.some((s) => mentions(c, canon(s)))) : certs;
  val.certifications = { value: Math.min(1, relCerts.length / 2), note: certs.length ? `${relCerts.length} of ${certs.length} course${certs.length === 1 ? "" : "s"} and certification${certs.length === 1 ? "" : "s"} relevant` : "No courses or certifications on record" };

  const parameters: ParamResult[] = MATCH_PARAMS.map((k) => ({ key: k, label: MATCH_LABEL[k], weight: w[k], value: val[k].value, points: 0, note: val[k].note }));
  const applicable = parameters.filter((p) => p.value !== null).reduce((a, p) => a + p.weight, 0);
  for (const p of parameters) p.points = p.value === null || applicable === 0 ? 0 : Math.round(((p.weight * p.value) / applicable) * 1000) / 10;
  const score = Math.round(parameters.reduce((a, p) => a + p.points, 0));

  const skills = { matched: skillReqs.filter((r) => r.status === "MET").map((r) => r.text), partial: skillReqs.filter((r) => r.status === "PARTIAL").map((r) => r.text), missing: skillReqs.filter((r) => r.status === "MISSING").map((r) => r.text) };
  const gaps = [...new Set([...skills.missing, ...skills.partial, ...reqs.filter((r) => r.level === "MANDATORY" && r.status === "MISSING" && r.kind !== "SKILL").map((r) => r.text)])];
  return { score, parameters, requirements: reqs, mandatory, skills, projects: relProjects.slice(0, 3), internships: relInterns.slice(0, 3), gaps, explanation: explain({ mandatory, skills, parameters, reqs, relProjects, relInterns }) };
}

function explain(r: { mandatory: MatchResult["mandatory"]; skills: MatchResult["skills"]; parameters: ParamResult[]; reqs: ReqResult[]; relProjects: { title: string; why: string }[]; relInterns: { title: string; why: string }[] }): string[] {
  const out: string[] = [];
  const md = r.mandatory;
  if (md.status === "ALL_MET") out.push(`Meets all ${md.total} required criteria.`);
  else if (md.status === "NONE") out.push("The job description lists no required criteria.");
  else out.push(`Meets ${md.met} of ${md.total} required criteria${md.missing ? `; missing: ${r.reqs.filter((x) => x.level === "MANDATORY" && x.status === "MISSING").map((x) => x.text).join(", ")}` : ""}${md.partial ? `; partly met: ${r.reqs.filter((x) => x.level === "MANDATORY" && x.status === "PARTIAL").map((x) => x.text).join(", ")}` : ""}${md.unknown ? `; ${md.unknown} need a person to check` : ""}.`);
  const parts: string[] = [];
  if (r.skills.matched.length) parts.push(`matched ${r.skills.matched.join(", ")} (backed by ${[...new Set(r.reqs.filter((x) => x.status === "MET" && x.kind === "SKILL").flatMap((x) => x.evidence.map((e) => e.split(":")[0])))].slice(0, 3).join(", ") || "records"})`);
  if (r.skills.partial.length) parts.push(`partly matched ${r.skills.partial.join(", ")}`);
  if (r.skills.missing.length) parts.push(`missing ${r.skills.missing.join(", ")}`);
  if (parts.length) out.push(`Skills: ${parts.join("; ")}.`);
  const p = Object.fromEntries(r.parameters.map((x) => [x.key, x]));
  out.push(`Academic profile: ${p.academic.note}.`);
  if (r.relProjects.length) out.push(`Relevant projects: ${r.relProjects.map((x) => `${x.title} (${x.why.toLowerCase()})`).join("; ")}.`); else out.push(`Projects: ${p.projects.note}.`);
  out.push(r.relInterns.length ? `Internship: ${r.relInterns.map((x) => x.title).join("; ")}.` : `Internship: ${p.internship.note}.`);
  out.push(`Assessments: ${p.aptitude.note}; ${p.communication.note}.`);
  const rank = [...r.parameters].filter((x) => x.value !== null && x.weight > 0).sort((a, b) => (b.value! - a.value!) * b.weight);
  const strong = rank.filter((x) => (x.value ?? 0) >= 0.7).slice(0, 2).map((x) => x.label.toLowerCase()), weak = rank.filter((x) => (x.value ?? 0) < 0.4 && x.weight >= 10).slice(0, 2).map((x) => x.label.toLowerCase());
  if (strong.length) out.push(`Strongest on ${strong.join(" and ")}.`);
  if (weak.length) out.push(`Weakest on ${weak.join(" and ")}.`);
  return out;
}

// ---- ranking ----
export type Rankable = { studentId: string; name: string; eligible: boolean; score: number; mandatoryStatus: MatchResult["mandatory"]["status"]; mandatoryMet: number; cgpa: number | null };
const MS = { ALL_MET: 0, NONE: 0, NEEDS_REVIEW: 1, UNMET: 2 } as const;
/** Eligible students first, then by score (highest first). Ties go to more required criteria met, then CGPA, then name, so the order is always the same. Ineligible students are never ranked above an eligible one. */
export function rankCandidates<T extends Rankable>(xs: T[]): (T & { rank: number | null })[] {
  const sorted = [...xs].sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || b.mandatoryMet - a.mandatoryMet || MS[a.mandatoryStatus] - MS[b.mandatoryStatus] || (b.cgpa ?? 0) - (a.cgpa ?? 0) || a.name.localeCompare(b.name));
  let r = 0;
  return sorted.map((x) => ({ ...x, rank: x.eligible ? ++r : null }));
}

// ---- preparation ----
export type PrepSource = { id: string; title: string; skills: string[] };
/** For each skill a student lacks, the college's own courses and study material that teach it. Skills nothing teaches yet are listed so staff know where material is missing. */
export function prepSuggestions(gaps: string[], courses: PrepSource[], resources: PrepSource[], per = 2) {
  const teaches = (src: PrepSource, gap: string) => [src.title, ...src.skills].some((t) => mentions(t, canon(gap)) || mentions(canon(gap), canon(t)) || canon(t) === canon(gap));
  return gaps.map((gap) => ({ skill: gap, courses: courses.filter((c) => teaches(c, gap)).slice(0, per).map((c) => ({ id: c.id, title: c.title })), resources: resources.filter((r) => teaches(r, gap)).slice(0, per).map((r) => ({ id: r.id, title: r.title })) }));
}

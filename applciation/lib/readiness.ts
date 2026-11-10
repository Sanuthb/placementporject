/**
 * The two readiness measures, kept apart:
 *  - the Career Readiness Index: how developed a student is overall;
 *  - the Job-Specific Readiness Score: how prepared a student is for one particular job.
 * Pure rules, no database. Every number comes from evidence the college holds, each part says what it used, and neither guarantees selection.
 * Personality, career-interest and behavioural-style results are never inputs. A part with no way to be measured (module not bought, nothing to judge) is left out and
 * reported as lower coverage; a part where the student simply has done nothing counts as zero, with a note.
 */
export type Component = { key: string; label: string; weight: number; value: number | null; points: number; note: string; evidence: string[] };
export type Band = "JUST_STARTING" | "BUILDING" | "PROGRESSING" | "STRONG" | "VERY_STRONG";
export const BAND_LABEL: Record<Band, string> = { JUST_STARTING: "Just starting", BUILDING: "Building", PROGRESSING: "Progressing", STRONG: "Strong", VERY_STRONG: "Very strong" };
export type Result = { score: number; band: Band; coverage: number; confidence: "GOOD" | "SOME" | "LITTLE"; components: Component[]; explanation: string[]; nextSteps: string[]; disclaimer: string };
export const DISCLAIMER = "Readiness is practice evidence from this college's records. It is not a prediction, does not guarantee selection, and is never a reason on its own to exclude a student.";

/** Categories whose results describe preferences, not ability. They are never readiness inputs. */
export const NEVER_SCORED = ["PERSONALITY", "CAREER_INTEREST", "BEHAVIOURAL_STYLE"] as const;
export const SCORED_CATEGORIES = ["APTITUDE", "TECHNICAL", "COMMUNICATION", "DIGITAL_LITERACY", "TEAMWORK_LEADERSHIP", "OTHER"] as const;

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const bandOf = (score: number): Band => (score < 30 ? "JUST_STARTING" : score < 50 ? "BUILDING" : score < 70 ? "PROGRESSING" : score < 85 ? "STRONG" : "VERY_STRONG");
const confidenceOf = (coverage: number) => (coverage >= 70 ? "GOOD" : coverage >= 40 ? "SOME" : "LITTLE") as Result["confidence"];

/** Weighted mean over the parts that could be measured; the weights of the rest are left out, and `coverage` says how much of the total weight that was. */
export function combine(parts: Omit<Component, "points">[]): { components: Component[]; score: number; coverage: number } {
  const total = parts.reduce((a, p) => a + p.weight, 0), used = parts.filter((p) => p.value !== null).reduce((a, p) => a + p.weight, 0);
  const components = parts.map((p) => ({ ...p, value: p.value === null ? null : clamp(p.value), points: p.value === null || used === 0 ? 0 : r1((p.weight * clamp(p.value) * 100) / used) }));
  return { components, score: Math.round(components.reduce((a, c) => a + c.points, 0)), coverage: total ? Math.round((used / total) * 100) : 0 };
}

/** How much a student has improved: the mean change, in percentage points, between first and latest attempt of each test they repeated. 0 change is a middling 0.5; +20 points or more is full credit. */
export function improvementValue(changes: number[]): number | null {
  const m = mean(changes);
  return m === null ? null : clamp(0.5 + m / 40);
}
/** Changes between the first and last attempt of each test that has at least two attempts. `attempts` are percentages, oldest first. */
export const changesOf = (tests: { percents: number[] }[]) => tests.filter((t) => t.percents.length >= 2).map((t) => t.percents[t.percents.length - 1] - t.percents[0]);

const ACTION: Record<string, string> = {
  profile: "Complete the profile sections and get them verified", academics: "Get the CGPA and academic records verified by the placement office", skills: "Back each skill with a project, course, certificate or test result",
  assessments: "Take the scheduled tests and practise the topics the reports flag", interviews: "Do a mock interview and work through the report", practical: "Add a project and a verified internship", learning: "Finish assigned courses and study material",
  improvement: "Retake a test after practising and look for a higher score", mandatory: "Meet the required criteria", skillsJob: "Close the skill gaps for this job", tests: "Take a test linked to this job", projects: "Add a project that uses the job's skills", internship: "Add a verified internship in this area", prep: "Finish the preparation material for the gaps",
};
function steps(components: Component[], extra: Record<string, string> = {}, limit = 4) {
  return components.filter((c) => c.value !== null && c.value < 0.7 && c.weight > 0).sort((a, b) => b.weight * (1 - b.value!) - a.weight * (1 - a.value!)).slice(0, limit).map((c) => `${extra[c.key] ?? ACTION[c.key] ?? c.label} (${c.label}: ${Math.round(c.value! * 100)}%).`);
}

// ---- Career Readiness Index ----
export type CareerInput = {
  modules: { assessments: boolean; interviews: boolean }
  profile: { verifiedPercent: number } | null
  academics: { cgpa: number | null; verified: boolean; activeBacklogs: number | null }
  skills: { listed: number; backed: number }
  tests: { title: string; percents: number[] }[] // oldest first; scheduled tests in scored categories only
  interviews: { score: number }[]
  projects: number; internships: number; courses: number; resources: number
};
export const CAREER_WEIGHTS = { profile: 10, academics: 15, skills: 15, assessments: 20, interviews: 10, practical: 15, learning: 10, improvement: 5 } as const;

export function careerIndex(i: CareerInput): Result {
  const W = CAREER_WEIGHTS;
  const latest = i.tests.map((t) => t.percents[t.percents.length - 1]).filter((x) => x !== undefined);
  const ivMean = mean(i.interviews.map((x) => x.score));
  const imp = improvementValue(changesOf(i.tests));
  const acadValue = i.academics.verified && i.academics.cgpa !== null ? clamp(i.academics.cgpa / 10 - Math.min(0.3, (i.academics.activeBacklogs ?? 0) * 0.1)) : null;
  const parts: Omit<Component, "points">[] = [
    { key: "profile", label: "Profile", weight: W.profile, value: i.profile ? i.profile.verifiedPercent / 100 : null, note: i.profile ? `${Math.round(i.profile.verifiedPercent)}% of the required profile is verified` : "Profile completion could not be measured", evidence: [] },
    { key: "academics", label: "Academics", weight: W.academics, value: acadValue, note: acadValue === null ? (i.academics.cgpa === null ? "No CGPA on record" : "CGPA is not verified yet, so it is not counted") : `Verified CGPA ${i.academics.cgpa}${i.academics.activeBacklogs ? `, ${i.academics.activeBacklogs} active backlog${i.academics.activeBacklogs > 1 ? "s" : ""}` : ""}`, evidence: [] },
    { key: "skills", label: "Skills with evidence", weight: W.skills, value: clamp(i.skills.backed / 8), note: i.skills.listed ? `${i.skills.backed} of ${i.skills.listed} listed skills are backed by a staff check, project, course, internship or test (8 backed skills is full credit)` : "No skills listed yet", evidence: [] },
    { key: "assessments", label: "Assessments", weight: W.assessments, value: i.modules.assessments ? (latest.length ? (mean(latest) as number) / 100 : 0) : null, note: !i.modules.assessments ? "The college does not use assessments" : latest.length ? `Average of the latest result in ${latest.length} test${latest.length > 1 ? "s" : ""}: ${Math.round(mean(latest) as number)}%` : "No scheduled test taken yet", evidence: i.tests.map((t) => `${t.title}: ${Math.round(t.percents[t.percents.length - 1])}%`) },
    { key: "interviews", label: "Mock interviews and discussions", weight: W.interviews, value: i.modules.interviews ? (ivMean === null ? 0 : ivMean / 10) : null, note: !i.modules.interviews ? "The college does not use mock interviews or discussions" : ivMean === null ? "No mock interview or discussion finished yet" : `Average score ${r1(ivMean)} of 10 over ${i.interviews.length} session${i.interviews.length > 1 ? "s" : ""}`, evidence: [] },
    { key: "practical", label: "Projects and internships", weight: W.practical, value: 0.5 * clamp(i.projects / 3) + 0.5 * clamp(i.internships / 1), note: `${i.projects} project${i.projects === 1 ? "" : "s"} (3 is full credit) and ${i.internships} verified internship${i.internships === 1 ? "" : "s"} (1 is full credit)`, evidence: [] },
    { key: "learning", label: "Learning activity", weight: W.learning, value: 0.5 * clamp(i.courses / 3) + 0.5 * clamp(i.resources / 5), note: `${i.courses} course${i.courses === 1 ? "" : "s"} completed (3 is full credit) and ${i.resources} study resource${i.resources === 1 ? "" : "s"} completed (5 is full credit)`, evidence: [] },
    { key: "improvement", label: "Improvement over attempts", weight: W.improvement, value: imp, note: imp === null ? "No test has been retaken yet, so there is no trend to measure" : `Retaken tests changed by ${r1(mean(changesOf(i.tests)) as number)} points on average`, evidence: [] },
  ];
  const { components, score, coverage } = combine(parts);
  const strong = components.filter((c) => c.value !== null && c.value >= 0.7).sort((a, b) => b.weight - a.weight).slice(0, 2).map((c) => c.label.toLowerCase());
  const weak = components.filter((c) => c.value !== null && c.value < 0.4 && c.weight >= 10).sort((a, b) => b.weight - a.weight).slice(0, 2).map((c) => c.label.toLowerCase());
  const explanation = [`Career readiness ${score} of 100 (${BAND_LABEL[bandOf(score)].toLowerCase()}), from ${components.filter((c) => c.value !== null).length} of ${components.length} areas with evidence.`, ...(strong.length ? [`Strongest: ${strong.join(" and ")}.`] : []), ...(weak.length ? [`Weakest: ${weak.join(" and ")}.`] : []), ...(coverage < 70 ? ["Some areas could not be measured, so treat the score as a rough guide."] : [])];
  return { score, band: bandOf(score), coverage, confidence: confidenceOf(coverage), components, explanation, nextSteps: steps(components), disclaimer: DISCLAIMER };
}

// ---- Job-Specific Readiness Score ----
export type Gate = "ELIGIBLE" | "NEEDS_REVIEW" | "NOT_ELIGIBLE" | "NO_CRITERIA";
export type JobInput = {
  eligible: boolean; eligibilityReasons: string[]
  mandatory: { status: "ALL_MET" | "NEEDS_REVIEW" | "UNMET" | "NONE"; met: number; total: number; missing: string[] }
  skills: { value: number | null; matched: string[]; partial: string[]; missing: string[] }
  tests: { linked: { title: string; percent: number }[]; general: { label: string; percent: number }[] }
  interviews: { linked: number[]; general: number[] }
  projects: { value: number; note: string }; internship: { value: number; note: string }
  prep: { suggested: number; done: number } | null
  improvement: number[]
  modules: { assessments: boolean; interviews: boolean }
};
export const JOB_WEIGHTS = { skills: 30, tests: 20, interviews: 15, projects: 10, internship: 5, prep: 10, improvement: 10 } as const;

/** Mandatory eligibility is a gate, shown beside the score and never blended into it, so a student who does not qualify is never presented as qualified. */
export function gateOf(i: Pick<JobInput, "eligible" | "mandatory">): Gate {
  if (!i.eligible || i.mandatory.status === "UNMET") return "NOT_ELIGIBLE";
  if (i.mandatory.status === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  return i.mandatory.status === "NONE" ? "NO_CRITERIA" : "ELIGIBLE";
}
export const GATE_LABEL: Record<Gate, string> = { ELIGIBLE: "Meets the required criteria", NEEDS_REVIEW: "Some required criteria need checking", NOT_ELIGIBLE: "Does not meet the eligibility or required criteria", NO_CRITERIA: "The job lists no required criteria" };

export function jobReadiness(i: JobInput): Result & { gate: Gate; gateLabel: string; gateReasons: string[] } {
  const W = JOB_WEIGHTS;
  const testSet = i.tests.linked.length ? i.tests.linked.map((t) => t.percent) : i.tests.general.map((t) => t.percent);
  const ivSet = i.interviews.linked.length ? i.interviews.linked : i.interviews.general;
  const imp = improvementValue(i.improvement);
  const parts: Omit<Component, "points">[] = [
    { key: "skillsJob", label: "Skills the job asks for", weight: W.skills, value: i.skills.value, note: i.skills.value === null ? "The job description lists no skills" : `${i.skills.matched.length} matched, ${i.skills.partial.length} partly, ${i.skills.missing.length} missing`, evidence: [...i.skills.matched.map((s) => `Has ${s}`), ...i.skills.partial.map((s) => `Partly ${s}`), ...i.skills.missing.map((s) => `Missing ${s}`)] },
    { key: "tests", label: "Mock tests", weight: W.tests, value: i.modules.assessments ? (testSet.length ? (mean(testSet) as number) / 100 : 0) : null, note: !i.modules.assessments ? "The college does not use assessments" : i.tests.linked.length ? `Average ${Math.round(mean(testSet) as number)}% over ${i.tests.linked.length} test${i.tests.linked.length > 1 ? "s" : ""} made for this job` : testSet.length ? `No test is linked to this job; general aptitude, technical and communication results average ${Math.round(mean(testSet) as number)}%` : "No relevant test taken yet", evidence: (i.tests.linked.length ? i.tests.linked.map((t) => `${t.title}: ${Math.round(t.percent)}%`) : i.tests.general.map((t) => `${t.label}: ${Math.round(t.percent)}%`)) },
    { key: "interviews", label: "Mock interviews and discussions", weight: W.interviews, value: i.modules.interviews ? (ivSet.length ? (mean(ivSet) as number) / 10 : 0) : null, note: !i.modules.interviews ? "The college does not use mock interviews or discussions" : i.interviews.linked.length ? `Average ${r1(mean(ivSet) as number)} of 10 over ${ivSet.length} interview${ivSet.length > 1 ? "s" : ""} for this job` : ivSet.length ? `No interview was for this job; the average of all your interviews is ${r1(mean(ivSet) as number)} of 10` : "No mock interview or discussion finished yet", evidence: [] },
    { key: "projects", label: "Project evidence", weight: W.projects, value: i.projects.value, note: i.projects.note, evidence: [] },
    { key: "internship", label: "Internship experience", weight: W.internship, value: i.internship.value, note: i.internship.note, evidence: [] },
    { key: "prep", label: "Preparation material", weight: W.prep, value: i.prep === null ? null : i.prep.suggested === 0 ? 1 : i.prep.done / i.prep.suggested, note: i.prep === null ? "The college has no material for this job's gaps yet" : i.prep.suggested === 0 ? "There are no skill gaps to prepare for" : `${i.prep.done} of ${i.prep.suggested} suggested courses and study materials completed`, evidence: [] },
    { key: "improvement", label: "Improvement over attempts", weight: W.improvement, value: imp, note: imp === null ? "No test has been retaken yet, so there is no trend to measure" : `Retaken tests changed by ${r1(mean(i.improvement) as number)} points on average`, evidence: [] },
  ];
  const { components, score, coverage } = combine(parts);
  const gate = gateOf(i);
  const gateReasons = [...i.eligibilityReasons, ...(i.mandatory.missing.length ? [`Missing required: ${i.mandatory.missing.join(", ")}`] : [])];
  const explanation = [
    gate === "NOT_ELIGIBLE" ? `Not eligible for this job: ${gateReasons.join("; ") || "required criteria are not met"}. The score below shows preparation only.` : `${GATE_LABEL[gate]}.`,
    `Job readiness ${score} of 100 (${BAND_LABEL[bandOf(score)].toLowerCase()}), from ${components.filter((c) => c.value !== null).length} of ${components.length} areas with evidence.`,
    ...(i.skills.missing.length ? [`Skill gaps: ${i.skills.missing.join(", ")}.`] : []),
    ...(coverage < 70 ? ["Some areas could not be measured, so treat the score as a rough guide."] : []),
  ];
  const extra = { skillsJob: i.skills.missing.length ? `Close the skill gaps: ${i.skills.missing.slice(0, 4).join(", ")}` : ACTION.skillsJob };
  return { score, band: bandOf(score), coverage, confidence: confidenceOf(coverage), components, explanation, nextSteps: steps(components, extra), disclaimer: DISCLAIMER, gate, gateLabel: GATE_LABEL[gate], gateReasons };
}

/** Change between saved snapshots of a score: since the first and since the one before the latest. `points` are oldest first. */
export function snapshotTrend(points: { day: string; score: number }[]) {
  if (points.length < 2) return { sinceFirst: null as number | null, sincePrevious: null as number | null };
  const last = points[points.length - 1].score;
  return { sinceFirst: last - points[0].score, sincePrevious: last - points[points.length - 2].score };
}

import assert from "node:assert/strict";
import { blankJd, DEFAULT_SCORING, type JdData, type Requirement } from "../../lib/jd";
import { canon, matchRequirement, matchStudent, prepSuggestions, rankCandidates } from "../../lib/matching";
import { buildMaster, type Inputs } from "../../lib/resumeEngine";

const base: Inputs = {
  student: { name: "Asha Rao", email: "a@x.in", phone: null, department: "Computer Applications", batch: "2024-26", enrollmentNo: "MCA1", programme: "MCA", college: "Demo College" },
  sections: {
    SKILLS: { status: "VERIFIED", data: { skills: ["Python", "SQL", "Communication"] } },
    PROJECTS: { status: "VERIFIED", data: { projects: [{ title: "Sales dashboard", description: "Built reports with SQL and Excel.", tools: "SQL" }] } },
    ACADEMICS: { status: "VERIFIED", data: { cgpa: 8, tenthPercentage: 82, twelfthPercentage: 75, activeBacklogs: 0 } },
    ACHIEVEMENTS: { status: "VERIFIED", data: { achievements: [{ title: "Google Data Analytics certification", category: "CERTIFICATION", date: "2025-01-01" }] } },
  },
  collegeProjects: [{ key: "t1", title: "Library App", problem: "A lending system", summary: "Web app built with Python and Django.", skills: ["Python", "Django"], role: "Backend", teammates: [], repo: null, resultPercent: 80 }],
  collegeInternships: [{ key: "i1", company: "Acme", role: "Data Analyst Intern", from: "2025-05-01", to: "2025-08-01", certificateVerified: true, preplacementOffer: false }],
  courses: [{ key: "c1", title: "SQL for Data Analysis", skills: ["SQL"], completedOn: "2026-01-01T00:00:00Z", serial: null }],
  assessments: [{ key: "a1", title: "Aptitude test", percent: 70, category: "APTITUDE" }, { key: "a2", title: "Business writing", percent: 55, category: "COMMUNICATION" }],
};
const m = buildMaster(base);
const req = (id: string, kind: string, text: string, level = "MANDATORY", weight = 5): Requirement => ({ id, kind: kind as Requirement["kind"], text, level: level as Requirement["level"], weight, needsCheck: false });
const jd = (reqs: Requirement[], scoring: JdData["scoring"] = DEFAULT_SCORING): JdData => ({ ...blankJd({ title: "Junior Data Analyst", company: "Globex", description: "x".repeat(40) }), requirements: reqs, scoring });

// skill names
assert.equal(canon("JS"), "javascript");
assert.equal(canon("MS Excel"), "excel");
assert.equal(canon("Power BI"), "power bi");

// requirement matching
const r = (x: Requirement, p = m) => matchRequirement(x, p);
assert.equal(r(req("1", "SKILL", "Python")).status, "MET");
assert.equal(r(req("1", "SKILL", "Knowledge of SQL")).status, "MET", "a requirement phrase that contains the skill matches it");
assert.ok(r(req("1", "SKILL", "SQL")).evidence.length > 0, "a match always says what backs it");
assert.equal(r(req("2", "SKILL", "Excel")).status, "PARTIAL", "named only in a project description counts for less");
assert.equal(r(req("3", "SKILL", "Tableau")).status, "MISSING");
assert.equal(r(req("4", "SKILL", "Power BI")).status, "MISSING");
const withBi = buildMaster({ ...base, courses: [...base.courses, { key: "c2", title: "Tableau basics", skills: ["Tableau"], completedOn: "2026-02-01T00:00:00Z", serial: null }] });
assert.equal(r(req("4", "SKILL", "Power BI"), withBi).status, "PARTIAL", "a related, backed skill earns partial credit");
const claimedOnly = buildMaster({ ...base, sections: { ...base.sections, SKILLS: { status: "DRAFT", data: { skills: ["Rust"] } } } });
const rc = r(req("5", "SKILL", "Rust"), claimedOnly);
assert.deepEqual([rc.status, rc.credit], ["PARTIAL", 0.5]);
assert.match(rc.note ?? "", /Claimed/);

// qualifications: marks come from verified academics only
assert.equal(r(req("6", "QUALIFICATION", "Minimum 7.5 CGPA")).status, "MET");
assert.equal(r(req("6", "QUALIFICATION", "Minimum 8.5 CGPA")).status, "MISSING");
assert.equal(r(req("6", "QUALIFICATION", "60% in 10th")).status, "MET");
assert.equal(r(req("6", "QUALIFICATION", "80% in 12th")).status, "MISSING");
assert.equal(r(req("6", "QUALIFICATION", "No active backlogs")).status, "MET");
const unver = buildMaster({ ...base, sections: { ...base.sections, ACADEMICS: { status: "SUBMITTED", data: { cgpa: 9.5 } } } });
assert.equal(r(req("6", "QUALIFICATION", "Minimum 7.5 CGPA"), unver).status, "UNKNOWN", "an unverified CGPA is never trusted");
assert.equal(r(req("7", "QUALIFICATION", "MCA or B.Sc (Computer Science)")).status, "MET");
assert.equal(r(req("7", "QUALIFICATION", "B.Tech in Mechanical Engineering")).status, "UNKNOWN");

// experience
assert.equal(r(req("8", "EXPERIENCE", "Freshers can apply")).status, "MET");
assert.equal(r(req("8", "EXPERIENCE", "1 year of experience")).status, "PARTIAL", "3 months of verified internship is a quarter of 12");
assert.equal(r(req("8", "EXPERIENCE", "2 years of experience")).status, "MISSING");
assert.equal(r(req("8", "EXPERIENCE", "5+ years")).status, "MISSING");
assert.equal(r(req("8", "EXPERIENCE", "Internship or project experience")).status, "MET");

// communication
assert.equal(r(req("9", "COMMUNICATION", "Good communication skills")).status, "PARTIAL", "55% is partial");
assert.equal(r(req("9", "COMMUNICATION", "Good communication skills"), buildMaster({ ...base, assessments: [] })).status, "PARTIAL", "claimed communication with no test is partial");
assert.equal(r(req("9", "COMMUNICATION", "Good communication skills"), buildMaster({ ...base, assessments: [], sections: { ...base.sections, SKILLS: { status: "VERIFIED", data: { skills: ["Python"] } } } })).status, "UNKNOWN");
assert.equal(r(req("10", "OTHER", "Willing to relocate")).status, "UNKNOWN");

// the whole match
const job = jd([req("a", "SKILL", "SQL"), req("b", "SKILL", "Python"), req("c", "SKILL", "Tableau", "PREFERRED"), req("d", "QUALIFICATION", "Minimum 7.5 CGPA"), req("e", "COMMUNICATION", "Good communication skills", "PREFERRED")]);
const res = matchStudent(job, m);
assert.deepEqual(res.skills, { matched: ["SQL", "Python"], partial: [], missing: ["Tableau"] });
assert.equal(res.mandatory.status, "ALL_MET", "a missing preferred skill does not unmeet a required criterion");
assert.deepEqual([res.mandatory.total, res.mandatory.met], [3, 3]);
assert.ok(res.score > 50 && res.score <= 100);
assert.equal(res.parameters.length, 7);
assert.ok(Math.abs(res.parameters.reduce((a, p) => a + p.points, 0) - res.score) < 1, "the parts add up to the score");
assert.equal(res.parameters.find((p) => p.key === "aptitude")!.value, 0.7);
assert.ok(res.projects.some((p) => p.title === "Library App") && res.projects.some((p) => p.title === "Sales dashboard"));
assert.equal(res.internships[0].title, "Data Analyst Intern at Acme");
assert.deepEqual(res.gaps, ["Tableau"]);
assert.ok(res.explanation.some((e) => /Meets all 3 required criteria/.test(e)) && res.explanation.some((e) => /missing Tableau/.test(e)), "every result is explained from its evidence");

// required unmet is a separate verdict from the score
const hard = matchStudent(jd([req("a", "SKILL", "Kubernetes"), req("b", "SKILL", "SQL", "PREFERRED")]), m);
assert.equal(hard.mandatory.status, "UNMET");
assert.ok(hard.score > 0, "the score is not the mandatory verdict");

// weights are the college's
const techOnly = jd(job.requirements, { technical: 100, academic: 0, projects: 0, aptitude: 0, communication: 0, internship: 0, certifications: 0 });
const t = matchStudent(techOnly, m);
assert.ok(t.parameters.find((p) => p.key === "technical")!.points === t.score, "all weight on technical means the score is the technical value");
const noSkills = matchStudent(jd([req("d", "QUALIFICATION", "Minimum 7.5 CGPA")]), m);
assert.equal(noSkills.parameters.find((p) => p.key === "technical")!.value, null, "no skills listed, no technical score");
assert.equal(noSkills.parameters.find((p) => p.key === "technical")!.points, 0);
assert.ok(noSkills.score > 0 && noSkills.score <= 100, "the other weights are scaled to fill the 100");

// no evidence is not neutral
const bare = buildMaster({ ...base, sections: {}, collegeProjects: [], collegeInternships: [], courses: [], assessments: [] });
const bareRes = matchStudent(job, bare);
assert.ok(bareRes.score < res.score && bareRes.score < 20);
assert.match(bareRes.parameters.find((p) => p.key === "aptitude")!.note, /No aptitude/);
assert.equal(matchStudent(job, unver).parameters.find((p) => p.key === "academic")!.value, 0, "an unverified CGPA earns nothing");

// ranking
const rk = rankCandidates([
  { studentId: "1", name: "B", eligible: true, score: 70, mandatoryStatus: "ALL_MET" as const, mandatoryMet: 3, cgpa: 8 },
  { studentId: "2", name: "A", eligible: true, score: 70, mandatoryStatus: "ALL_MET" as const, mandatoryMet: 3, cgpa: 8 },
  { studentId: "3", name: "C", eligible: false, score: 99, mandatoryStatus: "ALL_MET" as const, mandatoryMet: 3, cgpa: 9 },
  { studentId: "4", name: "D", eligible: true, score: 90, mandatoryStatus: "UNMET" as const, mandatoryMet: 1, cgpa: 7 },
  { studentId: "5", name: "E", eligible: true, score: 70, mandatoryStatus: "ALL_MET" as const, mandatoryMet: 3, cgpa: 9 },
]);
assert.deepEqual(rk.map((x) => x.studentId), ["4", "5", "2", "1", "3"], "score first, then cgpa, then name; ineligible last");
assert.deepEqual(rk.map((x) => x.rank), [1, 2, 3, 4, null], "an ineligible student has no rank");

// preparation
const prep = prepSuggestions(["Tableau", "Kubernetes"], [{ id: "c1", title: "Tableau for Analysts", skills: ["Tableau"] }], [{ id: "r1", title: "Dashboards", skills: ["tableau"] }]);
assert.deepEqual(prep[0].courses.map((c) => c.id), ["c1"]);
assert.deepEqual(prep[0].resources.map((c) => c.id), ["r1"]);
assert.deepEqual([prep[1].courses.length, prep[1].resources.length], [0, 0], "a gap nothing teaches is still listed");
console.log("matching ok");

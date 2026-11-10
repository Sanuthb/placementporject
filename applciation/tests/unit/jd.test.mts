import assert from "node:assert/strict";
import { nextJdState, blankJd, docxXmlText, driveFromJd, groundedIn, jdData, matchNames, normalizeExtraction, publicView, requirementShares, reviewProblems, roundTypeOf, scoringProblem } from "../../lib/jd";

const doc = `Acme Pvt Ltd is hiring a Software Engineer in Bengaluru.
Requirements: Strong knowledge of Python and SQL is a must. Experience with AWS is preferred.
Eligibility: B.E / B.Tech in CSE, IT or ECE with minimum 7.0 CGPA and no active backlogs.
Selection: Online test, Technical interview, HR round. Package: 6 to 8 LPA.`;

// grounding
assert.equal(groundedIn("Strong knowledge of Python and SQL is a must", doc), true);
assert.equal(groundedIn("strong   knowledge of PYTHON and sql is a must.", doc), true, "case, spacing and punctuation do not matter");
assert.equal(groundedIn("Must know Kubernetes", doc), false);
assert.equal(groundedIn("SQL", doc), false, "a very short quote proves nothing");
assert.equal(groundedIn(undefined, doc), false);

// extraction is cleaned and checked
const raw = {
  title: "Software Engineer", company: "Acme Pvt Ltd", description: "Hiring a Software Engineer in Bengaluru.", jobType: "Full time", location: "Bengaluru", salaryMinLpa: 8, salaryMaxLpa: 6, experience: "Freshers",
  eligibility: { minCgpa: 7, minCgpaQuote: "minimum 7.0 CGPA", minTenthPct: 150, maxActiveBacklogs: 0, backlogQuote: "no active backlogs", branches: ["CSE", "IT", "ECE", "CSE"] },
  selectionProcess: ["Online test", "Technical interview", "HR round", "Online test"],
  requirements: [
    { kind: "SKILL", text: "Python", level: "MANDATORY", quote: "Strong knowledge of Python and SQL is a must" },
    { kind: "SKILL", text: "SQL", level: "MANDATORY", quote: "Strong knowledge of Python and SQL is a must" },
    { kind: "SKILL", text: "AWS", level: "preferred", quote: "Experience with AWS is preferred" },
    { kind: "SKILL", text: "Kubernetes", level: "MANDATORY", quote: "Must know Kubernetes" },
    { kind: "NONSENSE", text: "Team player", level: "WHATEVER" },
    { kind: "SKILL", text: "python", level: "MANDATORY" },
  ],
};
const { data, notes } = normalizeExtraction(raw, doc);
assert.equal(data.jobType, "FULL_TIME");
assert.deepEqual([data.salaryMinLpa, data.salaryMaxLpa], [6, 8], "a reversed salary range is put right");
assert.equal(data.eligibility.minTenthPct, null, "an impossible 150% is dropped");
assert.equal(data.eligibility.minCgpa, 7);
assert.deepEqual(data.eligibility.branchesAsStated, ["CSE", "IT", "ECE"]);
assert.deepEqual(data.selectionProcess, ["Online test", "Technical interview", "HR round"]);
assert.deepEqual(data.requirements.map((r) => r.text), ["Python", "SQL", "AWS", "Kubernetes", "Team player"], "duplicates are removed");
assert.deepEqual(data.requirements.map((r) => r.needsCheck), [false, false, false, true, true], "what the document does not say is flagged");
assert.equal(data.requirements[2].level, "PREFERRED");
assert.equal(data.requirements[4].kind, "OTHER");
assert.equal(data.requirements[4].level, "MANDATORY", "an unclear level starts as mandatory for the reviewer to decide");
assert.ok(notes.some((n) => /2 requirements/.test(n)));
assert.ok(!notes.some((n) => /CGPA/.test(n)), "a grounded rule raises no note");
assert.ok(normalizeExtraction({ eligibility: { minCgpa: 8 } }, doc).notes.some((n) => /CGPA rule \(8\)/.test(n)), "an ungrounded rule is flagged");
assert.deepEqual(normalizeExtraction("garbage", doc).data, blankJd(), "nonsense in, an empty JD out");
assert.equal(jdData.safeParse(data).success, true, "the cleaned result is a valid JD");

// matching branch names to departments
const deps = [{ id: "d1", name: "Computer Science and Engineering", code: "CSE" }, { id: "d2", name: "Information Technology", code: "IT" }, { id: "d3", name: "Mechanical Engineering", code: "ME" }, { id: "d4", name: "Computer Applications", code: "MCA" }];
const m = matchNames(["CSE", "Information Technology", "ECE", "Mechanical"], deps);
assert.deepEqual([...m.ids].sort(), ["d1", "d2", "d3"]);
assert.deepEqual(m.unmatched, ["ECE"]);
assert.ok(matchNames(["MCA"], deps).ids.includes("d4"));

// review
const ok = { ...blankJd({ title: "Engineer", company: "Acme", description: "A job description that is long enough to count." }), jobType: "FULL_TIME" as const, requirements: [{ id: "r1", kind: "SKILL" as const, text: "Python", level: "MANDATORY" as const, weight: 5, needsCheck: false }] };
assert.deepEqual(reviewProblems(ok), []);
assert.ok(reviewProblems({ ...ok, requirements: [] }).some((p) => /requirement/.test(p)));
assert.ok(reviewProblems({ ...ok, requirements: [{ ...ok.requirements[0], needsCheck: true }] }).some((p) => /still need/.test(p)));
assert.ok(reviewProblems({ ...ok, jobType: null }).some((p) => /employment type/.test(p)));
assert.ok(reviewProblems({ ...ok, title: "" }).length >= 1);
assert.ok(reviewProblems({ ...ok, scoring: { skills: 50, qualification: 15, experience: 20, assessments: 15, communication: 10 } }).some((p) => /add up to 110/.test(p)));
assert.equal(scoringProblem(ok.scoring), null);
assert.ok(reviewProblems({ ...ok, eligibility: { ...ok.eligibility, branchesAsStated: ["CSE"] } }).some((p) => /Match them/.test(p)));
assert.deepEqual(reviewProblems({ ...ok, eligibility: { ...ok.eligibility, branchesAsStated: ["CSE"], departmentIds: ["00000000-0000-4000-8000-000000000001"] } }), []);

// shares
const sh = requirementShares({ ...ok, requirements: [{ ...ok.requirements[0], id: "a", weight: 5 }, { ...ok.requirements[0], id: "b", level: "PREFERRED", weight: 5 }, { ...ok.requirements[0], id: "c", kind: "OTHER", weight: 3 }] });
assert.deepEqual([sh[0].share, sh[1].share, sh[2].share], [66.7, 33.3, 100], "a mandatory item counts double a preferred one, within its own kind");

// drive and student view
const d = driveFromJd(data);
assert.deepEqual([d.role, d.jobType, d.packageMinLpa, d.minCgpa, d.maxActiveBacklogs], ["Software Engineer", "FULL_TIME", 6, 7, 0]);
assert.deepEqual(d.rounds.map((r) => r.type), ["APTITUDE", "TECHNICAL", "HR"]);
assert.equal(roundTypeOf("Group Discussion"), "GROUP_DISCUSSION");
assert.equal(roundTypeOf("Coding assessment"), "CODING");
assert.equal(roundTypeOf("Fit chat"), "OTHER");
const pv = publicView({ ...ok, requirements: [ok.requirements[0], { ...ok.requirements[0], id: "r2", text: "AWS", level: "PREFERRED" }] });
assert.deepEqual([pv.mandatory.map((x) => x.text), pv.preferred.map((x) => x.text)], [["Python"], ["AWS"]]);
assert.ok(!("scoring" in pv) && !("requirements" in pv), "the scoring weights are not shown to students");

// file text
assert.equal(docxXmlText("<w:p><w:r><w:t>Hello &amp; welcome</w:t></w:r></w:p><w:p><w:r><w:t>Line two</w:t></w:r></w:p>"), "Hello & welcome\nLine two");
// workflow
const o = (x: object = {}) => ({ admin: false, problems: [] as string[], driveLive: false, ...x });
assert.deepEqual(nextJdState("DRAFT", "SUBMIT", o()), { state: "IN_REVIEW" });
assert.ok("error" in nextJdState("DRAFT", "SUBMIT", o({ problems: ["Add the job title"] })), "an incomplete JD cannot go for review");
assert.ok("error" in nextJdState("IN_REVIEW", "APPROVE", o()), "an officer cannot approve");
assert.deepEqual(nextJdState("IN_REVIEW", "APPROVE", o({ admin: true })), { state: "APPROVED" });
assert.deepEqual(nextJdState("DRAFT", "APPROVE", o({ admin: true })), { state: "APPROVED" }, "the admin may approve their own draft");
assert.ok("error" in nextJdState("IN_REVIEW", "APPROVE", o({ admin: true, problems: ["x"] })), "approval needs every check settled");
assert.ok("error" in nextJdState("IN_REVIEW", "REJECT", o({ admin: true })), "sending back needs a reason");
assert.deepEqual(nextJdState("IN_REVIEW", "REJECT", o({ admin: true, note: "Fix the skills" })), { state: "DRAFT" });
assert.deepEqual(nextJdState("APPROVED", "REOPEN", o({ admin: true })), { state: "DRAFT" });
assert.ok("error" in nextJdState("APPROVED", "REOPEN", o({ admin: true, driveLive: true })), "a live drive blocks reopening");
assert.ok("error" in nextJdState("APPROVED", "ARCHIVE", o({ driveLive: true })));
assert.deepEqual(nextJdState("APPROVED", "ARCHIVE", o()), { state: "ARCHIVED" });
assert.ok("error" in nextJdState("APPROVED", "SUBMIT", o()));
console.log("jd ok");

import assert from "node:assert/strict";
import { attendanceSummary, checkEligibility, completionBlocked, completionChecks, markProblem, nextApplication, nextTask, postingProblems, ppoMove, ppoStats, workingDays } from "../../lib/internships";

const open = { minCgpa: null, minTenthPct: null, minTwelfthPct: null, maxActiveBacklogs: null, departmentIds: [], batchIds: [], programIds: [], allowPlaced: true };
const me = { departmentId: "d1", batchId: "b1", programId: "p1", isPlaced: false, hasRunningInternship: false, onboarded: true, academics: { cgpa: 7.5, tenthPercentage: 80, twelfthPercentage: 75, activeBacklogs: 0 } };

// eligibility
assert.deepEqual(checkEligibility(open, me), []);
assert.equal(checkEligibility({ ...open, departmentIds: ["d2"] }, me).length, 1);
assert.equal(checkEligibility({ ...open, batchIds: ["b2"] }, me).length, 1);
assert.equal(checkEligibility({ ...open, programIds: ["p2"] }, { ...me, programId: null }).length, 1);
assert.equal(checkEligibility({ ...open, allowPlaced: false }, { ...me, isPlaced: true }).length, 1);
assert.equal(checkEligibility(open, { ...me, isPlaced: true }).length, 0, "internships may allow placed students");
assert.equal(checkEligibility(open, { ...me, hasRunningInternship: true }).length, 1);
assert.equal(checkEligibility(open, { ...me, onboarded: false }).length, 1);
assert.deepEqual(checkEligibility({ ...open, minCgpa: 7 }, me), []);
assert.equal(checkEligibility({ ...open, minCgpa: 8 }, me).length, 1);
assert.equal(checkEligibility({ ...open, minCgpa: 7 }, { ...me, academics: null }).length, 1, "unverified marks never pass");
assert.equal(checkEligibility({ ...open, minCgpa: 7 }, { ...me, academics: { tenthPercentage: 90 } }).length, 1, "a missing figure fails");
assert.equal(checkEligibility({ ...open, maxActiveBacklogs: 0 }, { ...me, academics: { ...me.academics, activeBacklogs: 1 } }).length, 1);
assert.equal(checkEligibility({ ...open, minTenthPct: 85, minTwelfthPct: 80 }, me).length, 2, "every failed rule is listed");

// posting
const now = new Date("2026-11-10T00:00:00Z"), D = (s: string) => new Date(s);
const post = { companyConfirmed: true, applicationDeadline: D("2026-12-01"), startDate: D("2026-12-15"), endDate: D("2027-02-15"), openings: 5 };
assert.deepEqual(postingProblems(post, now), []);
assert.equal(postingProblems({ ...post, companyConfirmed: false }, now).length, 1);
assert.equal(postingProblems({ ...post, applicationDeadline: D("2026-11-01") }, now).length >= 1, true);
assert.equal(postingProblems({ ...post, startDate: D("2026-11-20") }, now).length, 1);
assert.equal(postingProblems({ ...post, endDate: D("2026-12-01") }, now).length, 1);
assert.equal(postingProblems({ ...post, openings: 0 }, now).length, 1);

// applications
assert.deepEqual(nextApplication("APPLIED", "COLLEGE_APPROVE", false), { status: "COLLEGE_APPROVED" });
assert.deepEqual(nextApplication("APPLIED", "COLLEGE_APPROVE", true), { status: "ALLOTTED" }, "a self-found internship needs only the college");
assert.ok("error" in nextApplication("APPLIED", "COMPANY_SELECT", false), "the college comes first");
assert.deepEqual(nextApplication("COLLEGE_APPROVED", "COMPANY_SELECT", false), { status: "ALLOTTED" });
assert.deepEqual(nextApplication("COLLEGE_APPROVED", "COMPANY_REJECT", false), { status: "COMPANY_REJECTED" });
assert.ok("error" in nextApplication("COLLEGE_APPROVED", "COMPANY_SELECT", true));
assert.deepEqual(nextApplication("COLLEGE_APPROVED", "WITHDRAW", false), { status: "WITHDRAWN" });
assert.ok("error" in nextApplication("ALLOTTED", "WITHDRAW", false));
assert.ok("error" in nextApplication("COLLEGE_REJECTED", "COLLEGE_APPROVE", false));

// working days and attendance
assert.equal(workingDays(D("2026-11-02"), D("2026-11-08"), [1, 2, 3, 4, 5]).length, 5);
assert.deepEqual(workingDays(D("2026-11-07"), D("2026-11-09"), [6]), ["2026-11-07"]);
const cfg = { start: D("2026-11-02"), end: D("2026-12-31"), workDays: [1, 2, 3, 4, 5], today: D("2026-11-10T09:00:00Z") };
assert.equal(markProblem("2026-11-09", cfg), null);
assert.match(markProblem("2026-11-11", cfg)!, /not happened/);
assert.match(markProblem("2026-11-01", cfg)!, /last 7 days|outside/);
assert.match(markProblem("2026-11-08", cfg)!, /working days/, "a Sunday");
assert.match(markProblem("2026-10-30", { ...cfg, start: D("2026-11-02") })!, /last 7 days/);
assert.match(markProblem("nope", cfg)!, /Choose a date/);
const marks = [{ date: "2026-11-02", status: "PRESENT" as const, verified: true }, { date: "2026-11-03", status: "PRESENT" as const, verified: false }, { date: "2026-11-04", status: "LEAVE" as const, verified: true }, { date: "2026-11-05", status: "ABSENT" as const, verified: true }];
const a = attendanceSummary({ ...cfg, marks });
assert.deepEqual([a.workingDays, a.present, a.absent, a.leave, a.unmarked, a.unverified, a.verifiedPresent, a.percent], [7, 2, 1, 1, 3, 1, 1, 33]);
assert.equal(attendanceSummary({ ...cfg, today: D("2026-10-20"), marks: [] }).percent, null, "before the start there is nothing to count");
assert.equal(attendanceSummary({ ...cfg, end: D("2026-11-06"), today: D("2027-01-01"), marks: [] }).workingDays, 5, "counting stops at the end date");

// tasks
assert.deepEqual(nextTask("ASSIGNED", "SUBMIT"), { status: "SUBMITTED" });
assert.deepEqual(nextTask("CHANGES_REQUESTED", "SUBMIT"), { status: "SUBMITTED" });
assert.ok("error" in nextTask("SUBMITTED", "SUBMIT"));
assert.ok("error" in nextTask("APPROVED", "SUBMIT"));
assert.deepEqual(nextTask("SUBMITTED", "APPROVE"), { status: "APPROVED" });
assert.deepEqual(nextTask("SUBMITTED", "REQUEST_CHANGES"), { status: "CHANGES_REQUESTED" });
assert.ok("error" in nextTask("ASSIGNED", "APPROVE"), "nothing to review");

// completion
const done = { status: "ONGOING", endDate: D("2026-11-09"), today: now, evaluations: 1, logsPending: 0, tasksOpen: 0, attendancePercent: 90, certificate: "VERIFIED" };
assert.deepEqual(completionBlocked(completionChecks(done)), []);
assert.equal(completionBlocked(completionChecks({ ...done, endDate: D("2026-12-01") })).map((c) => c.key)[0], "ended");
assert.deepEqual(completionBlocked(completionChecks({ ...done, evaluations: 0, logsPending: 2, tasksOpen: 1 })).map((c) => c.key), ["evaluation", "logs", "tasks"]);
assert.deepEqual(completionBlocked(completionChecks({ ...done, attendancePercent: 50, certificate: "NONE" })), [], "attendance and certificate are warnings, not blockers");
assert.equal(completionChecks({ ...done, attendancePercent: 50 }).find((c) => c.key === "attendance")!.ok, false);
assert.equal(completionBlocked(completionChecks({ ...done, status: "ALLOTTED" })).length, 1);

// PPO
assert.deepEqual(ppoMove("NONE", "OFFERED"), { ok: true });
assert.ok("error" in ppoMove("NONE", "ACCEPTED"));
assert.ok("error" in ppoMove("ACCEPTED", "DECLINED"));
assert.ok("error" in ppoMove("OFFERED", "OFFERED"));
assert.deepEqual(ppoMove("OFFERED", "ACCEPTED"), { ok: true });
const ps = ppoStats([{ ppo: "ACCEPTED" }, { ppo: "DECLINED" }, { ppo: "NONE" }, { ppo: "OFFERED" }]);
assert.deepEqual([ps.completed, ps.offered, ps.accepted, ps.offeredPercent, ps.conversionPercent], [4, 3, 1, 75, 25]);
assert.equal(ppoStats([]).conversionPercent, null);
console.log("internships ok");

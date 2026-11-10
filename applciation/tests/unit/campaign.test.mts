import assert from "node:assert/strict";
import { campaignProblems, dashboardOf, dayDate, draftPlan, interviewCounts, interviewKindOf, memberProgress, nextMember, windowDays, type PlanInput } from "../../lib/campaign";

const start = new Date("2026-12-01T00:00:00Z");
const base = (o: Partial<PlanInput> = {}): PlanInput => ({ startsAt: start, deadline: new Date("2026-12-07T00:00:00Z"), gaps: [], prep: {}, weak: { aptitude: false, communication: false }, mockTests: [], mockInterviews: [], resources: [], jobRole: "Data Analyst", ...o });

// window
assert.equal(windowDays(start, new Date("2026-12-07T00:00:00Z")), 7);
assert.equal(windowDays(start, new Date("2026-12-01T00:00:00Z")), 3, "never fewer than 3 days");
assert.equal(windowDays(start, new Date("2027-12-01T00:00:00Z")), 60, "never more than 60");
assert.equal(dayDate(start, 3).toISOString().slice(0, 10), "2026-12-03");

// the plan
const gaps = [{ skill: "Tableau", status: "PARTIAL" as const, mandatory: false, weight: 5 }, { skill: "SQL", status: "MISSING" as const, mandatory: true, weight: 8 }, { skill: "Java", status: "MISSING" as const, mandatory: false, weight: 5 }];
const prep = { SQL: { course: { id: "c1", title: "SQL basics" } }, Java: { resource: { id: "r1", title: "Java notes" } } };
const plan = draftPlan(base({ gaps, prep }));
assert.deepEqual(plan.map((p) => p.day), [...plan.map((p) => p.day)].sort((a, b) => a - b), "the plan runs in day order");
assert.equal(plan[0].skill, "SQL", "a required, missing skill comes first");
assert.deepEqual([plan[0].kind, plan[0].refType, plan[0].refId], ["COURSE", "COURSE", "c1"]);
assert.ok(plan.some((p) => p.skill === "Java" && p.kind === "RESOURCE" && p.refId === "r1"), "no course, so study material");
assert.ok(plan.some((p) => p.skill === "Tableau" && p.kind === "PRACTICE"), "a partly matched skill is about building evidence");
const last = plan.filter((p) => p.day === 7);
assert.ok(last.some((p) => p.kind === "REVISION"), "the last day is revision");
assert.equal(plan.find((p) => p.title === "HR mock interview")!.day, 6, "HR the day before");
assert.equal(plan.find((p) => p.title === "Technical mock interview")!.day, 5);
assert.ok(plan.every((p) => p.day >= 1 && p.day <= 7));
assert.ok([...new Set(plan.map((p) => p.day))].every((d) => plan.filter((p) => p.day === d && !p.optional && p.kind !== "REVISION" && p.kind !== "MOCK_INTERVIEW").length <= 3));

// a skill nothing teaches still gets a task
const lone = draftPlan(base({ gaps: [{ skill: "Kubernetes", status: "MISSING", mandatory: true, weight: 5 }] }));
assert.ok(lone.some((p) => p.kind === "LEARN" && /Kubernetes/.test(p.title)));

// scheduled tests and interviews are put where staff said
const sched = draftPlan(base({ mockTests: [{ scheduleId: "s1", title: "Aptitude mock", date: "2026-12-03T10:00:00Z", kind: "APTITUDE" }], mockInterviews: [{ title: "Panel practice", date: "2026-12-05T10:00:00Z", kind: "TECHNICAL" }] }));
assert.equal(sched.find((p) => p.kind === "MOCK_TEST")!.day, 3);
assert.equal(sched.find((p) => p.title === "Panel practice")!.day, 5);
assert.ok(!sched.some((p) => p.title === "Technical mock interview"), "a scheduled technical interview replaces the default one");
assert.equal(sched.find((p) => p.kind === "MOCK_TEST")!.refId, "s1");
// weak areas add practice
const weak = draftPlan(base({ weak: { aptitude: true, communication: true } }));
assert.ok(weak.some((p) => /aptitude/i.test(p.title)) && weak.some((p) => /communication/i.test(p.title)));
assert.ok(!draftPlan(base({ weak: { aptitude: true, communication: false }, mockTests: [{ scheduleId: "s1", title: "Aptitude mock", date: null, kind: "APTITUDE" }] })).some((p) => /Practise aptitude/.test(p.title)), "a scheduled aptitude test is enough");
// too much for the window: the least important become optional
const many = draftPlan(base({ deadline: new Date("2026-12-03T00:00:00Z"), gaps: Array.from({ length: 10 }, (_, k) => ({ skill: `Skill${k}`, status: "MISSING" as const, mandatory: k < 2, weight: 5 })) }));
assert.ok(many.some((p) => p.optional), "an overfull window marks items optional instead of cramming");
assert.ok(many.filter((p) => p.skill && !p.optional).some((p) => ["Skill0", "Skill1"].includes(p.skill!)), "the required skills are among those that stay");
assert.ok(many.filter((p) => p.optional).every((p) => !["Skill0", "Skill1"].includes(p.skill ?? "")), "required skills are never the ones made optional");
assert.equal(draftPlan(base({ resources: [{ id: "r9", title: "Aptitude pack" }] })).filter((p) => p.refId === "r9").length, 1, "campaign-wide resources reach every plan");

// progress
const now = new Date("2026-12-04T12:00:00Z");
const it = (day: number, status: string, o: object = {}) => ({ kind: "LEARN", status, dueAt: dayDate(start, day), ...o });
assert.deepEqual(memberProgress([], now).total, 0);
const p1 = memberProgress([it(1, "DONE"), it(2, "DONE"), it(3, "DONE"), it(6, "PENDING"), it(7, "PENDING")], now);
assert.deepEqual([p1.percent, p1.overdue, p1.behind, p1.ready], [60, 0, false, false]);
const p2 = memberProgress([it(1, "PENDING"), it(2, "PENDING"), it(3, "DONE"), it(6, "PENDING")], now);
assert.equal(p2.behind, true, "two late items");
assert.equal(memberProgress([it(1, "PENDING"), it(5, "DONE"), it(6, "DONE"), it(7, "DONE")], now).behind, false, "one late item with good progress is fine");
assert.equal(memberProgress([it(1, "DONE"), it(2, "DONE"), it(7, "DONE", { optional: true }), it(9, "PENDING", { optional: true })], now).ready, true, "optional items never hold someone back");
assert.equal(memberProgress([it(1, "DONE"), it(2, "SKIPPED")], now).total, 1, "skipped items are not counted");
assert.equal(memberProgress([it(5, "PENDING"), it(6, "PENDING")], now).nextDue!.toISOString().slice(0, 10), "2026-12-05");

// invitation steps
assert.deepEqual(nextMember("SELECTED", "INVITE"), { status: "INVITED" });
assert.ok("error" in nextMember("INVITED", "INVITE"));
assert.deepEqual(nextMember("INVITED", "ACCEPT"), { status: "ACCEPTED" });
assert.deepEqual(nextMember("DECLINED", "ACCEPT"), { status: "ACCEPTED" }, "a student may change their mind");
assert.ok("error" in nextMember("SELECTED", "ACCEPT"), "cannot accept before being invited");
assert.deepEqual(nextMember("ACCEPTED", "DECLINE"), { status: "DECLINED" });
assert.deepEqual(nextMember("ACCEPTED", "REMOVE"), { status: "REMOVED" });
assert.ok("error" in nextMember("REMOVED", "INVITE"));

// dashboard
const dm = (status: string, items: ReturnType<typeof it>[], o: object = {}) => ({ status: status as "ACCEPTED", startedAt: null, helpOpen: false, markedReady: false, items, groupId: null, ...o });
const d = dashboardOf([
  dm("SELECTED", []), dm("INVITED", []), dm("DECLINED", []), dm("REMOVED", [it(1, "DONE")]),
  dm("ACCEPTED", [{ ...it(1, "DONE"), kind: "RESOURCE" }, { ...it(2, "DONE"), kind: "MOCK_TEST" }, { ...it(3, "DONE"), kind: "MOCK_INTERVIEW" }], { helpOpen: true }),
  dm("ACCEPTED", [it(1, "PENDING"), it(2, "PENDING"), it(3, "PENDING")]),
], now);
assert.deepEqual([d.selected, d.invited, d.accepted, d.declined, d.awaitingReply], [5, 4, 2, 1, 1], "a removed student is not counted");
assert.deepEqual([d.started, d.resourcesCompleted, d.mockTestsCompleted, d.mockInterviewsCompleted, d.needingHelp, d.behind], [1, 1, 1, 1, 1, 1]);
assert.equal(d.ready, 1);
assert.equal(dashboardOf([dm("INVITED", [])]).averageProgress, null);

// interviews and problems
assert.equal(interviewCounts("Technical interview: SQL", new Date("2026-12-02"), new Date("2026-12-01"), "TECHNICAL"), true);
assert.equal(interviewCounts("Technical interview: SQL", new Date("2026-12-02"), new Date("2026-12-01"), "HR"), false);
assert.equal(interviewCounts("HR and behavioural interview", new Date("2026-12-02"), new Date("2026-12-01"), "HR"), true);
assert.equal(interviewCounts("Technical interview", new Date("2026-11-20"), new Date("2026-12-01"), "TECHNICAL"), false, "an interview from before the plan does not count");
assert.equal(interviewKindOf("HR and behavioural interview"), "HR");
assert.equal(interviewKindOf("Technical interview for Analyst"), "TECHNICAL");
const ok = { name: "Globex prep", startsAt: start, deadline: new Date("2026-12-07T00:00:00Z"), members: 3, invited: 0 };
assert.deepEqual(campaignProblems(ok, new Date("2026-11-20")), []);
assert.equal(campaignProblems({ ...ok, members: 0 }, new Date("2026-11-20")).length, 1);
assert.equal(campaignProblems({ ...ok, deadline: start }, new Date("2026-11-20")).length, 1);
assert.equal(campaignProblems(ok, new Date("2027-01-20")).length, 1);
console.log("campaign ok");

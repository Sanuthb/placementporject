import assert from "node:assert/strict";
import { CRITERIA, canJoin, contributions, evaluate, milestonesFromTemplate, parseGithub, projectVisibleTo, scoreRubric, submitProblems, summariseContributors, teamProblems, teamProgress } from "../../lib/projects";

// GitHub links
assert.deepEqual(parseGithub("https://github.com/octocat/Hello-World"), { owner: "octocat", repo: "Hello-World" });
assert.deepEqual(parseGithub("https://github.com/octocat/Hello-World.git/"), { owner: "octocat", repo: "Hello-World" });
assert.equal(parseGithub("https://github.com/octocat"), null);
assert.equal(parseGithub("https://evil.com/github.com/octocat/x"), null);
assert.equal(parseGithub("http://github.com/octocat/x"), null, "https only");
assert.equal(parseGithub("https://github.com/octocat/x/../../etc"), null);
assert.equal(parseGithub("https://github.com/octocat/x?tab=readme"), null);
const sum = summariseContributors([{ login: "a", contributions: 5, type: "User" }, { login: "b", contributions: 9, type: "User" }, { login: "bot", contributions: 50, type: "Bot" }, { login: 3, contributions: 1 }, { login: "c", contributions: -2 }]);
assert.deepEqual([sum.totalCommits, sum.contributors.map((c) => c.login)], [14, ["b", "a"]]);

// team rules
const P = (type: string, min = 1, max = 1) => ({ type, minTeamSize: min, maxTeamSize: max });
const m = (id: string, dep = "d1") => ({ studentId: id, departmentId: dep });
assert.deepEqual(teamProblems(P("INDIVIDUAL"), [m("a")]), []);
assert.equal(teamProblems(P("INDIVIDUAL"), [m("a"), m("b")]).length, 1);
assert.equal(teamProblems(P("TEAM", 2, 4), [m("a")]).length, 1);
assert.deepEqual(teamProblems(P("TEAM", 2, 4), [m("a"), m("b")]), []);
assert.equal(teamProblems(P("TEAM", 2, 3), [m("a"), m("b"), m("c"), m("d")]).length, 1);
assert.equal(teamProblems(P("INTERDISCIPLINARY", 2, 4), [m("a"), m("b")]).length, 1, "needs two departments");
assert.deepEqual(teamProblems(P("INTERDISCIPLINARY", 2, 4), [m("a"), m("b", "d2")]), []);
assert.equal(canJoin(P("INDIVIDUAL"), 1), false);
assert.equal(canJoin(P("TEAM", 2, 4), 3), true);
assert.equal(canJoin(P("TEAM", 2, 4), 4), false);
assert.equal(projectVisibleTo({ departmentIds: [], batchIds: [], type: "TEAM" }, { departmentId: "d1", batchId: "b1" }), true);
assert.equal(projectVisibleTo({ departmentIds: ["d2"], batchIds: [], type: "TEAM" }, { departmentId: "d1", batchId: "b1" }), false);
assert.equal(projectVisibleTo({ departmentIds: ["d2", "d3"], batchIds: [], type: "INTERDISCIPLINARY" }, { departmentId: "d1", batchId: "b1" }), true, "interdisciplinary welcomes other departments");
assert.equal(projectVisibleTo({ departmentIds: [], batchIds: ["b9"], type: "TEAM" }, { departmentId: "d1", batchId: "b1" }), false);

// milestones and progress
const start = new Date("2026-01-01T00:00:00Z");
const ms = milestonesFromTemplate([{ title: "Design", dueInDays: 14 }, { title: "  ", dueInDays: 3 }, { title: "Demo", dueInDays: 60 }, { title: "Bad", dueInDays: -1 }, "x"], start);
assert.deepEqual(ms.map((x) => [x.title, x.sortOrder, x.dueAt.toISOString().slice(0, 10)]), [["Design", 1, "2026-01-15"], ["Demo", 2, "2026-03-02"]]);
assert.deepEqual(milestonesFromTemplate("nope", start), []);
const now = new Date("2026-02-01T00:00:00Z");
const pr = teamProgress([{ dueAt: new Date("2026-01-15T00:00:00Z"), doneAt: new Date("2026-01-14T00:00:00Z") }, { dueAt: new Date("2026-01-20T00:00:00Z"), doneAt: null }], [{ status: "DONE", dueAt: null }, { status: "TODO", dueAt: new Date("2026-01-25T00:00:00Z") }, { status: "TODO", dueAt: null }], now);
assert.deepEqual([pr.milestonesDone, pr.tasksDone, pr.overdue, pr.percent], [1, 1, 2, 42]);
assert.equal(teamProgress([], [], now).percent, 0);

// contributions
const w = (id: string, o = {}) => ({ studentId: id, githubUsername: null as string | null, tasksDone: 0, tasksAssigned: 0, updates: 0, files: 0, ...o });
let c = contributions([w("a", { tasksDone: 6 }), w("b", { tasksDone: 6 }), w("c", { tasksDone: 0, updates: 1 })]);
assert.deepEqual(c.map((x) => x.lowContribution), [false, false, true]);
assert.equal(c.reduce((a, x) => a + x.sharePercent, 0) >= 99, true);
c = contributions([w("a", { githubUsername: "Alice" }), w("b", { githubUsername: "bob" })], [{ login: "alice", commits: 30 }, { login: "bob", commits: 30 }]);
assert.deepEqual(c.map((x) => x.sharePercent), [50, 50], "usernames match without regard to case");
c = contributions([w("a", { githubUsername: "a" }), w("b", { tasksDone: 1 })], [{ login: "a", commits: 5000 }]);
assert.ok(c[0].points <= 20 + 0.001, "commit counts are capped");
assert.deepEqual(contributions([w("a")]).map((x) => x.lowContribution), [false], "a lone member is never flagged");
assert.deepEqual(contributions([w("a"), w("b")]).map((x) => x.sharePercent), [0, 0], "no recorded work, no shares");

// rubric
const full = Object.fromEntries(CRITERIA.map((k) => [k.key, 8]));
assert.deepEqual(scoreRubric(full), { percent: 80 });
assert.ok("error" in scoreRubric({ ...full, technical: 11 }));
assert.ok("error" in scoreRubric({ ...full, technical: 7.5 }));
assert.ok("error" in scoreRubric({ problem: 5 }));

// result
const rv = (reviewerType: string, percent: number, isFinal = true, individualMarks: Record<string, number> = {}) => ({ reviewerType, percent, isFinal, individualMarks });
assert.equal(evaluate([rv("FACULTY", 70, false)], ["a"]), null, "only final reviews count");
assert.deepEqual(evaluate([rv("FACULTY", 80)], ["a", "b"]), { teamPercent: 80, members: { a: 80, b: 80 } });
assert.equal(evaluate([rv("FACULTY", 80), rv("INDUSTRY", 60)], ["a"])!.teamPercent, 72, "60/40 weighting");
assert.equal(evaluate([rv("INDUSTRY", 60)], ["a"])!.teamPercent, 60);
assert.equal(evaluate([rv("FACULTY", 80), rv("STAFF", 60)], ["a"])!.teamPercent, 70, "faculty and staff share the college side");
assert.deepEqual(evaluate([rv("FACULTY", 80, true, { a: 10, b: 4 })], ["a", "b", "c"])!.members, { a: 90, b: 60, c: 80 }, "individual marks move one student without moving the team");

// submit
assert.deepEqual(submitProblems("ACTIVE", [], true), []);
assert.equal(submitProblems("FORMING", [], true).length, 1);
assert.equal(submitProblems("SUBMITTED", [], true).length, 1);
assert.equal(submitProblems("ACTIVE", [], false).length, 1);
console.log("projects ok");

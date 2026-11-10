/** Pure project rules: GitHub links, team rules, milestones, contribution measures, the review rubric and the result. No database here. */

// ---- GitHub ----
/** owner and repo from a GitHub repository link, or null. Only plain github.com repository addresses are accepted. */
export function parseGithub(url: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(url.trim());
  return m && m[2] !== "." && m[2] !== ".." ? { owner: m[1], repo: m[2] } : null;
}

export type RepoStats = { fullName: string; pushedAt: string | null; totalCommits: number; contributors: { login: string; commits: number }[]; fetchedAt: string };

/** Commits per person from a repository's contributor list: totals, and the list cleaned and sorted. Bots are left out of the people list. */
export function summariseContributors(raw: { login?: unknown; contributions?: unknown; type?: unknown }[]): { totalCommits: number; contributors: { login: string; commits: number }[] } {
  const list = raw.flatMap((c) => (typeof c.login === "string" && typeof c.contributions === "number" && c.contributions >= 0 && c.type !== "Bot" ? [{ login: c.login, commits: Math.floor(c.contributions) }] : []));
  return { totalCommits: list.reduce((a, c) => a + c.commits, 0), contributors: list.sort((a, b) => b.commits - a.commits) };
}

// ---- teams ----
export type ProjectLite = { type: string; minTeamSize: number; maxTeamSize: number };
export type MemberLite = { studentId: string; departmentId: string };

/** What is wrong with a team before it can start. An empty list means it can. */
export function teamProblems(p: ProjectLite, members: MemberLite[]): string[] {
  const out: string[] = [];
  const n = members.length;
  const [min, max] = p.type === "INDIVIDUAL" ? [1, 1] : [Math.max(2, p.minTeamSize), Math.max(p.maxTeamSize, p.minTeamSize)];
  if (n < min) out.push(`The team needs at least ${min} member${min === 1 ? "" : "s"} (it has ${n})`);
  if (n > max) out.push(`The team can have at most ${max} member${max === 1 ? "" : "s"} (it has ${n})`);
  if (p.type === "INTERDISCIPLINARY" && new Set(members.map((m) => m.departmentId)).size < 2) out.push("An interdisciplinary project needs members from at least two departments");
  return out;
}

export const canJoin = (p: ProjectLite, memberCount: number) => (p.type === "INDIVIDUAL" ? 1 : Math.max(p.maxTeamSize, p.minTeamSize)) > memberCount;

/** Whether a student may take a project: its audience is empty (everyone) or includes their department and batch. */
export const projectVisibleTo = (p: { departmentIds: string[]; batchIds: string[]; type: string }, s: { departmentId: string; batchId: string }) =>
  (!p.batchIds.length || p.batchIds.includes(s.batchId)) && (!p.departmentIds.length || p.departmentIds.includes(s.departmentId) || p.type === "INTERDISCIPLINARY");

// ---- milestones ----
export type MilestoneTemplate = { title: string; dueInDays: number };
export function milestonesFromTemplate(tpl: unknown, start: Date): { title: string; dueAt: Date; sortOrder: number }[] {
  if (!Array.isArray(tpl)) return [];
  return tpl.flatMap((m) => (m && typeof m.title === "string" && m.title.trim() && Number.isFinite(m.dueInDays) && m.dueInDays >= 0 && m.dueInDays <= 730 ? [{ title: m.title.trim().slice(0, 200), dueInDays: Math.floor(m.dueInDays) }] : []))
    .slice(0, 20).map((m, i) => ({ title: m.title, dueAt: new Date(start.getTime() + m.dueInDays * 86_400_000), sortOrder: i + 1 }));
}

/** How far a team has got, from its milestones and tasks. */
export function teamProgress(milestones: { dueAt: Date | null; doneAt: Date | null }[], tasks: { status: string; dueAt: Date | null }[], now = new Date()) {
  const mDone = milestones.filter((m) => m.doneAt).length, tDone = tasks.filter((t) => t.status === "DONE").length;
  const overdue = milestones.filter((m) => !m.doneAt && m.dueAt && m.dueAt < now).length + tasks.filter((t) => t.status !== "DONE" && t.dueAt && t.dueAt < now).length;
  const parts = [milestones.length ? mDone / milestones.length : null, tasks.length ? tDone / tasks.length : null].filter((x): x is number => x !== null);
  return { milestonesDone: mDone, milestonesTotal: milestones.length, tasksDone: tDone, tasksTotal: tasks.length, overdue, percent: parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : 0 };
}

// ---- individual contribution ----
export type MemberWork = { studentId: string; githubUsername: string | null; tasksDone: number; tasksAssigned: number; updates: number; files: number };
const COMMIT_CAP = 40; // a big pile of tiny commits must not outweigh real work
export const WEIGHTS = { task: 3, update: 1, file: 2, commit: 0.5 } as const;

/**
 * Each member's share of the team's recorded work, so one person's effort can be seen apart from the team result. Tasks finished, updates written, files
 * uploaded and commits (matched by the GitHub name the student gave; capped) all count, with tasks counting most. A member with less than half of a fair
 * share is flagged for the reviewer. This measures recorded activity, not quality, and a reviewer decides what it means.
 */
export function contributions(members: MemberWork[], commits: { login: string; commits: number }[] = []) {
  const byLogin = new Map(commits.map((c) => [c.login.toLowerCase(), c.commits]));
  const rows = members.map((m) => {
    const c = m.githubUsername ? (byLogin.get(m.githubUsername.toLowerCase()) ?? 0) : 0;
    const points = m.tasksDone * WEIGHTS.task + m.updates * WEIGHTS.update + m.files * WEIGHTS.file + Math.min(c, COMMIT_CAP) * WEIGHTS.commit;
    return { ...m, commits: c, points };
  });
  const total = rows.reduce((a, r) => a + r.points, 0);
  const fair = rows.length ? 100 / rows.length : 0;
  return rows.map((r) => {
    const share = total ? Math.round((r.points / total) * 100) : 0;
    return { ...r, sharePercent: share, lowContribution: rows.length > 1 && total > 0 && share < fair / 2 };
  });
}

// ---- review rubric and result ----
export const CRITERIA = [
  { key: "problem", label: "Understanding of the problem" }, { key: "technical", label: "Technical depth and quality" }, { key: "documentation", label: "Documentation" },
  { key: "presentation", label: "Presentation" }, { key: "teamwork", label: "Teamwork and process" },
] as const;

/** Checks a rubric: every criterion has a whole mark from 0 to 10. Returns the percent, or an error message. */
export function scoreRubric(scores: Record<string, unknown>): { percent: number } | { error: string } {
  let sum = 0;
  for (const c of CRITERIA) {
    const v = scores[c.key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10) return { error: `${c.label}: give a whole mark from 0 to 10` };
    sum += v;
  }
  return { percent: Math.round((sum / (CRITERIA.length * 10)) * 100) };
}

export type ReviewLite = { reviewerType: string; percent: number; isFinal: boolean; individualMarks: Record<string, number> };

/**
 * The team's result from its final reviews: faculty and staff reviews count as one side, industry reviews as the other, and when both exist they are
 * weighted 60/40 (the college's own assessment counts a little more). With one side only, that side is the result. Each member's result starts from the
 * team result and moves with the 0-10 individual marks reviewers gave them (those marks, as a percent, are averaged with the team result).
 */
export function evaluate(reviews: ReviewLite[], studentIds: string[]): { teamPercent: number; members: Record<string, number> } | null {
  const fin = reviews.filter((r) => r.isFinal);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const college = fin.filter((r) => r.reviewerType !== "INDUSTRY").map((r) => r.percent), industry = fin.filter((r) => r.reviewerType === "INDUSTRY").map((r) => r.percent);
  if (!college.length && !industry.length) return null;
  const team = college.length && industry.length ? 0.6 * avg(college) + 0.4 * avg(industry) : avg(college.length ? college : industry);
  const members: Record<string, number> = {};
  for (const id of studentIds) {
    const marks = fin.flatMap((r) => (typeof r.individualMarks?.[id] === "number" ? [r.individualMarks[id] * 10] : []));
    members[id] = Math.round(marks.length ? (team + avg(marks)) / 2 : team);
  }
  return { teamPercent: Math.round(team), members };
}

/** Whether a team may be submitted: the team is active, nothing is wrong with it, and it has some record of work. */
export function submitProblems(status: string, problems: string[], hasWork: boolean): string[] {
  const out = [...problems];
  if (status === "SUBMITTED" || status === "EVALUATED") out.push("Already submitted");
  else if (status === "FORMING") out.push("The team has not started yet");
  if (!hasWork) out.push("Record some work first: a task, an update or a file");
  return out;
}

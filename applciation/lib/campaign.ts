/**
 * Preparation campaign rules, pure: building a student's day-by-day plan from their skill gaps, how far along they are and whether they are falling behind, the
 * dashboard figures, and the invitation steps. No database and no AI here: the plan is made by fixed rules, so a person can see why each item is there and change it.
 */

export const PLAN_KINDS = ["LEARN", "COURSE", "RESOURCE", "PRACTICE", "MOCK_TEST", "MOCK_INTERVIEW", "REVISION"] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];
export const KIND_LABEL: Record<PlanKind, string> = { LEARN: "Study", COURSE: "Course", RESOURCE: "Study material", PRACTICE: "Practice", MOCK_TEST: "Mock test", MOCK_INTERVIEW: "Mock interview", REVISION: "Revision" };
export const MAX_DAYS = 60;
const DAY = 86_400_000;

export type Gap = { skill: string; status: "MISSING" | "PARTIAL"; mandatory: boolean; weight: number };
export type PrepRef = { course?: { id: string; title: string }; resource?: { id: string; title: string } };
export type MockTest = { scheduleId: string; title: string; date: string | null; kind?: "APTITUDE" | "TECHNICAL" | "OTHER" };
export type MockInterviewPlan = { title: string; date: string | null; kind: "TECHNICAL" | "HR" };
export type PlanInput = {
  startsAt: Date; deadline: Date; gaps: Gap[]; prep: Record<string, PrepRef>
  weak: { aptitude: boolean; communication: boolean }
  mockTests: MockTest[]; mockInterviews: MockInterviewPlan[]; resources: { id: string; title: string }[]; jobRole: string
}
export type PlanDraft = { day: number; dueAt: Date; kind: PlanKind; title: string; detail?: string; skill?: string; refType?: "COURSE" | "RESOURCE" | "ASSESSMENT" | "MOCK_INTERVIEW"; refId?: string; optional?: boolean }

/** How many days a campaign window gives (start and deadline both count), never fewer than 3 or more than 60. */
export const windowDays = (start: Date, end: Date) => Math.min(MAX_DAYS, Math.max(3, Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / DAY) + 1));
export const dayDate = (start: Date, day: number) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + day - 1, 23, 59, 0));
const dayOf = (start: Date, iso: string | null, days: number, fallback: number) => {
  if (!iso) return fallback;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return fallback;
  return Math.min(days, Math.max(1, Math.round((Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate()) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / DAY) + 1));
};

/**
 * A personal plan for one student. Skills the job requires and the student lacks come first, then partly matched ones; each becomes a course, study material or
 * self-study item. Mock tests and interviews go where the campaign scheduled them (or near the end), the second-to-last day is a human-style HR interview,
 * and the last day is revision and a fresh check. If the window is too short for everything, the least important learning items are marked optional rather than
 * crammed in. At most two items fall on a day.
 */
export function draftPlan(i: PlanInput): PlanDraft[] {
  const days = windowDays(i.startsAt, i.deadline);
  const out: PlanDraft[] = [];
  const load = new Map<number, number>();
  const add = (d: Omit<PlanDraft, "dueAt" | "day">, day: number) => { out.push({ ...d, day, dueAt: dayDate(i.startsAt, day) }); load.set(day, (load.get(day) ?? 0) + 1); };
  const reserved = new Set<number>();

  // the fixed points at the end
  const hrDay = days >= 5 ? days - 1 : days, techDay = days >= 6 ? days - 2 : days;
  for (const mi of i.mockInterviews) {
    const fb = mi.kind === "HR" ? hrDay : techDay, day = dayOf(i.startsAt, mi.date, days, fb);
    add({ kind: "MOCK_INTERVIEW", title: mi.title, detail: mi.kind === "HR" ? "HR and behavioural interview" : `Technical interview for ${i.jobRole}`, refType: "MOCK_INTERVIEW" }, day); reserved.add(day);
  }
  if (!i.mockInterviews.some((m) => m.kind === "TECHNICAL")) { add({ kind: "MOCK_INTERVIEW", title: "Technical mock interview", detail: `Technical interview for ${i.jobRole}`, refType: "MOCK_INTERVIEW" }, techDay); reserved.add(techDay); }
  if (!i.mockInterviews.some((m) => m.kind === "HR")) { add({ kind: "MOCK_INTERVIEW", title: "HR mock interview", detail: "HR and behavioural interview", refType: "MOCK_INTERVIEW" }, hrDay); reserved.add(hrDay); }
  i.mockTests.forEach((t, n) => { const day = dayOf(i.startsAt, t.date, days, Math.max(2, Math.round(days * (0.55 + 0.05 * n)))); add({ kind: "MOCK_TEST", title: t.title, detail: t.date ? undefined : "Take it before the deadline", refType: "ASSESSMENT", refId: t.scheduleId }, day); reserved.add(day); });
  if (!i.mockTests.some((t) => t.kind === "APTITUDE") && i.weak.aptitude) add({ kind: "PRACTICE", title: "Practise aptitude questions", detail: "Your aptitude result is low for this job. Use the practice tests and study material on aptitude." }, Math.max(2, Math.round(days * 0.5)));
  if (i.weak.communication) add({ kind: "PRACTICE", title: "Practise communication", detail: "Write and speak short answers about your projects, and take the communication test." }, Math.max(2, Math.round(days * 0.4)));
  add({ kind: "REVISION", title: "Revision and a fresh check", detail: "Go back over what you studied, then check how you match the job now." }, days);

  // learning, most important first
  const rank = (g: Gap) => (g.mandatory ? 0 : 2) + (g.status === "MISSING" ? 0 : 1);
  const gaps = [...i.gaps].sort((a, b) => rank(a) - rank(b) || b.weight - a.weight || a.skill.localeCompare(b.skill));
  const learnDays = Array.from({ length: Math.max(0, days - 1) }, (_, k) => k + 1).filter((d) => !reserved.has(d) || (load.get(d) ?? 0) < 1);
  const free = (d: number) => (load.get(d) ?? 0) < 2;
  let cursor = 0;
  for (const g of gaps) {
    const ref = i.prep[g.skill] ?? {};
    const item: Omit<PlanDraft, "dueAt" | "day"> = g.status === "MISSING"
      ? ref.course ? { kind: "COURSE", title: `Course: ${ref.course.title}`, detail: `For the required skill ${g.skill}`, skill: g.skill, refType: "COURSE", refId: ref.course.id }
        : ref.resource ? { kind: "RESOURCE", title: `Study: ${ref.resource.title}`, detail: `For the skill ${g.skill}`, skill: g.skill, refType: "RESOURCE", refId: ref.resource.id }
        : { kind: "LEARN", title: `Learn ${g.skill}`, detail: `Learn the basics of ${g.skill} and do a few exercises. Nothing in the college teaches it yet, so use a free tutorial.`, skill: g.skill }
      : { kind: "PRACTICE", title: `Show ${g.skill} in practice`, detail: ref.course ? `Take "${ref.course.title}" or use ${g.skill} in a small project, so it is backed by evidence.` : `Use ${g.skill} in a small project or take a quiz on it, so it is backed by evidence.`, skill: g.skill, ...(ref.course ? { refType: "COURSE" as const, refId: ref.course.id } : ref.resource ? { refType: "RESOURCE" as const, refId: ref.resource.id } : {}) };
    const day = learnDays.slice(cursor).find(free) ?? null;
    if (day === null) { add({ ...item, optional: true, detail: `Optional, if you have time. ${item.detail ?? ""}`.trim() }, Math.max(1, days - 1)); continue; }
    add(item, day);
    cursor = Math.max(cursor, learnDays.indexOf(day) + ((load.get(day) ?? 0) >= 2 ? 1 : 0));
  }
  for (const r of i.resources.slice(0, 6)) { const day = learnDays.find(free) ?? Math.max(1, days - 1); add({ kind: "RESOURCE", title: `Study: ${r.title}`, detail: "Chosen by your placement office for this job", refType: "RESOURCE", refId: r.id }, day); }
  return out.sort((a, b) => a.day - b.day || PLAN_KINDS.indexOf(a.kind) - PLAN_KINDS.indexOf(b.kind) || a.title.localeCompare(b.title));
}

// ---- progress ----
export type Item = { kind: string; status: string; dueAt: Date; optional?: boolean };
export type Progress = { total: number; done: number; percent: number; overdue: number; expectedPercent: number; behind: boolean; ready: boolean; nextDue: Date | null };
/**
 * How far a student has got. Optional items do not count against them. They are "behind" when two or more items are late, or when they have done at least 30 points
 * less than the share of items already due and something is late. "Ready" means they have finished at least 85% with nothing late.
 */
export function memberProgress(items: Item[], now = new Date()): Progress {
  const real = items.filter((x) => !x.optional && x.status !== "SKIPPED");
  const done = real.filter((x) => x.status === "DONE").length;
  const overdue = real.filter((x) => x.status === "PENDING" && x.dueAt < now).length;
  const dueSoFar = real.filter((x) => x.dueAt < now).length;
  const percent = real.length ? Math.round((done / real.length) * 100) : 0, expected = real.length ? Math.round((dueSoFar / real.length) * 100) : 0;
  return { total: real.length, done, percent, overdue, expectedPercent: expected, behind: overdue >= 2 || (expected - percent >= 30 && overdue >= 1), ready: real.length > 0 && percent >= 85 && overdue === 0, nextDue: real.filter((x) => x.status === "PENDING").map((x) => x.dueAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? null };
}

// ---- invitation steps ----
export type MemberStatus = "SELECTED" | "INVITED" | "ACCEPTED" | "DECLINED" | "REMOVED";
export type MemberAction = "INVITE" | "ACCEPT" | "DECLINE" | "REMOVE";
/** Selected students are invited; an invited student accepts or declines (and can change their mind until the deadline); anyone can be removed by staff. */
export function nextMember(current: MemberStatus, action: MemberAction): { status: MemberStatus } | { error: string } {
  switch (action) {
    case "INVITE": return current === "SELECTED" ? { status: "INVITED" } : { error: current === "REMOVED" ? "This student was removed from the campaign" : "Already invited" };
    case "ACCEPT": return current === "INVITED" || current === "DECLINED" ? { status: "ACCEPTED" } : { error: current === "ACCEPTED" ? "Already accepted" : "You have not been invited" };
    case "DECLINE": return current === "INVITED" || current === "ACCEPTED" ? { status: "DECLINED" } : { error: current === "DECLINED" ? "Already declined" : "You have not been invited" };
    case "REMOVE": return current === "REMOVED" ? { error: "Already removed" } : { status: "REMOVED" };
  }
}

// ---- the dashboard ----
export type DashMember = { status: MemberStatus; startedAt: Date | null; helpOpen: boolean; markedReady: boolean; items: (Item & { kind: string })[]; groupId: string | null };
/** The campaign figures. Counts are over students still in the campaign (not removed). A student is "ready" when staff marked them ready or the plan says so. */
export function dashboardOf(members: DashMember[], now = new Date()) {
  const live = members.filter((m) => m.status !== "REMOVED");
  const prog = live.map((m) => ({ m, p: memberProgress(m.items, now) }));
  const doneOf = (kinds: string[]) => live.reduce((a, m) => a + m.items.filter((x) => kinds.includes(x.kind) && x.status === "DONE").length, 0);
  const totalOf = (kinds: string[]) => live.reduce((a, m) => a + m.items.filter((x) => kinds.includes(x.kind) && !x.optional).length, 0);
  const active = prog.filter(({ m }) => m.status === "ACCEPTED");
  return {
    selected: live.length, invited: live.filter((m) => m.status !== "SELECTED").length, accepted: live.filter((m) => m.status === "ACCEPTED").length, declined: live.filter((m) => m.status === "DECLINED").length, awaitingReply: live.filter((m) => m.status === "INVITED").length,
    started: active.filter(({ m, p }) => m.startedAt || p.done > 0).length,
    resourcesCompleted: doneOf(["RESOURCE", "COURSE"]), resourcesTotal: totalOf(["RESOURCE", "COURSE"]),
    mockTestsCompleted: doneOf(["MOCK_TEST"]), mockTestsTotal: totalOf(["MOCK_TEST"]), mockInterviewsCompleted: doneOf(["MOCK_INTERVIEW"]), mockInterviewsTotal: totalOf(["MOCK_INTERVIEW"]),
    needingHelp: live.filter((m) => m.helpOpen).length, behind: active.filter(({ p }) => p.behind).length,
    ready: active.filter(({ m, p }) => m.markedReady || p.ready).length,
    averageProgress: active.length ? Math.round(active.reduce((a, { p }) => a + p.percent, 0) / active.length) : null,
  };
}

/** Whether a finished mock interview counts for a plan item: it must be new enough and be of the same kind (the topic says technical or HR). */
export function interviewCounts(topic: string, createdAt: Date, itemCreatedAt: Date, kind: "TECHNICAL" | "HR"): boolean {
  if (createdAt < itemCreatedAt) return false;
  const t = topic.toLowerCase();
  return kind === "HR" ? /\bhr\b|behaviou?r|human resources/.test(t) : /technical|tech\b|coding|domain/.test(t);
}
export const interviewKindOf = (detail: string | null | undefined): "TECHNICAL" | "HR" => (/hr|behaviou?r/i.test(detail ?? "") ? "HR" : "TECHNICAL");

/** What a campaign needs before it can start. */
export function campaignProblems(c: { name: string; startsAt: Date; deadline: Date; members: number; invited: number }, now = new Date()): string[] {
  const out: string[] = [];
  if (c.name.trim().length < 3) out.push("Give the campaign a name");
  if (c.deadline <= c.startsAt) out.push("The deadline must be after the start date");
  if (c.deadline.getTime() < now.getTime() - DAY) out.push("The deadline has already passed");
  if (c.members === 0) out.push("Add at least one candidate");
  return out;
}

/** Pure internship rules: who may apply, the approval steps, attendance, tasks, completion and PPO. No database here. */

// ---- eligibility ----
export type Rules = { minCgpa: number | null; minTenthPct: number | null; minTwelfthPct: number | null; maxActiveBacklogs: number | null; departmentIds: string[]; batchIds: string[]; programIds: string[]; allowPlaced: boolean };
export type Facts = {
  departmentId: string; batchId: string; programId: string | null; isPlaced: boolean; hasRunningInternship: boolean; onboarded: boolean
  /** Staff-verified academics only; null when none are verified. */
  academics: { cgpa?: number; tenthPercentage?: number; twelfthPercentage?: number; activeBacklogs?: number } | null
}

/** Why a student cannot apply. An empty list means they can. Unverified academics never count as meeting a threshold. */
export function checkEligibility(r: Rules, s: Facts): string[] {
  const out: string[] = [];
  if (!s.onboarded) out.push("Your profile has not been verified yet");
  if (r.departmentIds.length && !r.departmentIds.includes(s.departmentId)) out.push("Your department is not eligible for this internship");
  if (r.batchIds.length && !r.batchIds.includes(s.batchId)) out.push("Your batch is not eligible for this internship");
  if (r.programIds.length && (!s.programId || !r.programIds.includes(s.programId))) out.push("Your programme is not eligible for this internship");
  if (s.isPlaced && !r.allowPlaced) out.push("Placed students cannot apply to this internship");
  if (s.hasRunningInternship) out.push("You already have an internship in progress");
  const needs = r.minCgpa !== null || r.minTenthPct !== null || r.minTwelfthPct !== null || r.maxActiveBacklogs !== null;
  if (needs) {
    const a = s.academics;
    if (!a) out.push("Your academic details are not verified yet, so the marks rules cannot be checked");
    else {
      if (r.minCgpa !== null && !(typeof a.cgpa === "number" && a.cgpa >= r.minCgpa)) out.push(`CGPA must be at least ${r.minCgpa}`);
      if (r.minTenthPct !== null && !(typeof a.tenthPercentage === "number" && a.tenthPercentage >= r.minTenthPct)) out.push(`10th marks must be at least ${r.minTenthPct}%`);
      if (r.minTwelfthPct !== null && !(typeof a.twelfthPercentage === "number" && a.twelfthPercentage >= r.minTwelfthPct)) out.push(`12th marks must be at least ${r.minTwelfthPct}%`);
      if (r.maxActiveBacklogs !== null && !(typeof a.activeBacklogs === "number" && a.activeBacklogs <= r.maxActiveBacklogs)) out.push(`No more than ${r.maxActiveBacklogs} active backlog${r.maxActiveBacklogs === 1 ? "" : "s"} allowed`);
    }
  }
  return out;
}

/** What stops a posting from opening to students. */
export function postingProblems(p: { companyConfirmed: boolean; applicationDeadline: Date; startDate: Date; endDate: Date; openings: number | null }, now = new Date()): string[] {
  const out: string[] = [];
  if (!p.companyConfirmed) out.push("The company has not confirmed this internship");
  if (p.applicationDeadline <= now) out.push("The application deadline has passed");
  if (p.startDate <= p.applicationDeadline) out.push("The internship should start after the application deadline");
  if (p.endDate <= p.startDate) out.push("The end date must be after the start date");
  if (p.openings !== null && p.openings < 1) out.push("There must be at least one opening");
  return out;
}

// ---- applications ----
export type AppStatus = "APPLIED" | "COLLEGE_APPROVED" | "COLLEGE_REJECTED" | "COMPANY_SELECTED" | "COMPANY_REJECTED" | "WITHDRAWN" | "ALLOTTED";
export type AppAction = "COLLEGE_APPROVE" | "COLLEGE_REJECT" | "COMPANY_SELECT" | "COMPANY_REJECT" | "WITHDRAW";

/**
 * The two approvals: the college first, then the company. An internship the student found themselves (`selfSourced`) skips the company step because the
 * company has already offered it, but needs the college's approval. Returns the new status or a message.
 */
export function nextApplication(current: AppStatus, action: AppAction, selfSourced: boolean): { status: AppStatus } | { error: string } {
  switch (action) {
    case "COLLEGE_APPROVE": return current === "APPLIED" ? { status: selfSourced ? "ALLOTTED" : "COLLEGE_APPROVED" } : { error: "Only a new application can be approved by the college" };
    case "COLLEGE_REJECT": return current === "APPLIED" ? { status: "COLLEGE_REJECTED" } : { error: "Only a new application can be rejected by the college" };
    case "COMPANY_SELECT": return selfSourced ? { error: "A self-found internship does not need the company's selection" } : current === "COLLEGE_APPROVED" ? { status: "ALLOTTED" } : { error: "The college must approve the application first" };
    case "COMPANY_REJECT": return selfSourced ? { error: "A self-found internship does not need the company's selection" } : current === "COLLEGE_APPROVED" ? { status: "COMPANY_REJECTED" } : { error: "The college must approve the application first" };
    case "WITHDRAW": return current === "APPLIED" || current === "COLLEGE_APPROVED" ? { status: "WITHDRAWN" } : { error: "This application can no longer be withdrawn" };
  }
}

// ---- attendance ----
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T00:00:00Z`);

/** Every working day (as YYYY-MM-DD) from start to end inclusive. `workDays` uses 0 = Sunday to 6 = Saturday. */
export function workingDays(start: Date, end: Date, workDays: number[]): string[] {
  const out: string[] = [];
  const set = new Set(workDays);
  for (let t = day(iso(start)).getTime(); t <= day(iso(end)).getTime() && out.length < 800; t += 86_400_000) if (set.has(new Date(t).getUTCDay())) out.push(iso(new Date(t)));
  return out;
}

/** Whether a student may mark attendance for a date: a working day in the internship, not in the future, and not older than `windowDays`. Returns a message or null. */
export function markProblem(date: string, o: { start: Date; end: Date; workDays: number[]; today: Date; windowDays?: number }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Choose a date";
  const t = day(date), today = day(iso(o.today));
  if (t > today) return "You cannot mark a day that has not happened yet";
  if ((today.getTime() - t.getTime()) / 86_400_000 > (o.windowDays ?? 7)) return `You can only mark the last ${o.windowDays ?? 7} days. Ask your mentor to correct older days`;
  if (t < day(iso(o.start)) || t > day(iso(o.end))) return "That day is outside your internship";
  if (!o.workDays.includes(t.getUTCDay())) return "That is not one of your working days";
  return null;
}

export type Mark = { date: string; status: "PRESENT" | "ABSENT" | "LEAVE"; verified: boolean };
/** Attendance so far. Approved leave days are not counted against the student. Days nobody marked count as unmarked, not as absent. */
export function attendanceSummary(o: { start: Date; end: Date; workDays: number[]; marks: Mark[]; today: Date }) {
  const upTo = day(iso(o.today)) < day(iso(o.end)) ? o.today : o.end;
  const days = o.today < o.start ? [] : workingDays(o.start, upTo, o.workDays);
  const by = new Map(o.marks.map((m) => [m.date, m]));
  const count = (s: string) => days.filter((d) => by.get(d)?.status === s).length;
  const present = count("PRESENT"), absent = count("ABSENT"), leave = count("LEAVE");
  const counted = days.length - leave;
  return {
    workingDays: days.length, present, absent, leave, unmarked: days.filter((d) => !by.has(d)).length,
    unverified: o.marks.filter((m) => !m.verified && days.includes(m.date)).length, verifiedPresent: days.filter((d) => by.get(d)?.status === "PRESENT" && by.get(d)?.verified).length,
    percent: counted > 0 ? Math.round((present / counted) * 100) : null,
  };
}

// ---- tasks and deliverables ----
export type TaskStatus = "ASSIGNED" | "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED";
export function nextTask(current: TaskStatus, action: "SUBMIT" | "APPROVE" | "REQUEST_CHANGES"): { status: TaskStatus } | { error: string } {
  if (action === "SUBMIT") return current === "ASSIGNED" || current === "CHANGES_REQUESTED" ? { status: "SUBMITTED" } : { error: current === "APPROVED" ? "This task is already approved" : "Already handed in; wait for the review" };
  return current === "SUBMITTED" ? { status: action === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED" } : { error: "Nothing has been handed in to review" };
}

// ---- completion ----
export const MIN_ATTENDANCE = 75;
export type Check = { key: string; label: string; ok: boolean; blocking: boolean };

/** What must be true before an internship is marked complete. Blocking checks can be overridden by an admin with a written reason. */
export function completionChecks(o: { status: string; endDate: Date; today: Date; evaluations: number; logsPending: number; tasksOpen: number; attendancePercent: number | null; certificate: string }): Check[] {
  return [
    { key: "running", label: "The internship is in progress", ok: o.status === "ONGOING", blocking: true },
    { key: "ended", label: "The end date has been reached", ok: day(iso(o.today)) >= day(iso(o.endDate)), blocking: true },
    { key: "evaluation", label: "At least one evaluation has been recorded", ok: o.evaluations > 0, blocking: true },
    { key: "logs", label: "No weekly log is waiting for review", ok: o.logsPending === 0, blocking: true },
    { key: "tasks", label: "Every task and the final report is approved", ok: o.tasksOpen === 0, blocking: true },
    { key: "attendance", label: `Attendance is at least ${MIN_ATTENDANCE}%`, ok: o.attendancePercent === null || o.attendancePercent >= MIN_ATTENDANCE, blocking: false },
    { key: "certificate", label: "The completion certificate is verified", ok: o.certificate === "VERIFIED", blocking: false },
  ];
}
export const completionBlocked = (checks: Check[]) => checks.filter((c) => c.blocking && !c.ok);

/** Allowed moves of the internship status. */
export const STATUS_FROM: Record<string, string[]> = { ONGOING: ["ALLOTTED"], COMPLETED: ["ONGOING"], TERMINATED: ["ALLOTTED", "ONGOING"] };

// ---- PPO ----
export type Ppo = "NONE" | "EXPECTED" | "OFFERED" | "ACCEPTED" | "DECLINED";
const PPO_NEXT: Record<Ppo, Ppo[]> = { NONE: ["EXPECTED", "OFFERED"], EXPECTED: ["OFFERED", "NONE"], OFFERED: ["ACCEPTED", "DECLINED", "NONE"], ACCEPTED: [], DECLINED: [] };
export const ppoMove = (from: Ppo, to: Ppo): { ok: true } | { error: string } => (from === to ? { error: "Already in that state" } : PPO_NEXT[from].includes(to) ? { ok: true } : { error: `A pre-placement offer cannot go from ${from.toLowerCase()} to ${to.toLowerCase()}` });

/** Share of finished internships that led to an accepted pre-placement offer, and how many were offered one. */
export function ppoStats(done: { ppo: Ppo }[]) {
  const n = done.length, accepted = done.filter((d) => d.ppo === "ACCEPTED").length, offered = done.filter((d) => ["OFFERED", "ACCEPTED", "DECLINED"].includes(d.ppo)).length;
  return { completed: n, offered, accepted, offeredPercent: n ? Math.round((offered / n) * 100) : null, conversionPercent: n ? Math.round((accepted / n) * 100) : null };
}

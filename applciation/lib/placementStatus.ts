/**
 * The placement status of one student for one job, as the 14 steps in the requirements, worked out from records the platform already keeps (applications, round results,
 * interview slots, offers, preparation campaigns, tests and interviews). Pure: no database. Each step says when it was reached and by whom, so the status history carries
 * timestamps and the person responsible. Nothing here changes a record; it reads them.
 */
export const STEPS = [
  ["JOB_PUBLISHED", "Job published"], ["APPLICATION_RECEIVED", "Application received"], ["ELIGIBILITY_CHECKED", "Eligibility checked"], ["SHORTLISTED", "Shortlisted"],
  ["PREPARATION_ASSIGNED", "Preparation assigned"], ["MOCK_TEST_COMPLETED", "Mock test completed"], ["MOCK_INTERVIEW_COMPLETED", "Mock interview completed"],
  ["INVITED_TO_INTERVIEW", "Invited to actual interview"], ["INTERVIEW_ATTENDED", "Interview attended"], ["SELECTED", "Selected"], ["REJECTED", "Rejected"],
  ["OFFER_RELEASED", "Offer released"], ["OFFER_ACCEPTED", "Offer accepted"], ["JOINED", "Joined"],
] as const;
export type StepKey = (typeof STEPS)[number][0];
export const STEP_LABEL = Object.fromEntries(STEPS) as Record<StepKey, string>;
/** Rounds that are interviews (the others are tests). */
export const INTERVIEW_ROUNDS = ["TECHNICAL", "HR", "GROUP_DISCUSSION"] as const;

type At = Date | string;
export type Who = string | null;
export type Facts = {
  drive: { publishedAt: At | null; status: string }
  application: { appliedAt: At; status: string; clearedAllRounds: boolean; appliedBy: Who } | null
  /** Application events: a status change or a round result, with the person who made it. */
  events: { at: At; status: string | null; roundResult: string | null; roundName: string | null; by: Who; note: string | null }[]
  prep: { at: At; by: Who } | null
  tests: { at: At; title: string }[]
  interviews: { at: At; title: string }[]
  slots: { createdAt: At; startsAt: At; status: string; roundName: string | null; by: Who }[]
  results: { at: At; status: string; roundType: string; roundName: string | null; by: Who }[]
  offer: { offeredAt: At; offeredBy: Who; status: string; respondedAt: At | null; joiningStatus: string; joinedAt: At | null } | null
};
export type Milestone = { key: StepKey; label: string; reached: boolean; at: string | null; by: Who; detail: string | null };
export type Status = { current: StepKey | "WITHDRAWN" | "NOT_STARTED"; label: string; next: string | null; milestones: Milestone[]; history: { at: string; label: string; by: Who; note: string | null }[] };

const iso = (d: At | null | undefined) => (d ? new Date(d).toISOString() : null);
const earliest = <T extends { at: At }>(xs: T[]) => [...xs].sort((a, b) => +new Date(a.at) - +new Date(b.at))[0] ?? null;

export function placementStatus(f: Facts): Status {
  const app = f.application;
  const rejected = !!app && (app.status === "REJECTED" || f.results.some((r) => r.status === "REJECTED"));
  const withdrawn = app?.status === "WITHDRAWN";
  const rejectedAt = app?.status === "REJECTED" ? earliest(f.events.filter((e) => e.status === "REJECTED")) : null;
  const rejectedResult = earliest(f.results.filter((r) => r.status === "REJECTED"));
  const shortlisted = earliest(f.events.filter((e) => e.status === "SHORTLISTED"));
  const attended = earliest(f.results.filter((r) => (INTERVIEW_ROUNDS as readonly string[]).includes(r.roundType) && ["ATTENDED", "CLEARED", "REJECTED"].includes(r.status)));
  const slot = earliest(f.slots.filter((s) => s.status !== "CANCELLED").map((s) => ({ ...s, at: s.createdAt })));
  const invited = slot ? { at: slot.at, by: slot.by, detail: slot.roundName ? `${slot.roundName}, ${new Date(slot.startsAt).toISOString().slice(0, 10)}` : null } : attended ? { at: attended.at, by: attended.by, detail: attended.roundName } : null;
  const test = earliest(f.tests), iv = earliest(f.interviews);
  const offer = f.offer && f.offer.status !== "REVOKED" ? f.offer : null;
  // Selected once every round is cleared, or an offer was made. Its time is the last round cleared, else the offer, else the application.
  const lastCleared = [...f.events.filter((e) => e.roundResult === "CLEARED"), ...f.results.filter((r) => r.status === "CLEARED")].sort((a, b) => +new Date(b.at) - +new Date(a.at))[0];
  const selected = app && (app.clearedAllRounds || offer) ? { at: lastCleared?.at ?? offer?.offeredAt ?? app.appliedAt, by: lastCleared?.by ?? offer?.offeredBy ?? null } : null;

  const reached: Record<StepKey, { at: At; by: Who; detail?: string | null } | null> = {
    JOB_PUBLISHED: f.drive.publishedAt ? { at: f.drive.publishedAt, by: null } : null,
    APPLICATION_RECEIVED: app ? { at: app.appliedAt, by: app.appliedBy } : null,
    // Eligibility is checked automatically when the application is made, so the two share a time.
    ELIGIBILITY_CHECKED: app ? { at: app.appliedAt, by: null, detail: "Checked by the system when the application was made" } : null,
    SHORTLISTED: shortlisted ? { at: shortlisted.at, by: shortlisted.by } : null,
    PREPARATION_ASSIGNED: f.prep,
    MOCK_TEST_COMPLETED: test ? { at: test.at, by: null, detail: test.title } : null,
    MOCK_INTERVIEW_COMPLETED: iv ? { at: iv.at, by: null, detail: iv.title } : null,
    INVITED_TO_INTERVIEW: invited,
    INTERVIEW_ATTENDED: attended ? { at: attended.at, by: attended.by, detail: attended.roundName } : null,
    SELECTED: selected,
    REJECTED: rejected ? (rejectedResult ?? rejectedAt) ? { at: (rejectedResult ?? rejectedAt)!.at, by: (rejectedResult ?? rejectedAt)!.by } : { at: app!.appliedAt, by: null } : null,
    OFFER_RELEASED: offer ? { at: offer.offeredAt, by: offer.offeredBy } : null,
    OFFER_ACCEPTED: offer && offer.status === "ACCEPTED" ? { at: offer.respondedAt ?? offer.offeredAt, by: null } : null,
    JOINED: offer && offer.joiningStatus === "JOINED" ? { at: offer.joinedAt ?? offer.respondedAt ?? offer.offeredAt, by: null } : null,
  };
  const milestones: Milestone[] = STEPS.map(([key, label]) => { const r = reached[key]; return { key, label, reached: !!r, at: iso(r?.at), by: r?.by ?? null, detail: r?.detail ?? null }; });

  // Where the student is: the furthest step reached on the way to a placement; a rejection or withdrawal ends the road.
  const order = STEPS.map(([k]) => k).filter((k) => k !== "REJECTED");
  const furthest = [...order].reverse().find((k) => reached[k]) ?? null;
  const current: Status["current"] = withdrawn ? "WITHDRAWN" : rejected && !offer ? "REJECTED" : furthest ?? "NOT_STARTED";
  const label = current === "WITHDRAWN" ? "Withdrawn" : current === "NOT_STARTED" ? "Not started" : STEP_LABEL[current];
  // The next step on the main road after the furthest one reached; none once the road has ended. Preparation steps sit beside the road, not on it.
  const main: StepKey[] = ["APPLICATION_RECEIVED", "SHORTLISTED", "INVITED_TO_INTERVIEW", "INTERVIEW_ATTENDED", "SELECTED", "OFFER_RELEASED", "OFFER_ACCEPTED", "JOINED"];
  const last = main.reduce((acc, k, i) => (reached[k] ? i : acc), -1);
  const next = withdrawn || (rejected && !offer) || last === main.length - 1 ? null : STEP_LABEL[main[last + 1]];

  const hist: Status["history"] = [];
  const add = (at: At | null | undefined, text: string, by: Who, note: string | null = null) => { if (at) hist.push({ at: iso(at)!, label: text, by, note }); };
  if (f.drive.publishedAt) add(f.drive.publishedAt, "Job published", null);
  if (app) add(app.appliedAt, app.appliedBy ? "Application made on the student's behalf" : "Application received", app.appliedBy);
  for (const e of f.events) {
    if (e.status && e.status !== "APPLIED") add(e.at, e.status === "SHORTLISTED" ? "Shortlisted" : e.status === "REJECTED" ? "Rejected" : e.status === "WITHDRAWN" ? "Withdrawn by the student" : e.status === "ON_HOLD" ? "Put on hold" : e.status, e.by, e.note);
    if (e.roundResult) add(e.at, `${e.roundName ?? "Round"}: ${e.roundResult.toLowerCase()}`, e.by, e.note);
  }
  if (f.prep) add(f.prep.at, "Preparation assigned", f.prep.by);
  for (const t of f.tests) add(t.at, `Mock test completed: ${t.title}`, null);
  for (const i of f.interviews) add(i.at, `Mock interview completed: ${i.title}`, null);
  for (const s of f.slots) add(s.createdAt, `Interview slot ${s.status === "CANCELLED" ? "cancelled" : "booked"}${s.roundName ? `: ${s.roundName}` : ""}`, s.by);
  if (f.offer) { add(f.offer.offeredAt, "Offer released", f.offer.offeredBy); if (f.offer.status === "ACCEPTED") add(f.offer.respondedAt, "Offer accepted", null); if (f.offer.status === "DECLINED") add(f.offer.respondedAt, "Offer declined", null); if (f.offer.status === "REVOKED") add(f.offer.respondedAt, "Offer revoked", null); if (f.offer.joiningStatus === "JOINED") add(f.offer.joinedAt ?? f.offer.respondedAt, "Joined", null); }
  hist.sort((a, b) => +new Date(a.at) - +new Date(b.at));
  return { current, label, next, milestones, history: hist };
}

/** How many students are at each step, for a drive's pipeline summary. `reachedCount` counts every student who has passed a step, not only those currently on it. */
export function pipelineCounts(statuses: Pick<Status, "current" | "milestones">[]) {
  const reachedCount = Object.fromEntries(STEPS.map(([k]) => [k, 0])) as Record<StepKey, number>;
  const at = new Map<string, number>();
  for (const s of statuses) { for (const m of s.milestones) if (m.reached) reachedCount[m.key]++; at.set(s.current, (at.get(s.current) ?? 0) + 1); }
  return { total: statuses.length, reachedCount, currentCount: Object.fromEntries(at) as Record<string, number> };
}

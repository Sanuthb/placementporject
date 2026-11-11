import vercel from "@/vercel.json";

/** The scheduled jobs the deployment registers (vercel.json), with a plain description and the next time each is due. This is the registry only: no execution history exists to show. */
const DESCRIPTION: Record<string, string> = {
  "/api/blocking/evaluate": "Applies attendance blocking policies (nightly)",
  "/api/reports/schedules/run": "Sends scheduled reports that are due (daily)",
  "/api/crm/follow-ups/run": "Creates employer follow-up reminders (daily)",
  "/api/notifications/round-reminders/run": "Reminds students of rounds and interviews in the next 24 hours (hourly)",
  "/api/notifications/reminders/run": "Reminds students of tests, courses and tasks, and sends opted-in channel messages (hourly)",
};
const parseField = (f: string, min: number, max: number): Set<number> | null => {
  const out = new Set<number>();
  for (const part of f.split(",")) {
    const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part); if (!m) return null;
    const step = m[3] ? Number(m[3]) : 1; if (!step) return null;
    const lo = m[1] === "*" ? min : Number(m[1]); const hi = m[1] === "*" ? max : m[2] ? Number(m[2]) : m[3] ? max : lo;
    if (lo < min || hi > max || lo > hi) return null; for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
};
type Cron = { mi: Set<number>; ho: Set<number>; dom: Set<number>; mo: Set<number>; dow: Set<number>; either: boolean };
const parseCron = (expr: string): Cron | null => {
  const p = expr.trim().split(/\s+/); if (p.length !== 5) return null;
  const [mi, ho, dom, mo, dow] = [parseField(p[0], 0, 59), parseField(p[1], 0, 23), parseField(p[2], 1, 31), parseField(p[3], 1, 12), parseField(p[4], 0, 6)];
  if (!mi || !ho || !dom || !mo || !dow) return null;
  return { mi, ho, dom, mo, dow, either: !(p[2] === "*" || p[4] === "*") };
};
const matches = (c: Cron, d: Date) => c.mi.has(d.getUTCMinutes()) && c.ho.has(d.getUTCHours()) && c.mo.has(d.getUTCMonth() + 1) && (c.either ? c.dom.has(d.getUTCDate()) || c.dow.has(d.getUTCDay()) : c.dom.has(d.getUTCDate()) && c.dow.has(d.getUTCDay()));
const minute = (d: Date, plus = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes() + plus));
/** Next UTC time after `from` matching a 5-field cron expression (minute hour day-of-month month day-of-week). null when the expression is not understood. */
export function nextRun(expr: string, from = new Date()): Date | null {
  const c = parseCron(expr); if (!c) return null;
  const d = minute(from, 1);
  for (let i = 0; i < 366 * 24 * 60; i++, d.setUTCMinutes(d.getUTCMinutes() + 1)) if (matches(c, d)) return new Date(d);
  return null;
}
/** The latest UTC time at or before `from` matching the expression: the schedule slot a run at `from` belongs to. Looks back at most 35 days; null when the expression is not understood or never matched. */
export function previousRun(expr: string, from = new Date()): Date | null {
  const c = parseCron(expr); if (!c) return null;
  const d = minute(from);
  for (let i = 0; i < 35 * 24 * 60; i++, d.setUTCMinutes(d.getUTCMinutes() - 1)) if (matches(c, d)) return new Date(d);
  return null;
}
export function scheduledJobs(now = new Date()) {
  return (vercel.crons ?? []).map((c) => ({ path: c.path, schedule: c.schedule, description: DESCRIPTION[c.path] ?? "Scheduled job", nextDueAt: nextRun(c.schedule, now)?.toISOString() ?? null }));
}

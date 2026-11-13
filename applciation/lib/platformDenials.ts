import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Refused requests (Control Centre, 4.12). When a signed-in person asks for something their ROLE or their institution's MODULES do not allow, the request wrapper
 * refuses it and one line is kept here: which institution, which role, which kind of refusal, and the route PATTERN (ids replaced). No person, no request content.
 *
 * What this is NOT: it is not a record of sign-in failures (those happen inside the Auth service and never reach this application), and it does not see attempts to open
 * another institution's record, which end as "not found". Nothing here proves an attack; one person following an old link produces one line.
 *
 * Recording never changes the outcome of a request, never waits for the database, and is throttled so a flood of identical refusals writes at most one line a minute.
 */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export const routePattern = (method: string, pathname: string) => `${method.toUpperCase()} ${pathname.replace(UUID, ":id").replace(/\/\d+(?=\/|$)/g, "/:n")}`.slice(0, 160);
export const denialKind = (message: string): "MODULE" | "ROLE" => (/\bmodule\b/i.test(message) ? "MODULE" : "ROLE");

const seen = new Map<string, number>();
const WINDOW_MS = 60_000;
const MAX_KEYS = 2000;
/** True at most once per key per window. The map is bounded, so a flood of different keys cannot grow it without limit. */
export function shouldRecord(key: string, now: number) {
  if (seen.size >= MAX_KEYS) for (const [k, t] of seen) if (t < now - WINDOW_MS) seen.delete(k);
  if (seen.size >= MAX_KEYS) return false;
  const last = seen.get(key);
  if (last !== undefined && last > now - WINDOW_MS) return false;
  seen.set(key, now);
  return true;
}
export const resetThrottle = () => seen.clear();

export function recordDenial(e: { collegeId: string | null; role: string | null; method: string; pathname: string; message: string }) {
  try {
    const route = routePattern(e.method, e.pathname);
    const kind = denialKind(e.message);
    if (!shouldRecord(`${e.collegeId ?? "-"}|${e.role ?? "-"}|${kind}|${route}`, Date.now())) return;
    void db.platformAccessDenial.create({ data: { collegeId: e.collegeId, role: e.role, kind, route } }).catch(() => undefined); // a missing table or a database error must never matter here
  } catch { /* recording must never change the outcome of a request */ }
}

// ---------------- platform side ----------------
const DAY = 86_400_000;
export const summaryQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).strict();

/** Counts by day, by route and by institution for the last N days. Institution names are looked up; nothing about a person exists to show. */
export async function denialSummary(q: z.infer<typeof summaryQuery>, now = new Date()) {
  const since = new Date(now.getTime() - q.days * DAY);
  const [total, byRoute, byCollege, recent] = await Promise.all([
    db.platformAccessDenial.count({ where: { createdAt: { gte: since } } }),
    db.platformAccessDenial.groupBy({ by: ["route", "kind"], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { route: "desc" } }, take: 10 }),
    db.platformAccessDenial.groupBy({ by: ["collegeId"], where: { createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { collegeId: "desc" } }, take: 10 }),
    db.platformAccessDenial.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, collegeId: true, role: true, kind: true, route: true, createdAt: true } }),
  ]);
  const ids = [...new Set([...byCollege.map((c) => c.collegeId), ...recent.map((r) => r.collegeId)].filter((x): x is string => !!x))];
  const names = ids.length ? new Map((await db.college.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((c) => [c.id, c.name])) : new Map<string, string>();
  const nameOf = (id: string | null) => (id ? names.get(id) ?? "An institution" : null);
  return {
    days: q.days, total,
    routes: byRoute.map((r) => ({ route: r.route, kind: r.kind, count: r._count._all })),
    institutions: byCollege.map((c) => ({ institution: nameOf(c.collegeId), count: c._count._all })),
    recent: recent.map((r) => ({ id: r.id, at: r.createdAt, institution: nameOf(r.collegeId), role: r.role, kind: r.kind, route: r.route })),
    note: "Refusals of signed-in requests because of a role or a module. Not sign-in failures, and not attempts that end as 'not found'. One line a minute at most for the same refusal.",
  };
}

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { dayOf } from "@/lib/ai/limits";
import type { Provider, Purpose } from "@/lib/ai/config";

/**
 * AI usage statistics (Phase 4.4.5): one row per day, institution, purpose, provider, model and feature, holding counts and total time. NOTHING identifying a person and NOTHING of the
 * request: no prompt, answer, student, user, document or key is ever stored here, only an institution id, the names the platform itself defines, and numbers. Recording is best-effort:
 * it is bounded to one second and never throws, so a statistics problem can never fail an AI call.
 */
export type Outcome = "success" | "failure" | "timeout" | "rate_limited" | "blocked";
export type UsageKey = { collegeKey: string; purpose: Purpose; provider: Provider; model: string; feature: string };
const SAFE = /^[A-Za-z0-9._:\- ]{1,80}$/;
/** Feature and model names are constants from our code or an administrator's saved model name; anything else is replaced so nothing odd is stored. */
const clean = (s: string, fallback: string) => (SAFE.test(s) ? s : fallback);

export async function recordUsage(k: UsageKey, outcome: Outcome, ms: number, now = new Date()): Promise<void> {
  const calls = outcome === "blocked" ? 0 : 1, failures = outcome === "failure" ? 1 : 0, timeouts = outcome === "timeout" ? 1 : 0, rl = outcome === "rate_limited" ? 1 : 0, blocked = outcome === "blocked" ? 1 : 0;
  const total = outcome === "blocked" ? 0 : Math.max(0, Math.round(ms));
  const write = db.$executeRaw`INSERT INTO "AiUsageDaily" (id, day, "collegeKey", purpose, provider, model, feature, calls, failures, timeouts, "rateLimited", blocked, "totalMs", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${dayOf(now)}::date, ${k.collegeKey}, ${k.purpose}::"AiPurpose", ${k.provider}::"AiProvider", ${clean(k.model, "unknown")}, ${clean(k.feature, "other")}, ${calls}, ${failures}, ${timeouts}, ${rl}, ${blocked}, ${total}, now())
      ON CONFLICT (day, "collegeKey", purpose, provider, model, feature) DO UPDATE SET calls = "AiUsageDaily".calls + ${calls}, failures = "AiUsageDaily".failures + ${failures},
        timeouts = "AiUsageDaily".timeouts + ${timeouts}, "rateLimited" = "AiUsageDaily"."rateLimited" + ${rl}, blocked = "AiUsageDaily".blocked + ${blocked}, "totalMs" = "AiUsageDaily"."totalMs" + ${total}, "updatedAt" = now()`;
  try {
    await Promise.race([write, new Promise((_, rej) => setTimeout(() => rej(new Error("usage write timed out")), 1000).unref?.())]);
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", msg: "AI usage was not recorded", errorName: (e as Error)?.name })); // never the values
  }
}

// ---- reading, always bounded
export const MAX_DAYS = 90;
export const clampDays = (n: number) => Math.min(MAX_DAYS, Math.max(1, Math.trunc(Number.isFinite(n) ? n : 7)));
const since = (days: number) => new Date(`${dayOf(new Date(Date.now() - (clampDays(days) - 1) * 86_400_000))}T00:00:00Z`);
const n = (v: unknown) => Number(v ?? 0);

export type Breakdown = { key: string; calls: number; failures: number; timeouts: number; rateLimited: number; blocked: number; avgMs: number | null };
type Dim = "purpose" | "provider" | "model" | "feature";
const DIMS: Dim[] = ["purpose", "provider", "model", "feature"];

/** Usage over the last `days` days (1 to 90): totals, a breakdown per purpose, provider, model and feature, and a daily trend. */
export async function usageSummary(days: number) {
  const from = since(days);
  const [tot, trend, ...dims] = await Promise.all([
    db.aiUsageDaily.aggregate({ where: { day: { gte: from } }, _sum: { calls: true, failures: true, timeouts: true, rateLimited: true, blocked: true, totalMs: true } }),
    db.aiUsageDaily.groupBy({ by: ["day"], where: { day: { gte: from } }, _sum: { calls: true, failures: true, blocked: true }, orderBy: { day: "asc" }, take: MAX_DAYS }),
    ...DIMS.map((d) => db.aiUsageDaily.groupBy({ by: [d], where: { day: { gte: from } }, _sum: { calls: true, failures: true, timeouts: true, rateLimited: true, blocked: true, totalMs: true }, orderBy: { _sum: { calls: "desc" } }, take: 50 })),
  ]);
  const s = tot._sum;
  const mk = (rows: { [k: string]: unknown; _sum: Record<string, unknown> }[], d: Dim): Breakdown[] => rows.map((r) => ({ key: String(r[d]), calls: n(r._sum.calls), failures: n(r._sum.failures), timeouts: n(r._sum.timeouts), rateLimited: n(r._sum.rateLimited), blocked: n(r._sum.blocked), avgMs: n(r._sum.calls) ? Math.round(n(r._sum.totalMs) / n(r._sum.calls)) : null }));
  return {
    days: clampDays(days),
    totals: { calls: n(s.calls), failures: n(s.failures), timeouts: n(s.timeouts), rateLimited: n(s.rateLimited), blocked: n(s.blocked), avgMs: n(s.calls) ? Math.round(n(s.totalMs) / n(s.calls)) : null },
    byPurpose: mk(dims[0] as never, "purpose"), byProvider: mk(dims[1] as never, "provider"), byModel: mk(dims[2] as never, "model"), byFeature: mk(dims[3] as never, "feature"),
    trend: trend.map((t) => ({ day: dayOf(t.day), calls: n(t._sum.calls), failures: n(t._sum.failures), blocked: n(t._sum.blocked) })),
  };
}

/** Usage per institution for the window, paginated (page size at most 50). Institution ids are resolved to names; the platform's own calls show as "Platform". */
export async function usageByCollege(days: number, page: number, pageSize = 20) {
  const take = Math.min(50, Math.max(1, Math.trunc(pageSize))), skip = Math.max(0, Math.trunc(page) - 1) * take;
  const from = since(days);
  const where = { day: { gte: from } };
  const [rows, all] = await Promise.all([
    db.aiUsageDaily.groupBy({ by: ["collegeKey"], where, _sum: { calls: true, failures: true, blocked: true, totalMs: true }, orderBy: [{ _sum: { calls: "desc" } }, { collegeKey: "asc" }], take, skip }),
    db.aiUsageDaily.groupBy({ by: ["collegeKey"], where, _count: { _all: true } }),
  ]);
  const ids = rows.map((r) => r.collegeKey).filter((k) => k !== "platform");
  const names = ids.length ? await db.college.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, take: 50 }) : [];
  const nm = new Map(names.map((c) => [c.id, c.name]));
  return {
    page: Math.max(1, Math.trunc(page)), pageSize: take, total: all.length,
    rows: rows.map((r) => ({ collegeKey: r.collegeKey, name: r.collegeKey === "platform" ? "Platform" : (nm.get(r.collegeKey) ?? "Unknown institution"), calls: n(r._sum.calls), failures: n(r._sum.failures), blocked: n(r._sum.blocked), avgMs: n(r._sum.calls) ? Math.round(n(r._sum.totalMs) / n(r._sum.calls)) : null })),
  };
}

/** Keeps 90 days of usage and 3 days of counters, in small batches so a large backlog never locks the table. Returns rows removed. */
export async function pruneAiUsage(now = new Date()): Promise<{ usage: number; counters: number }> {
  const cut = (d: number) => dayOf(new Date(now.getTime() - d * 86_400_000));
  let usage = 0, counters = 0;
  for (let i = 0; i < 50; i++) { const c = await db.$executeRaw`DELETE FROM "AiUsageDaily" WHERE ctid IN (SELECT ctid FROM "AiUsageDaily" WHERE day < ${cut(MAX_DAYS)}::date LIMIT 1000)`; usage += c; if (c < 1000) break; }
  for (let i = 0; i < 50; i++) { const c = await db.$executeRaw`DELETE FROM "AiQuotaCounter" WHERE ctid IN (SELECT ctid FROM "AiQuotaCounter" WHERE day < ${cut(3)}::date LIMIT 1000)`; counters += c; if (c < 1000) break; }
  return { usage, counters };
}

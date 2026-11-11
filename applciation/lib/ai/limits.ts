import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { PROVIDERS, PURPOSES } from "@/lib/ai/config";
import type { AuditData } from "@/lib/ai/store";

/**
 * Daily AI call limits (Phase 4.4.5). There are NO built-in limits: the platform ships with none and invents none; an administrator sets them (docs/AI_CONFIG.md lists the kinds and suggested
 * starting points). Scopes a call counts against: its institution ("college:<id>": that institution's own limit, else the default for every institution), its provider
 * ("provider:GROQ"), and its purpose ("purpose:TEXT"), all platform-wide, per UTC day. The existing per-user rate limits on the routes are separate and stay active.
 *
 * Concurrency: a call reserves its place with ONE conditional upsert per scope inside one transaction
 *   INSERT ... ON CONFLICT (day, scope) DO UPDATE SET used = used + 1 WHERE used < limit
 * which Postgres serialises per row, so two simultaneous calls can never both take the last slot; if any scope is full the transaction rolls back and no scope is charged. Scopes are locked in
 * a fixed order so concurrent reservations cannot deadlock. Attempts are counted (a failed call still cost a request). If the limit tables cannot be read or written, the call is NOT blocked
 * (a monitoring problem must not break AI); the failure is logged.
 */
export type LimitKind = "COLLEGE_DEFAULT" | "COLLEGE" | "PROVIDER" | "PURPOSE";
export type LimitRow = { kind: LimitKind; key: string; dailyCalls: number; updatedAt: Date };
export const MAX_LIMIT = 10_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is `key` valid for `kind`? */
export function validKey(kind: LimitKind, key: string): boolean {
  if (kind === "COLLEGE_DEFAULT") return key === "*";
  if (kind === "COLLEGE") return UUID.test(key);
  if (kind === "PROVIDER") return (PROVIDERS as readonly string[]).includes(key);
  return (PURPOSES as readonly string[]).includes(key);
}
export const dayOf = (d = new Date()) => d.toISOString().slice(0, 10);

// ---- limits, cached briefly so a call does not read the table every time
let cache: { at: number; map: Map<string, number> } | null = null;
const TTL = 15_000;
export const invalidateLimits = () => { cache = null; };
async function limitMap(now = Date.now()): Promise<Map<string, number>> {
  if (cache && now - cache.at < TTL) return cache.map;
  const rows = await db.aiLimit.findMany({ select: { kind: true, key: true, dailyCalls: true } });
  const map = new Map(rows.map((r) => [`${r.kind}:${r.key}`, r.dailyCalls]));
  cache = { at: now, map };
  return map;
}

export async function listLimits(): Promise<LimitRow[]> {
  return (await db.aiLimit.findMany({ orderBy: [{ kind: "asc" }, { key: "asc" }] })).map((r) => ({ kind: r.kind as LimitKind, key: r.key, dailyCalls: r.dailyCalls, updatedAt: r.updatedAt }));
}

/** Sets (or, with null, removes) a limit and writes its audit rows in the same transaction. */
export async function setLimitAudited(i: { kind: LimitKind; key: string; dailyCalls: number | null; adminId: string | null }, audit: (before: number | null, after: number | null) => AuditData[]): Promise<{ before: number | null; after: number | null }> {
  if (!validKey(i.kind, i.key)) throw new RangeError("The limit key is not valid for this kind");
  if (i.dailyCalls !== null && (!Number.isInteger(i.dailyCalls) || i.dailyCalls < 0 || i.dailyCalls > MAX_LIMIT)) throw new RangeError("The limit must be a whole number from 0 to 10,000,000");
  const out = await db.$transaction(async (tx) => {
    const old = await tx.aiLimit.findUnique({ where: { kind_key: { kind: i.kind, key: i.key } } });
    const before = old?.dailyCalls ?? null;
    if (i.dailyCalls === null) { if (old) await tx.aiLimit.delete({ where: { id: old.id } }); }
    else if (old) await tx.aiLimit.update({ where: { id: old.id }, data: { dailyCalls: i.dailyCalls, updatedBy: i.adminId } });
    else await tx.aiLimit.create({ data: { kind: i.kind, key: i.key, dailyCalls: i.dailyCalls, updatedBy: i.adminId } });
    for (const a of audit(before, i.dailyCalls)) await tx.platformAuditLog.create({ data: { adminId: a.adminId ?? null, email: a.email ?? null, action: a.action, detail: a.detail, ip: a.ip ?? null } });
    return { before, after: i.dailyCalls };
  });
  invalidateLimits();
  return out;
}

export type Reservation = { ok: true } | { ok: false; scope: "college" | "provider" | "purpose"; limit: number };
class Full extends Error { constructor(public scope: "college" | "provider" | "purpose", public limit: number) { super("full"); } }

/** Reserves one call for today in every scope that applies, or refuses without charging any. Never throws: a storage problem lets the call through. */
export async function reserve(c: { collegeKey: string; provider: string; purpose: string }, now = new Date()): Promise<Reservation> {
  try {
    const limits = await limitMap(now.getTime());
    const day = dayOf(now);
    const scopes: { scope: string; kind: "college" | "provider" | "purpose"; limit: number | null }[] = [
      ...(c.collegeKey !== "platform" ? [{ scope: `college:${c.collegeKey}`, kind: "college" as const, limit: limits.get(`COLLEGE:${c.collegeKey}`) ?? limits.get("COLLEGE_DEFAULT:*") ?? null }] : []),
      { scope: `provider:${c.provider}`, kind: "provider" as const, limit: limits.get(`PROVIDER:${c.provider}`) ?? null },
      { scope: `purpose:${c.purpose}`, kind: "purpose" as const, limit: limits.get(`PURPOSE:${c.purpose}`) ?? null },
    ].sort((a, b) => (a.scope < b.scope ? -1 : 1));
    if (scopes.some((s) => s.limit === 0)) { const z = scopes.find((s) => s.limit === 0)!; return { ok: false, scope: z.kind, limit: 0 }; }
    try {
      await db.$transaction(async (tx) => {
        for (const s of scopes) {
          const id = randomUUID();
          const rows = s.limit === null
            ? await tx.$queryRaw<{ used: number }[]>`INSERT INTO "AiQuotaCounter" (id, day, scope, used, "updatedAt") VALUES (${id}::uuid, ${day}::date, ${s.scope}, 1, now())
                ON CONFLICT (day, scope) DO UPDATE SET used = "AiQuotaCounter".used + 1, "updatedAt" = now() RETURNING used`
            : await tx.$queryRaw<{ used: number }[]>`INSERT INTO "AiQuotaCounter" (id, day, scope, used, "updatedAt") VALUES (${id}::uuid, ${day}::date, ${s.scope}, 1, now())
                ON CONFLICT (day, scope) DO UPDATE SET used = "AiQuotaCounter".used + 1, "updatedAt" = now() WHERE "AiQuotaCounter".used < ${s.limit} RETURNING used`;
          if (!rows.length) throw new Full(s.kind, s.limit!); // no row came back: the scope is full; rolling back releases every slot taken so far
        }
      }, { timeout: 5000 });
      return { ok: true };
    } catch (e) { if (e instanceof Full) return { ok: false, scope: e.scope, limit: e.limit }; throw e; }
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", msg: "AI limit check unavailable; the call is allowed", errorName: (e as Error)?.name, code: (e as { code?: string })?.code }));
    return { ok: true };
  }
}

/** Today's consumption per scope with the limit that applies, for the administrator. Bounded: at most a few hundred counters for one day. */
export async function consumption(day = dayOf()) {
  const [counters, limits] = await Promise.all([
    db.aiQuotaCounter.findMany({ where: { day: new Date(`${day}T00:00:00Z`) }, orderBy: { scope: "asc" }, take: 500 }),
    listLimits(),
  ]);
  const lim = new Map(limits.map((l) => [`${l.kind}:${l.key}`, l.dailyCalls]));
  const def = lim.get("COLLEGE_DEFAULT:*") ?? null;
  return counters.map((c) => {
    const [kind, key] = [c.scope.split(":")[0], c.scope.slice(c.scope.indexOf(":") + 1)];
    const limit = kind === "college" ? (lim.get(`COLLEGE:${key}`) ?? def) : kind === "provider" ? (lim.get(`PROVIDER:${key}`) ?? null) : (lim.get(`PURPOSE:${key}`) ?? null);
    return { scope: c.scope, kind, key, used: c.used, limit, ratio: limit ? c.used / limit : null };
  });
}
export type { Prisma };

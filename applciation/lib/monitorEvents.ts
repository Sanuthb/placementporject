import { db } from "@/lib/db";
import type { ErrorQuery, MonitorError } from "@/lib/monitorStore";
import { RETENTION_DAYS } from "@/lib/monitorRetention";
import { Prisma } from "@/generated/prisma/client";

/** Reads of the durable MonitorEvent table (what the System Administrator error view and the Server errors check use). Every query is bounded by the 14-day retention and by paging. */
type Row = { id: string; at: Date; service: string; status: number | null; code: string; method: string | null; path: string | null; requestId: string | null; message: string };
const toError = (r: Row): MonitorError => ({ id: r.id, at: r.at.toISOString(), service: r.service as MonitorError["service"], status: r.status ?? 500, code: r.code, method: r.method, path: r.path, requestId: r.requestId, message: r.message });

export async function listDurableErrors(q: ErrorQuery) {
  const floor = new Date(Date.now() - RETENTION_DAYS.monitorEvent * 86_400_000);
  const at: Prisma.DateTimeFilter = { gte: q.from && q.from > floor ? q.from : floor, ...(q.to ? { lte: q.to } : {}) };
  const needle = q.q?.trim().replace(/\\/g, "").replace(/[%_]/g, (c) => "\\" + c) || undefined; // Prisma passes `contains` to LIKE unescaped: % and _ must match literally; backslashes are ignored
  const where: Prisma.MonitorEventWhereInput = {
    at, ...(q.service ? { service: q.service } : {}),
    ...(needle ? { OR: [{ path: { contains: needle, mode: "insensitive" } }, { code: { contains: needle, mode: "insensitive" } }, { message: { contains: needle, mode: "insensitive" } }, { requestId: { contains: needle, mode: "insensitive" } }] } : {}),
  };
  const [total, rows, retained, oldest] = await Promise.all([
    db.monitorEvent.count({ where }),
    db.monitorEvent.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.monitorEvent.count({ where: { at: { gte: floor } } }),
    db.monitorEvent.findFirst({ where: { at: { gte: floor } }, orderBy: { at: "asc" }, select: { at: true } }),
  ]);
  return { items: rows.map(toError), page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), retained, since: oldest?.at.toISOString() ?? null, durable: true as const, retentionDays: RETENTION_DAYS.monitorEvent };
}

/** The same counts as the in-memory tally, but from the table: across restarts and across every server instance. */
export async function durableErrorCounts(nowMs = Date.now()) {
  const m15 = new Date(nowMs - 900_000), h1 = new Date(nowMs - 3_600_000), d1 = new Date(nowMs - 86_400_000);
  const [[c], byService, byStatus, byRoute] = await Promise.all([
    db.$queryRaw<{ m15: number; h1: number; d1: number }[]>`SELECT (count(*) FILTER (WHERE "at" > ${m15}))::int AS m15, (count(*) FILTER (WHERE "at" > ${h1}))::int AS h1, count(*)::int AS d1 FROM "MonitorEvent" WHERE "at" > ${d1}`,
    db.$queryRaw<{ k: string; n: number }[]>`SELECT service AS k, count(*)::int AS n FROM "MonitorEvent" WHERE "at" > ${h1} GROUP BY service`,
    db.$queryRaw<{ k: string; n: number }[]>`SELECT coalesce(status::text, '?') AS k, count(*)::int AS n FROM "MonitorEvent" WHERE "at" > ${h1} GROUP BY 1 ORDER BY n DESC LIMIT 10`,
    db.$queryRaw<{ k: string; n: number }[]>`SELECT coalesce(method, '?') || ' ' || coalesce(path, '?') AS k, count(*)::int AS n FROM "MonitorEvent" WHERE "at" > ${h1} GROUP BY 1 ORDER BY n DESC LIMIT 10`,
  ]);
  return {
    last15Minutes: Number(c?.m15 ?? 0), lastHour: Number(c?.h1 ?? 0), last24Hours: Number(c?.d1 ?? 0),
    byServiceLastHour: Object.fromEntries(byService.map((r) => [r.k, Number(r.n)])),
    byStatusLastHour: byStatus.map((r) => ({ key: r.k, count: Number(r.n) })), byRouteLastHour: byRoute.map((r) => ({ key: r.k, count: Number(r.n) })),
    retained: 0, capacity: 0,
  };
}

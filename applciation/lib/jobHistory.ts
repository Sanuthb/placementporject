import { db } from "@/lib/db";
import { nextRun, previousRun } from "@/lib/cronMeta";
import { RUN_TIMEOUT_MS } from "@/lib/jobRun";
import { RETENTION_DAYS } from "@/lib/monitorRetention";

/** Reads of the JobRun table for the System Administrator: the latest run, last success and last failure of every job, and a paged list of runs. Bounded by the 90-day retention. */
export type RunRow = { job: string; slotAt: string; startedAt: string; lastStartedAt: string; finishedAt: string | null; ok: boolean | null; durationMs: number | null; attempts: number; failedAttempts: number; summary: Record<string, number> | null; error: string | null };
/** `since` is when recording actually began (the earliest first attempt), not the earliest slot: a slot before that could never have been recorded, so it is never called missed. */
export type JobHistory = { available: boolean; since: string | null; latest: Record<string, RunRow>; lastSuccess: Record<string, RunRow>; lastFailure: Record<string, RunRow> };
export const noHistory = (): JobHistory => ({ available: false, since: null, latest: {}, lastSuccess: {}, lastFailure: {} });

type Raw = { job: string; slotAt: Date; startedAt: Date; lastStartedAt: Date; finishedAt: Date | null; ok: boolean | null; durationMs: number | null; attempts: number; failedAttempts: number; summary: unknown; error: string | null };
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
export const toRun = (r: Raw): RunRow => ({ job: r.job, slotAt: iso(r.slotAt)!, startedAt: iso(r.startedAt)!, lastStartedAt: iso(r.lastStartedAt)!, finishedAt: iso(r.finishedAt), ok: r.ok, durationMs: r.durationMs, attempts: r.attempts, failedAttempts: r.failedAttempts, summary: r.summary && typeof r.summary === "object" ? (r.summary as Record<string, number>) : null, error: r.error });
const byJob = (rows: Raw[]) => Object.fromEntries(rows.map((r) => [r.job, toRun(r)]));

export async function loadJobHistory(now = new Date()): Promise<JobHistory> {
  const floor = new Date(now.getTime() - RETENTION_DAYS.jobRun * 86_400_000);
  const [latest, success, failure, [first]] = await Promise.all([
    db.$queryRaw<Raw[]>`SELECT DISTINCT ON (job) job, "slotAt", "startedAt", "lastStartedAt", "finishedAt", ok, "durationMs", attempts, "failedAttempts", summary, error FROM "JobRun" WHERE "slotAt" > ${floor} ORDER BY job, "slotAt" DESC`,
    db.$queryRaw<Raw[]>`SELECT DISTINCT ON (job) job, "slotAt", "startedAt", "lastStartedAt", "finishedAt", ok, "durationMs", attempts, "failedAttempts", summary, error FROM "JobRun" WHERE "slotAt" > ${floor} AND ok = true ORDER BY job, "slotAt" DESC`,
    db.$queryRaw<Raw[]>`SELECT DISTINCT ON (job) job, "slotAt", "startedAt", "lastStartedAt", "finishedAt", ok, "durationMs", attempts, "failedAttempts", summary, error FROM "JobRun" WHERE "slotAt" > ${floor} AND ok = false ORDER BY job, "slotAt" DESC`,
    db.$queryRaw<{ since: Date | null }[]>`SELECT min("startedAt") AS since FROM "JobRun" WHERE "slotAt" > ${floor}`,
  ]);
  return { available: true, since: iso(first?.since ?? null), latest: byJob(latest), lastSuccess: byJob(success), lastFailure: byJob(failure) };
}

export async function listJobRuns(q: { job?: string; ok?: boolean; page: number; pageSize: number }) {
  const where = { slotAt: { gt: new Date(Date.now() - RETENTION_DAYS.jobRun * 86_400_000) }, ...(q.job ? { job: q.job } : {}), ...(q.ok !== undefined ? { ok: q.ok } : {}) };
  const [total, rows] = await Promise.all([db.jobRun.count({ where }), db.jobRun.findMany({ where, orderBy: [{ slotAt: "desc" }, { job: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize })]);
  return { items: rows.map((r) => toRun({ ...r, summary: r.summary })), page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), retentionDays: RETENTION_DAYS.jobRun };
}

// ---------- judging one job (pure: every rule is unit-tested) ----------
export type JobState = "succeeded" | "failed" | "running" | "interrupted" | "overdue" | "no_run_recorded";
/** How late a slot may be before the job counts as overdue: a quarter of its interval, at least 15 minutes and at most an hour (schedulers do not fire to the second). */
export const graceMs = (intervalMs: number) => Math.min(3_600_000, Math.max(15 * 60_000, intervalMs * 0.25));
export function judgeJob(i: { schedule: string; latest?: RunRow; since: string | null; now: Date }): JobState {
  const { latest, now } = i, slot = previousRun(i.schedule, now), next = nextRun(i.schedule, now);
  const late = !!slot && now.getTime() - slot.getTime() > graceMs(slot && next ? next.getTime() - slot.getTime() : 3_600_000);
  if (!latest) return late && !!i.since && new Date(i.since) <= slot! ? "overdue" : "no_run_recorded";
  if (latest.finishedAt === null || new Date(latest.lastStartedAt) > new Date(latest.finishedAt)) return now.getTime() - new Date(latest.lastStartedAt).getTime() > RUN_TIMEOUT_MS ? "interrupted" : "running";
  if (late && new Date(latest.slotAt) < slot!) return "overdue";
  return latest.ok ? "succeeded" : "failed";
}

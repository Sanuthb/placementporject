import { randomUUID } from "node:crypto";
import vercel from "@/vercel.json";
import { db } from "@/lib/db";
import { previousRun } from "@/lib/cronMeta";
import { safeFailure, scrub } from "@/lib/monitorStore";

/**
 * Scheduled-job history (SA-TC-055). `withJobRun(job, work)` runs the job's real work exactly as before and records one row per schedule slot:
 * when it started and finished, whether it worked, how long it took, how many attempts the slot needed, counts the job returned, and a sanitized failure note.
 *
 * Guarantees (each is tested):
 *  - Monitoring can never change what the job does. Every write is wrapped, time-limited and swallowed; `work` always runs, its result is returned
 *    untouched, and its error is rethrown untouched.
 *  - A scheduler retry, or two invocations of the same slot at once, update one row (attempts + 1) instead of adding rows. The slot is derived on the
 *    server from the job's cron expression, never from anything the caller sends.
 *  - Only whitelisted numeric counts and a scrubbed, shortened failure note are stored: no credential, token, address, message body or person.
 */

/** How long a monitoring write may hold the job back. A slow or hung monitoring table costs the job at most this per write, twice per run. */
export const WRITE_LIMIT_MS = 1000;
/** An attempt with no recorded end after this long is shown as interrupted rather than running. */
export const RUN_TIMEOUT_MS = 15 * 60_000;

export type RunStart = { job: string; trigger: string; slotAt: Date; at: Date };
export type RunEnd = RunStart & { finishedAt: Date; ok: boolean; durationMs: number; summary: Record<string, number> | null; error: string | null };
export type JobStore = { begin(s: RunStart): Promise<void>; finish(e: RunEnd): Promise<void> };

/** The schedule slot a run at `now` belongs to: the latest time the job's cron expression matched. A job that is not registered gets the current minute. */
export function slotFor(job: string, now: Date): Date {
  const expr = (vercel.crons ?? []).find((c) => c.path === job)?.schedule;
  const slot = expr ? previousRun(expr, now) : null;
  return slot ?? new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}

/** Keeps only plain numeric counts (colleges, reminded...) from what a job returned. Anything else, including strings, is dropped. */
export function numericSummary(x: unknown): Record<string, number> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (Object.keys(out).length >= 12) break;
    if (/^[A-Za-z][A-Za-z0-9]{0,29}$/.test(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export { safeFailure };

const within = <T>(p: Promise<T>, ms: number) => { let t: NodeJS.Timeout; return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`monitoring write exceeded ${ms} ms`)), ms); })]).finally(() => clearTimeout(t)); };
const swallow = (stage: string, job: string, e: unknown) => { try { console.warn(JSON.stringify({ level: "warn", msg: "job history not recorded; the job itself is unaffected", stage, job, error: scrub(e, 160) })); } catch { /* logging must not throw either */ } };

/** The database store. Two atomic upserts on (job, slot): the start counts an attempt, the end records the outcome (and creates the row if the start never landed). */
export const dbStore: JobStore = {
  async begin(s) {
    await db.$executeRaw`
      INSERT INTO "JobRun" (id, job, trigger, "slotAt", "startedAt", "lastStartedAt", attempts)
      VALUES (${randomUUID()}::uuid, ${s.job}, ${s.trigger}, ${s.slotAt}, ${s.at}, ${s.at}, 1)
      ON CONFLICT (job, "slotAt") DO UPDATE SET attempts = "JobRun".attempts + 1, "lastStartedAt" = GREATEST("JobRun"."lastStartedAt", EXCLUDED."lastStartedAt")`;
  },
  async finish(e) {
    const summary = e.summary ? JSON.stringify(e.summary) : null;
    // Of several attempts for one slot, the one that finished last decides the outcome shown; every failed attempt is still counted.
    await db.$executeRaw`
      INSERT INTO "JobRun" (id, job, trigger, "slotAt", "startedAt", "lastStartedAt", "finishedAt", ok, "durationMs", attempts, "failedAttempts", summary, error)
      VALUES (${randomUUID()}::uuid, ${e.job}, ${e.trigger}, ${e.slotAt}, ${e.at}, ${e.at}, ${e.finishedAt}, ${e.ok}, ${e.durationMs}, 1, ${e.ok ? 0 : 1}, ${summary}::jsonb, ${e.error})
      ON CONFLICT (job, "slotAt") DO UPDATE SET
        "failedAttempts" = "JobRun"."failedAttempts" + ${e.ok ? 0 : 1},
        ok = CASE WHEN "JobRun"."finishedAt" IS NULL OR "JobRun"."finishedAt" <= EXCLUDED."finishedAt" THEN EXCLUDED.ok ELSE "JobRun".ok END,
        "durationMs" = CASE WHEN "JobRun"."finishedAt" IS NULL OR "JobRun"."finishedAt" <= EXCLUDED."finishedAt" THEN EXCLUDED."durationMs" ELSE "JobRun"."durationMs" END,
        summary = CASE WHEN "JobRun"."finishedAt" IS NULL OR "JobRun"."finishedAt" <= EXCLUDED."finishedAt" THEN EXCLUDED.summary ELSE "JobRun".summary END,
        error = CASE WHEN "JobRun"."finishedAt" IS NULL OR "JobRun"."finishedAt" <= EXCLUDED."finishedAt" THEN EXCLUDED.error ELSE "JobRun".error END,
        "finishedAt" = GREATEST("JobRun"."finishedAt", EXCLUDED."finishedAt")`;
  },
};

type Opts = { trigger?: string; store?: JobStore; now?: () => Date; limitMs?: number };

/** Runs `work` and records the run. Returns exactly what `work` returns and throws exactly what it throws; recording failures are logged and ignored. */
export async function withJobRun<T>(job: string, work: () => Promise<T>, o: Opts = {}): Promise<T> {
  const store = o.store ?? dbStore, clock = o.now ?? (() => new Date()), limit = o.limitMs ?? WRITE_LIMIT_MS, trigger = o.trigger ?? "scheduler";
  const t0 = performance.now(), at = clock();
  let start: RunStart | null = null;
  try {
    start = { job, trigger, slotAt: slotFor(job, at), at };
    await within(store.begin(start), limit);
  } catch (e) { swallow("start", job, e); }
  const finish = async (ok: boolean, error: string | null, summary: Record<string, number> | null) => {
    try {
      const s = start ?? { job, trigger, slotAt: slotFor(job, at), at };
      await within(store.finish({ ...s, finishedAt: clock(), ok, durationMs: Math.max(0, Math.round(performance.now() - t0)), summary, error }), limit);
    } catch (e) { swallow("finish", job, e); }
  };
  let result: T;
  try { result = await work(); }
  catch (e) { await finish(false, safeFailure(e), null); throw e; }
  await finish(true, null, numericSummary(result));
  return result;
}

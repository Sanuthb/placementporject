import { db } from "@/lib/db";

/**
 * Retention for the two monitoring tables: JobRun rows are kept 90 days, MonitorEvent rows 14 days.
 * Cleanup is bounded so it can never become a load problem: each statement deletes at most `batch` rows and skips rows another cleanup holds
 * (FOR UPDATE SKIP LOCKED, so overlapping runs never block or deadlock each other), each table is limited to `maxBatches` statements per call, and the whole call
 * stops at `budgetMs`. Anything left over is picked up by the next hourly call. It never throws: a failure is reported in the result and the caller carries on.
 */
export const RETENTION_DAYS = { jobRun: 90, monitorEvent: 14 } as const;
export const PRUNE_LIMITS = { batch: 1000, maxBatches: 5, budgetMs: 3000, pauseMs: 25 } as const;

type Opts = { now?: Date; batch?: number; maxBatches?: number; budgetMs?: number; pauseMs?: number; exec?: (sql: "jobRun" | "monitorEvent", cutoff: Date, batch: number) => Promise<number> };
export type PruneResult = { jobRuns: number; monitorEvents: number; capped: boolean; error: string | null };

const realExec: NonNullable<Opts["exec"]> = (table, cutoff, batch) => table === "jobRun"
  ? db.$executeRaw`DELETE FROM "JobRun" WHERE ctid = ANY (ARRAY(SELECT ctid FROM "JobRun" WHERE "slotAt" < ${cutoff} ORDER BY "slotAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED))`
  : db.$executeRaw`DELETE FROM "MonitorEvent" WHERE ctid = ANY (ARRAY(SELECT ctid FROM "MonitorEvent" WHERE "at" < ${cutoff} ORDER BY "at" LIMIT ${batch} FOR UPDATE SKIP LOCKED))`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pruneMonitoring(o: Opts = {}): Promise<PruneResult> {
  const now = o.now ?? new Date(), batch = o.batch ?? PRUNE_LIMITS.batch, maxBatches = o.maxBatches ?? PRUNE_LIMITS.maxBatches, budget = o.budgetMs ?? PRUNE_LIMITS.budgetMs, pause = o.pauseMs ?? PRUNE_LIMITS.pauseMs;
  const exec = o.exec ?? realExec, t0 = Date.now();
  const out: PruneResult = { jobRuns: 0, monitorEvents: 0, capped: false, error: null };
  try {
    for (const [table, days, key] of [["jobRun", RETENTION_DAYS.jobRun, "jobRuns"], ["monitorEvent", RETENTION_DAYS.monitorEvent, "monitorEvents"]] as const) {
      const cutoff = new Date(now.getTime() - days * 86_400_000);
      for (let i = 0; ; i++) {
        if (i >= maxBatches || Date.now() - t0 >= budget) { out.capped = true; break; }
        const n = await exec(table, cutoff, batch);
        out[key] += n;
        if (n < batch) break;           // nothing (more) to delete that is not already locked by another cleanup
        await sleep(pause);              // let other work in between batches
      }
    }
  } catch (e) { out.error = e instanceof Error ? e.name : "error"; }
  return out;
}

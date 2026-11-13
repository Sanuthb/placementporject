// Unit tests: platform policy input rules and the bounded retention cleanup (with an injected executor: no database).
import { retentionInput, mfaInput, RETENTION } from "../../lib/platformPolicy";
import { pruneMonitoring, RETENTION_DAYS } from "../../lib/monitorRetention";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const ok = (v: unknown) => retentionInput.safeParse(v).success;

t("the built-in defaults are today's behaviour: job history 90, monitoring events 14, AI usage 90", RETENTION.jobRun.defaultDays === 90 && RETENTION.monitorEvent.defaultDays === 14 && RETENTION.aiUsage.defaultDays === 90 && RETENTION_DAYS.jobRun === 90 && RETENTION_DAYS.monitorEvent === 14);
t("every default lies inside its allowed range", (Object.values(RETENTION)).every((r) => r.defaultDays >= r.min && r.defaultDays <= r.max));
t("proposed ranges: job history 30-365, monitoring events 7-90, AI usage 30-365", RETENTION.jobRun.min === 30 && RETENTION.jobRun.max === 365 && RETENTION.monitorEvent.min === 7 && RETENTION.monitorEvent.max === 90 && RETENTION.aiUsage.min === 30 && RETENTION.aiUsage.max === 365);
t("values at the edges of the ranges are accepted", ok({ jobRunDays: 30 }) && ok({ jobRunDays: 365 }) && ok({ monitorEventDays: 7 }) && ok({ monitorEventDays: 90 }) && ok({ aiUsageDays: 30 }) && ok({ aiUsageDays: 365 }));
t("values just outside the ranges are refused", !ok({ jobRunDays: 29 }) && !ok({ jobRunDays: 366 }) && !ok({ monitorEventDays: 6 }) && !ok({ monitorEventDays: 91 }) && !ok({ aiUsageDays: 29 }) && !ok({ aiUsageDays: 366 }));
t("zero, negative, fractional, text and absurd values are refused", [0, -5, 45.5, "90", "abc", 1e9, NaN, Infinity].every((v) => !ok({ jobRunDays: v })));
t("null restores the default, and several fields may be set together", ok({ jobRunDays: null }) && ok({ jobRunDays: 60, monitorEventDays: 14, aiUsageDays: null, confirm: true }));
t("an empty request, unknown fields and a non-object are refused", !ok({}) && !ok({ confirm: true }) && !ok({ jobRunDays: 60, extra: 1 }) && !ok(null) && !ok("90") && !ok([]));
t("the MFA input accepts only a boolean", mfaInput.safeParse({ required: true }).success && !mfaInput.safeParse({ required: "yes" }).success && !mfaInput.safeParse({}).success && !mfaInput.safeParse({ required: true, x: 1 }).success);

// ---- bounded cleanup with an injected executor
const NOW = new Date("2026-06-01T00:00:00Z");
const run = async (days: { jobRun: number; monitorEvent: number }, per: Record<string, number[]>, opts: { batch?: number; maxBatches?: number } = {}) => {
  const calls: { table: string; cutoff: string; batch: number }[] = []; const left = { jobRun: [...per.jobRun], monitorEvent: [...per.monitorEvent] };
  const r = await pruneMonitoring({ now: NOW, days, batch: opts.batch ?? 1000, maxBatches: opts.maxBatches ?? 5, pauseMs: 0, budgetMs: 10_000, exec: async (table, cutoff, batch) => { calls.push({ table, cutoff: cutoff.toISOString().slice(0, 10), batch }); return left[table].shift() ?? 0; } });
  return { r, calls };
};
const a = await run({ jobRun: 30, monitorEvent: 7 }, { jobRun: [10], monitorEvent: [4] });
t("the cutoff comes from the configured days, per table (30 days and 7 days before the run)", a.calls[0].cutoff === "2026-05-02" && a.calls[1].cutoff === "2026-05-25" && a.r.jobRuns === 10 && a.r.monitorEvents === 4 && !a.r.capped, JSON.stringify(a.calls));
const b = await run({ jobRun: 365, monitorEvent: 90 }, { jobRun: [0], monitorEvent: [0] });
t("a longer period moves the cutoff back and removes nothing here", b.calls[0].cutoff === "2025-06-01" && b.calls[1].cutoff === "2026-03-03" && b.r.jobRuns === 0 && b.r.monitorEvents === 0);
const c = await run({ jobRun: 90, monitorEvent: 14 }, { jobRun: [1000, 1000, 1000, 1000, 1000, 1000, 1000], monitorEvent: [5] }, { batch: 1000, maxBatches: 3 });
t("a large backlog is bounded: at most maxBatches statements of at most batch rows per table, then 'capped' is reported and the rest waits for the next run", c.calls.filter((x) => x.table === "jobRun").length === 3 && c.r.jobRuns === 3000 && c.r.capped === true && c.calls.every((x) => x.batch === 1000));
const d = await run({ jobRun: 90, monitorEvent: 14 }, { jobRun: [3], monitorEvent: [0] }, { batch: 1000 });
t("a partial batch ends the table's cleanup (no further statements) and is not 'capped'", d.calls.filter((x) => x.table === "jobRun").length === 1 && !d.r.capped);
const e = await pruneMonitoring({ now: NOW, pauseMs: 0, exec: async (table, cutoff) => { if (table === "jobRun") throw new Error("boom"); return 0; } });
t("a failure never throws: it is reported by name only", e.error === "Error" && e.jobRuns === 0);
t("with no days given and an injected executor the built-in defaults apply (no database is read)", await (async () => { const seen: string[] = []; await pruneMonitoring({ now: NOW, pauseMs: 0, exec: async (_t, cutoff) => { seen.push(cutoff.toISOString().slice(0, 10)); return 0; } }); return seen[0] === "2026-03-03" && seen[1] === "2026-05-18"; })());
process.exit(fails ? 1 : 0);

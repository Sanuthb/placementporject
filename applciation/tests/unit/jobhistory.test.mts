// Unit tests: scheduled-job history, retention, durable error events and database-outage mapping (Gate 4 Phase 4.3, SA-TC-054 / SA-TC-055).
// No network, no database: the stores and writers are replaced by fakes that can fail, hang or count calls.
import { previousRun, nextRun } from "../../lib/cronMeta";
import { withJobRun, slotFor, numericSummary, safeFailure, WRITE_LIMIT_MS, type JobStore, type RunStart, type RunEnd } from "../../lib/jobRun";
import { judgeJob, graceMs, type RunRow, type JobHistory } from "../../lib/jobHistory";
import { classifyScheduledJobs, type JobRow } from "../../lib/health";
import { scheduledJobs } from "../../lib/cronMeta";
import { pruneMonitoring, RETENTION_DAYS, PRUNE_LIMITS } from "../../lib/monitorRetention";
import { recordError, setEventWriter, persistStats, resetMonitorStore, listErrors, PERSIST, type MonitorError } from "../../lib/monitorStore";
import { isDatabaseUnavailable } from "../../lib/dbErrors";
import { toErrorResponse } from "../../lib/api/handler";
import { jobsQuery } from "../../lib/monitorQuery";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const D = (s: string) => new Date(s);
const SECRETS = ["hunter2", "sk_live_abcdefghijklmnop1234", "student.name@college.edu", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk", "9876543210", "Bearer abc123tokenvalue", "postgresql://u:hunter2@db.example.com:5432/x"];
const leaks = (s: string) => SECRETS.filter((x) => s.includes(x.replace("Bearer ", "")));

// ---------------- cron slots ----------------
t("previousRun: hourly job at 10:05 belongs to the 10:00 slot", previousRun("0 * * * *", D("2026-11-16T10:05:30Z"))?.toISOString() === "2026-11-16T10:00:00.000Z");
t("previousRun: a run exactly on the minute is its own slot", previousRun("0 * * * *", D("2026-11-16T10:00:00Z"))?.toISOString() === "2026-11-16T10:00:00.000Z");
t("previousRun: 30 past the hour", previousRun("30 * * * *", D("2026-11-16T10:29:59Z"))?.toISOString() === "2026-11-16T09:30:00.000Z" && previousRun("30 * * * *", D("2026-11-16T10:30:00Z"))?.toISOString() === "2026-11-16T10:30:00.000Z");
t("previousRun: daily 02:00 looks back to yesterday before 02:00 and to today after", previousRun("0 2 * * *", D("2026-11-16T01:59:00Z"))?.toISOString() === "2026-11-15T02:00:00.000Z" && previousRun("0 2 * * *", D("2026-11-16T23:00:00Z"))?.toISOString() === "2026-11-16T02:00:00.000Z");
t("previousRun: an expression that is not understood is null, never a guess", previousRun("not a cron", D("2026-11-16T10:00:00Z")) === null && previousRun("61 * * * *", D("2026-11-16T10:00:00Z")) === null);
t("previousRun and nextRun bracket a moment", (() => { const now = D("2026-11-16T10:20:00Z"); return previousRun("0 * * * *", now)!.getTime() < now.getTime() && nextRun("0 * * * *", now)!.getTime() > now.getTime(); })());
t("slotFor: every registered job maps to a slot at or before now", scheduledJobs().every((j) => { const now = D("2026-11-16T10:20:00Z"); const s = slotFor(j.path, now); return s.getTime() <= now.getTime() && now.getTime() - s.getTime() <= 24 * 3600_000; }));
t("slotFor: an unregistered job falls back to the current minute", slotFor("/api/not/registered", D("2026-11-16T10:20:45Z")).toISOString() === "2026-11-16T10:20:00.000Z");
t("slotFor: two moments in the same hour share the hourly slot; the next hour does not", slotFor("/api/notifications/round-reminders/run", D("2026-11-16T10:01:00Z")).getTime() === slotFor("/api/notifications/round-reminders/run", D("2026-11-16T10:59:00Z")).getTime() && slotFor("/api/notifications/round-reminders/run", D("2026-11-16T11:00:00Z")).getTime() !== slotFor("/api/notifications/round-reminders/run", D("2026-11-16T10:59:00Z")).getTime());

// ---------------- summaries and failure notes ----------------
t("numericSummary keeps counts only", JSON.stringify(numericSummary({ colleges: 3, reminded: 12, note: "x@y.com", nested: { a: 1 }, list: [1], bad: NaN, inf: Infinity })) === JSON.stringify({ colleges: 3, reminded: 12 }));
t("numericSummary: not an object, an array, or nothing numeric gives null", numericSummary(null) === null && numericSummary("x") === null && numericSummary([1, 2]) === null && numericSummary({ a: "b" }) === null);
t("numericSummary: keys that are not plain names are dropped and at most 12 are kept", (() => { const o: Record<string, number> = { "bad key": 1, "x@y": 2 }; for (let i = 0; i < 30; i++) o[`k${i}`] = i; const r = numericSummary(o)!; return !("bad key" in r) && !("x@y" in r) && Object.keys(r).length === 12; })());
{
  const prisma = Object.assign(new Error(`Invalid \`prisma.student.findMany()\` invocation: where email = 'student.name@college.edu' phone 9876543210`), { name: "PrismaClientKnownRequestError", code: "P2002" });
  const f = safeFailure(prisma);
  t("safeFailure: a database error keeps only its class and code, never the query or values", /PrismaClientKnownRequestError P2002/.test(f) && leaks(f).length === 0 && !/student|email|9876/.test(f), f);
  const g = safeFailure(new Error(`connect failed ${SECRETS[6]} token=${SECRETS[1]} Bearer abc123tokenvalue mailed ${SECRETS[2]} jwt ${SECRETS[3]} phone ${SECRETS[4]}`));
  t("safeFailure: connection strings, keys, tokens, addresses, JWTs and long digit runs are removed", leaks(g).length === 0 && !/hunter2/.test(g) && !/9876543210/.test(g), g);
  t("safeFailure: at most 300 characters and a single line", safeFailure(new Error("x".repeat(2000) + "\nsecond line with stack at /a/b/c.ts:1")).length <= 300 && !safeFailure(new Error("a\nb")).includes("\n"));
  t("safeFailure: values that are not errors, and hostile objects, never throw", (() => { try { safeFailure(undefined); safeFailure(null); safeFailure("plain text"); safeFailure({ get name() { throw new Error("boom"); } }); safeFailure(Object.create(null)); return true; } catch { return false; } })());
  t("safeFailure: a plain Error keeps its readable message", /Error: Round reminders could not be built/.test(safeFailure(new Error("Round reminders could not be built"))));
}

// ---------------- withJobRun ----------------
type Rec = { begins: RunStart[]; finishes: RunEnd[] };
const fake = (o: { begin?: (s: RunStart) => Promise<void>; finish?: (e: RunEnd) => Promise<void> } = {}): JobStore & Rec => { const r: Rec = { begins: [], finishes: [] }; return Object.assign({
  begin: async (s: RunStart) => { r.begins.push(s); await o.begin?.(s); },
  finish: async (e: RunEnd) => { r.finishes.push(e); await o.finish?.(e); },
}, r); };
const warnings: string[] = []; const realWarn = console.warn; console.warn = (...a: unknown[]) => { warnings.push(a.join(" ")); };
const NOW = D("2026-11-16T10:05:00Z"); const clock = () => NOW;
{
  const store = fake(); const payload = { colleges: 2, reminded: 7, secretNote: "x@y.com" };
  const out = await withJobRun("/api/notifications/round-reminders/run", async () => payload, { store, now: clock });
  t("success: returns exactly what the job returned", out === payload);
  t("success: one start and one finish, outcome ok, duration recorded, counts only", store.begins.length === 1 && store.finishes.length === 1 && store.finishes[0].ok === true && store.finishes[0].durationMs >= 0 && JSON.stringify(store.finishes[0].summary) === JSON.stringify({ colleges: 2, reminded: 7 }) && store.finishes[0].error === null);
  t("success: the slot is derived on the server (10:00), trigger is scheduler", store.begins[0].slotAt.toISOString() === "2026-11-16T10:00:00.000Z" && store.begins[0].trigger === "scheduler");
}
{
  const store = fake(); const boom = Object.assign(new Error(`failed for ${SECRETS[2]} using ${SECRETS[6]}`), { name: "SmtpError" });
  let thrown: unknown = null; try { await withJobRun("/api/crm/follow-ups/run", async () => { throw boom; }, { store, now: clock }); } catch (e) { thrown = e; }
  t("failure: the job's own error is rethrown untouched (same instance)", thrown === boom);
  t("failure: recorded as not ok, with a sanitized note and no counts", store.finishes[0].ok === false && store.finishes[0].summary === null && leaks(store.finishes[0].error ?? "").length === 0 && /SmtpError/.test(store.finishes[0].error ?? ""), store.finishes[0].error ?? "");
}
{
  const store = fake({ begin: async () => { throw new Error("relation \"JobRun\" does not exist"); } }); let ran = 0;
  const out = await withJobRun("/api/blocking/evaluate", async () => { ran++; return { colleges: 1 }; }, { store, now: clock });
  t("monitoring start fails: the job still runs once and returns its result", ran === 1 && (out as { colleges: number }).colleges === 1);
  t("monitoring start fails: the end is still attempted (so a record can still be made)", store.finishes.length === 1 && store.finishes[0].ok === true);
}
{
  const store = fake({ finish: async () => { throw new Error("connection refused"); } });
  const out = await withJobRun("/api/blocking/evaluate", async () => ({ ok: 1 }), { store, now: clock }); t("monitoring end fails: the result is still returned", (out as { ok: number }).ok === 1);
  let thrown: unknown = null; const boom = new Error("real job failure"); try { await withJobRun("/api/blocking/evaluate", async () => { throw boom; }, { store, now: clock }); } catch (e) { thrown = e; }
  t("monitoring end fails on a failing job: the job's error is still the one thrown", thrown === boom);
}
{
  const hang = () => new Promise<void>(() => undefined); const store = fake({ begin: hang, finish: hang }); let ran = 0;
  const t0 = Date.now(); const out = await withJobRun("/api/blocking/evaluate", async () => { ran++; await sleep(20); return { n: 5 }; }, { store, now: clock, limitMs: 60 }); const ms = Date.now() - t0;
  t("monitoring hangs: the job runs, returns its result, and is held back by at most the two write limits", ran === 1 && (out as { n: number }).n === 5 && ms < 60 * 2 + 20 + 250, `${ms} ms`);
  t("monitoring hang limit is short by default (1 s per write)", WRITE_LIMIT_MS === 1000);
}
{
  const store = fake({ begin: async () => { throw new Error(`password=${SECRETS[0]} at ${SECRETS[6]}`); } }); warnings.length = 0;
  await withJobRun("/api/blocking/evaluate", async () => ({ a: 1 }), { store, now: clock });
  t("a monitoring failure is logged for operators, with the message scrubbed", warnings.length >= 1 && /job history not recorded/.test(warnings[0]) && leaks(warnings.join("\n")).length === 0 && !/hunter2/.test(warnings.join("\n")), warnings.join("|").slice(0, 200));
}
{
  const store = fake(); await withJobRun("/api/notifications/round-reminders/run", async () => ({}), { store, now: () => D("2026-11-16T10:01:00Z") });
  await withJobRun("/api/notifications/round-reminders/run", async () => ({}), { store, now: () => D("2026-11-16T10:58:00Z") });
  await withJobRun("/api/notifications/round-reminders/run", async () => ({}), { store, now: () => D("2026-11-16T11:02:00Z") });
  t("retries of one slot carry the same slot key; the next hour gets a new one (the database keeps one row per slot)", store.begins[0].slotAt.getTime() === store.begins[1].slotAt.getTime() && store.begins[1].slotAt.getTime() !== store.begins[2].slotAt.getTime());
}
{
  const store = fake(); let started = 0, release!: () => void; const gate = new Promise<void>((r) => { release = r; });
  const calls = Array.from({ length: 8 }, () => withJobRun("/api/notifications/reminders/run", async () => { started++; await gate; return { reminded: 1 }; }, { store, now: clock }));
  await sleep(30); release(); const outs = await Promise.all(calls);
  t("concurrent executions: every one runs its work and returns its own result", started === 8 && outs.every((o) => (o as { reminded: number }).reminded === 1));
  t("concurrent executions: all eight carry the identical slot key (so one row), each records its own start and end", new Set(store.begins.map((b) => b.slotAt.getTime())).size === 1 && store.begins.length === 8 && store.finishes.length === 8);
}
console.warn = realWarn;

// ---------------- judging a job ----------------
const run = (o: Partial<RunRow> = {}): RunRow => ({ job: "/api/notifications/round-reminders/run", slotAt: "2026-11-16T10:00:00.000Z", startedAt: "2026-11-16T10:00:02.000Z", lastStartedAt: "2026-11-16T10:00:02.000Z", finishedAt: "2026-11-16T10:00:05.000Z", ok: true, durationMs: 3000, attempts: 1, failedAttempts: 0, summary: { reminded: 2 }, error: null, ...o });
const HOURLY = "0 * * * *", DAILY = "0 3 * * *"; const at = (s: string) => D(s);
t("grace: a quarter of the interval, between 15 minutes and an hour", graceMs(3600_000) === 15 * 60_000 && graceMs(86_400_000) === 3600_000 && graceMs(60_000) === 15 * 60_000);
t("judge: a finished ok run in the current slot is succeeded", judgeJob({ schedule: HOURLY, latest: run(), since: "2026-11-01T00:00:00Z", now: at("2026-11-16T10:30:00Z") }) === "succeeded");
t("judge: a finished failed run is failed", judgeJob({ schedule: HOURLY, latest: run({ ok: false, error: "x" }), since: null, now: at("2026-11-16T10:30:00Z") }) === "failed");
t("judge: started, not finished, recently is running", judgeJob({ schedule: HOURLY, latest: run({ finishedAt: null, ok: null, durationMs: null }), since: null, now: at("2026-11-16T10:05:00Z") }) === "running");
t("judge: started, never finished, long ago is interrupted", judgeJob({ schedule: HOURLY, latest: run({ finishedAt: null, ok: null, durationMs: null }), since: null, now: at("2026-11-16T10:40:00Z") }) === "interrupted");
t("judge: a retry that started after the last finish is running again", judgeJob({ schedule: HOURLY, latest: run({ lastStartedAt: "2026-11-16T10:20:00.000Z", attempts: 2 }), since: null, now: at("2026-11-16T10:21:00Z") }) === "running");
t("judge: the previous slot's success is still fine inside the grace period of the new slot", judgeJob({ schedule: HOURLY, latest: run({ slotAt: "2026-11-16T09:00:00.000Z", startedAt: "2026-11-16T09:00:02.000Z", lastStartedAt: "2026-11-16T09:00:02.000Z", finishedAt: "2026-11-16T09:00:05.000Z" }), since: null, now: at("2026-11-16T10:10:00Z") }) === "succeeded");
t("judge: the previous slot's success is overdue once the new slot's grace has passed", judgeJob({ schedule: HOURLY, latest: run({ slotAt: "2026-11-16T09:00:00.000Z", lastStartedAt: "2026-11-16T09:00:02.000Z", finishedAt: "2026-11-16T09:00:05.000Z" }), since: null, now: at("2026-11-16T10:20:00Z") }) === "overdue");
t("judge: a daily job is not overdue 30 minutes after its slot, but is after the hour", judgeJob({ schedule: DAILY, latest: run({ slotAt: "2026-11-15T03:00:00.000Z" }), since: null, now: at("2026-11-16T03:30:00Z") }) === "succeeded" && judgeJob({ schedule: DAILY, latest: run({ slotAt: "2026-11-15T03:00:00.000Z" }), since: null, now: at("2026-11-16T04:10:00Z") }) === "overdue");
t("judge: no run and no history at all is 'no run recorded', never overdue", judgeJob({ schedule: HOURLY, latest: undefined, since: null, now: at("2026-11-16T10:40:00Z") }) === "no_run_recorded");
t("judge: no run for a job although history started before its last slot is overdue", judgeJob({ schedule: HOURLY, latest: undefined, since: "2026-11-16T08:00:00.000Z", now: at("2026-11-16T10:40:00Z") }) === "overdue");
t("judge: no run, history only began after the last slot: not overdue (it could not have been recorded)", judgeJob({ schedule: HOURLY, latest: undefined, since: "2026-11-16T10:20:00.000Z", now: at("2026-11-16T10:40:00Z") }) === "no_run_recorded");

// ---------------- the Scheduled jobs component ----------------
const JOBS: JobRow[] = scheduledJobs(D("2026-11-16T10:30:00Z"));
const hist = (per: (j: JobRow, i: number) => RunRow | null, since = "2026-11-01T00:00:00.000Z"): JobHistory => { const latest: Record<string, RunRow> = {}, lastSuccess: Record<string, RunRow> = {}, lastFailure: Record<string, RunRow> = {}; JOBS.forEach((j, i) => { const r = per(j, i); if (r) { latest[j.path] = r; (r.ok ? lastSuccess : lastFailure)[j.path] = r; } }); return { available: true, since, latest, lastSuccess, lastFailure }; };
const slotOf = (j: JobRow) => previousRun(j.schedule, D("2026-11-16T10:30:00Z"))!.toISOString();
const okRun = (j: JobRow) => run({ job: j.path, slotAt: slotOf(j), lastStartedAt: slotOf(j), startedAt: slotOf(j), finishedAt: new Date(D(slotOf(j)).getTime() + 4000).toISOString() });
const NOW2 = D("2026-11-16T10:30:00Z");
{
  const c = classifyScheduledJobs({ cronSecret: true, jobs: JOBS, history: hist((j) => okRun(j)) }, NOW2);
  t("component: every job ran and succeeded is healthy", c.status === "healthy" && /All 5/.test(c.summary), c.status + c.summary);
  const rows = c.details!.jobs as { lastRunAt: string | null; lastSuccessAt: string | null; durationMs: number | null; state: string; history: string; attempts: number }[];
  t("component: each row carries last run, last success, duration, state and attempts from the record", rows.every((r) => r.lastRunAt && r.lastSuccessAt && r.durationMs === 3000 && r.state === "succeeded" && r.history === "recorded" && r.attempts === 1));
}
{
  const c = classifyScheduledJobs({ cronSecret: true, jobs: JOBS, history: hist((j, i) => (i === 2 ? { ...okRun(j), ok: false, error: "SmtpError ECONNREFUSED: mail server refused", failedAttempts: 1 } : okRun(j))) }, NOW2);
  const rows = c.details!.jobs as { state: string; lastFailure: string | null; lastFailureAt: string | null }[];
  t("component: one failed job makes it degraded (never unavailable) and the note is shown", c.status === "degraded" && rows[2].state === "failed" && /mail server refused/.test(rows[2].lastFailure ?? "") && !!rows[2].lastFailureAt && /1 failed/.test(c.summary), c.status + c.summary);
}
t("component: every job failed is unavailable", classifyScheduledJobs({ cronSecret: true, jobs: JOBS, history: hist((j) => ({ ...okRun(j), ok: false, error: "x" })) }, NOW2).status === "unavailable");
t("component: some jobs with no run yet and none failing is unknown, not healthy", (() => { const c = classifyScheduledJobs({ cronSecret: true, jobs: JOBS, history: hist((j, i) => (i < 2 ? okRun(j) : null), "2026-11-16T10:20:00.000Z") }, NOW2); return c.status === "unknown" && /no recorded run/.test(c.summary); })());
t("component: no run at all (empty history) is unknown", classifyScheduledJobs({ cronSecret: true, jobs: JOBS, history: hist(() => null, "") }, NOW2).status === "unknown");
t("component: an overdue job is degraded", (() => { const c = classifyScheduledJobs({ cronSecret: true, jobs: JOBS, history: hist((j, i) => (i === 3 ? { ...okRun(j), slotAt: "2026-11-16T07:00:00.000Z", lastStartedAt: "2026-11-16T07:00:01.000Z", finishedAt: "2026-11-16T07:00:05.000Z" } : okRun(j))) }, NOW2); return c.status === "degraded" && /overdue/.test(c.summary); })());
t("component: history that cannot be read is unknown and says so (never healthy)", (() => { const c = classifyScheduledJobs({ cronSecret: true, jobs: JOBS, history: { available: false, since: null, latest: {}, lastSuccess: {}, lastFailure: {} } }, NOW2); return c.status === "unknown" && /could not be read/.test(c.summary) && (c.details!.jobs as { history: string }[]).every((r) => r.history === "unavailable"); })());
t("component: no secret or no registry keeps its own status even with history", classifyScheduledJobs({ cronSecret: false, jobs: JOBS, history: hist((j) => okRun(j)) }, NOW2).status === "not_configured" && classifyScheduledJobs({ cronSecret: true, jobs: [], history: hist(() => null) }, NOW2).status === "not_configured");
t("component: with no history argument the old honest behaviour remains (unknown, 'not recorded')", (() => { const c = classifyScheduledJobs({ cronSecret: true, jobs: JOBS }, NOW2); return c.status === "unknown" && (c.details!.jobs as { history: string }[]).every((r) => r.history === "not recorded"); })());
t("component: nothing sensitive appears in the component", leaks(JSON.stringify(classifyScheduledJobs({ cronSecret: true, jobs: JOBS, history: hist((j, i) => (i === 0 ? { ...okRun(j), ok: false, error: safeFailure(new Error(`bad ${SECRETS[2]} ${SECRETS[6]}`)) } : okRun(j))) }, NOW2))).length === 0);

// ---------------- retention ----------------
{
  const calls: { table: string; cutoff: Date; batch: number }[] = []; const NOWR = D("2026-11-16T12:00:00Z");
  const r = await pruneMonitoring({ now: NOWR, pauseMs: 0, exec: async (table, cutoff, batch) => { calls.push({ table, cutoff, batch }); return 0; } });
  t("retention: JobRun is cut at 90 days and MonitorEvent at 14 days", calls.find((c) => c.table === "jobRun")!.cutoff.toISOString() === new Date(NOWR.getTime() - 90 * 86_400_000).toISOString() && calls.find((c) => c.table === "monitorEvent")!.cutoff.toISOString() === new Date(NOWR.getTime() - 14 * 86_400_000).toISOString() && RETENTION_DAYS.jobRun === 90 && RETENTION_DAYS.monitorEvent === 14);
  t("retention: nothing to delete means one statement per table and no cap flag", calls.length === 2 && r.jobRuns === 0 && r.monitorEvents === 0 && r.capped === false && r.error === null);
}
{
  let remaining = 12_500; const sizes: number[] = [];
  const r = await pruneMonitoring({ batch: 1000, maxBatches: 5, pauseMs: 0, exec: async (table, _c, batch) => { if (table === "jobRun") return 0; const n = Math.min(batch, remaining); remaining -= n; sizes.push(n); return n; } });
  t("retention: a large backlog is bounded to maxBatches x batch per call and flagged as capped", r.monitorEvents === 5000 && sizes.length === 5 && r.capped === true && remaining === 7500, JSON.stringify(r));
  t("retention: no single statement is asked to delete more than the batch size", sizes.every((n) => n <= 1000) && PRUNE_LIMITS.batch === 1000 && PRUNE_LIMITS.maxBatches === 5);
}
{
  let n = 0; const t0 = Date.now(); const r = await pruneMonitoring({ batch: 10, maxBatches: 1000, budgetMs: 80, pauseMs: 30, exec: async () => { n++; return 10; } });
  t("retention: the time budget stops a long cleanup", r.capped === true && Date.now() - t0 < 500 && n < 20, `${n} statements in ${Date.now() - t0} ms`);
}
{
  const r = await pruneMonitoring({ pauseMs: 0, exec: async () => { throw new Error("connection refused postgresql://u:hunter2@db/x"); } });
  t("retention: a failure never throws and carries no detail", r.error === "Error" && !JSON.stringify(r).includes("hunter2"));
}

// ---------------- durable error events ----------------
const ev = (o: { throwSync?: boolean; fail?: boolean; hang?: boolean } = {}) => { const w: MonitorError[] = []; const fn = (e: MonitorError): Promise<void> => { if (o.throwSync) throw new Error("sync boom"); w.push(e); if (o.hang) return new Promise(() => undefined); return o.fail ? Promise.reject(new Error("db down")) : Promise.resolve(); }; return { w, fn }; };
{
  resetMonitorStore(); const x = ev(); setEventWriter(x.fn);
  recordError({ status: 503, code: "AI_NOT_CONFIGURED", message: `failed ${SECRETS[6]} ${SECRETS[2]} Bearer abc123tokenvalue`, method: "POST", path: "/api/x/123e4567-e89b-12d3-a456-426614174000/y", requestId: "req-1" });
  recordError({ status: 404, code: "NOT_FOUND" });
  await sleep(20);
  t("events: a 5xx is written durably once; a 4xx is not", x.w.length === 1 && x.w[0].status === 503);
  t("events: what is written is already scrubbed and has its path cleaned", leaks(JSON.stringify(x.w[0])).length === 0 && x.w[0].path === "/api/x/:id/y" && /^[0-9a-f-]{36}$/.test(x.w[0].id));
  t("events: the stats count the write", persistStats().written === 1);
}
{
  resetMonitorStore(); const x = ev({ hang: true }); setEventWriter(x.fn); const t0 = Date.now();
  for (let i = 0; i < 10; i++) recordError({ status: 500, code: "E" + i });
  t("events: recording returns at once even when the database write hangs", Date.now() - t0 < 50);
  t("events: at most PERSIST.inflight writes are outstanding at one time; the rest wait in the queue (none dropped, none written early)", x.w.length === PERSIST.inflight && persistStats().inflight === PERSIST.inflight && persistStats().backlog === 10 - PERSIST.inflight && persistStats().skipped === 0, JSON.stringify(persistStats()));
}
{
  resetMonitorStore(); PERSIST.pauseMs = 80; let healthy = false; const got: MonitorError[] = [];
  setEventWriter(async (e) => { if (!healthy) throw new Error("db down"); got.push(e); });
  recordError({ status: 500, code: "FIRST" }); await sleep(20);
  for (let i = 0; i < 20; i++) recordError({ status: 500, code: "NEXT" + i });
  t("events: after a failed write, writing pauses (no storm against a failing database) and the failure is counted", persistStats().failed === 1 && persistStats().pausedUntil > Date.now(), JSON.stringify(persistStats()));
  t("events: the errors that could not be written wait in a bounded backlog instead of being lost", persistStats().backlog === 21 && persistStats().written === 0, JSON.stringify(persistStats()));
  healthy = true; await sleep(300);
  t("events: when the database answers again the backlog is written, oldest first, and then empties", got.length === 21 && got[0].code === "FIRST" && got[20].code === "NEXT19" && persistStats().backlog === 0, `${got.length} ${JSON.stringify(persistStats())}`);
  PERSIST.pauseMs = 30_000;
}
{
  resetMonitorStore(); PERSIST.pauseMs = 60_000; setEventWriter(async () => { throw new Error("db down"); });
  recordError({ status: 500, code: "FIRST" }); await sleep(20);
  for (let i = 0; i < PERSIST.backlog + 50; i++) recordError({ status: 500, code: "X" + i });
  t("events: the backlog is capped (oldest dropped and counted), so memory stays bounded however long the outage", persistStats().backlog === PERSIST.backlog && persistStats().skipped >= 51, JSON.stringify(persistStats()));
  PERSIST.pauseMs = 30_000;
}
{
  resetMonitorStore(); const x = ev(); setEventWriter(x.fn);
  for (let i = 0; i < PERSIST.perMinute + 25; i++) { recordError({ status: 500, code: "E" + i }); await sleep(0); }
  await sleep(20);
  t("events: no more than PERSIST.perMinute are written in a minute; the rest wait in the bounded queue for the next window", x.w.length === PERSIST.perMinute && persistStats().backlog === 25 && persistStats().skipped === 0, JSON.stringify(persistStats()));
}
{
  resetMonitorStore(); const x = ev({ throwSync: true }); setEventWriter(x.fn); let threw = false;
  try { recordError({ status: 500, code: "E" }); } catch { threw = true; }
  t("events: a writer that throws can never break the request that recorded the error", !threw);
}
setEventWriter(null); resetMonitorStore();

// ---------------- database outage mapping ----------------
const mk = (props: Record<string, unknown>, msg = "x") => Object.assign(new Error(msg), props);
t("outage: refused, reset, timed out, host not found by code", ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "57P01", "53300"].every((code) => isDatabaseUnavailable(mk({ code }))));
t("outage: Prisma connection codes", ["P1001", "P1002", "P1008", "P1017", "P2024"].every((code) => isDatabaseUnavailable(mk({ code }))) && isDatabaseUnavailable(mk({ name: "PrismaClientInitializationError" })));
t("outage: driver wording", ["Connection terminated unexpectedly", "timeout exceeded when trying to connect", "Can't reach database server at host:5432", "terminating connection due to administrator command", "the database system is starting up"].every((m) => isDatabaseUnavailable(new Error(m))));
t("outage: found through a cause chain and an aggregate", isDatabaseUnavailable(new Error("query failed", { cause: mk({ code: "ECONNREFUSED" }) })) && isDatabaseUnavailable(Object.assign(new Error("agg"), { errors: [mk({ code: "ECONNREFUSED" })] })));
t("outage: ordinary failures are NOT mistaken for an outage", !isDatabaseUnavailable(new Error("Something else")) && !isDatabaseUnavailable(mk({ code: "P2002" })) && !isDatabaseUnavailable(mk({ code: "23505" })) && !isDatabaseUnavailable(null) && !isDatabaseUnavailable("ECONNREFUSED") && !isDatabaseUnavailable(undefined));
t("outage: a cyclic cause chain terminates", (() => { const a: Error & { cause?: unknown } = new Error("a"); a.cause = a; return isDatabaseUnavailable(a) === false; })());
{
  const r = toErrorResponse(mk({ code: "ECONNREFUSED" }, "connect ECONNREFUSED 10.1.2.3:5432 postgresql://u:hunter2@db.internal:5432/postgres"), new Request("http://x/api/platform/monitoring", { headers: { "x-request-id": "req-77" } }));
  const body = await r.json() as { error: { code: string; message: string; requestId: string } }; const text = JSON.stringify(body);
  t("outage: the API answers 503 DATABASE_UNAVAILABLE with a retry hint and the request id", r.status === 503 && body.error.code === "DATABASE_UNAVAILABLE" && r.headers.get("retry-after") === "5" && body.error.requestId === "req-77");
  t("outage: the response reveals no host, port, credential, driver wording or detail", !/hunter2|10\.1\.2\.3|5432|postgres|ECONNREFUSED|db\.internal/i.test(text), text);
}
{
  resetMonitorStore(); setEventWriter(async () => undefined);
  const pii = Object.assign(new Error("Invalid `prisma.student.update()` invocation: value 'ravi.kumar@college.edu' for phone 9876543210 of student Ravi Kumar"), { name: "PrismaClientUnknownRequestError" });
  const res = toErrorResponse(pii, new Request("http://x/api/students/1", { method: "PUT", headers: { "x-request-id": "req-pii" } }));
  const stored = JSON.stringify(listErrors({ page: 1, pageSize: 10 }).items), shown = JSON.stringify(await res.json());
  t("sensitive data: a database error quoting a student's address, number and name is stored and shown without any of them", res.status === 500 && !/ravi|kumar|9876543210|college\.edu/i.test(stored + shown) && /database error \(details withheld\)/.test(stored), stored.slice(0, 200));
  setEventWriter(null); resetMonitorStore();
}
t("outage: a non-database failure is still a generic 500", toErrorResponse(new Error("bug"), new Request("http://x/api/a")).status === 500);

// ---------------- job list query ----------------
t("jobs query: registered jobs only, bounded paging, strict", jobsQuery.safeParse({ job: "/api/blocking/evaluate", page: "2", pageSize: "50" }).success && !jobsQuery.safeParse({ job: "/api/other" }).success && !jobsQuery.safeParse({ pageSize: "101" }).success && !jobsQuery.safeParse({ page: "0" }).success && !jobsQuery.safeParse({ extra: "1" }).success && !jobsQuery.safeParse({ outcome: "weird" }).success);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);

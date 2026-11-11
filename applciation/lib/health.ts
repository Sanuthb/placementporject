import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { checkEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aiStats, errorCounts, scrub, startedAt } from "@/lib/monitorStore";
import { scheduledJobs } from "@/lib/cronMeta";
import { judgeJob, loadJobHistory, noHistory, type JobHistory, type JobState } from "@/lib/jobHistory";
import { durableErrorCounts } from "@/lib/monitorEvents";
import { loadAiHealth, type AiHealthCfg } from "@/lib/aiHealth";

/**
 * Platform health. One honest status per dependency, each with the evidence behind it.
 *  healthy       a live, bounded check just succeeded within its limits
 *  degraded      the check worked but something is wrong or slow (stated in the evidence)
 *  unavailable   the check ran and failed or timed out
 *  unknown       there is no reliable evidence either way (for example, no run history is recorded)
 *  not_configured the integration is not set up (or deliberately switched to dry-run). It is NEVER reported as healthy.
 * A successful HTTP response from this app proves only that the app answers; every dependency is checked on its own.
 */
export type Status = "healthy" | "degraded" | "unavailable" | "unknown" | "not_configured";
export type Component = { key: string; label: string; status: Status; checkedAt: string; summary: string; evidence: string[]; latencyMs: number | null; details?: Record<string, unknown> };

export const LIMITS = { dbMs: 2000, storageMs: 3000, aiMs: 4000, smtpMs: 4000, queryMs: 2000, dbSlowMs: 500, storageSlowMs: 1500, aiSlowMs: 3000, smtpSlowMs: 2000 } as const;
export const CACHE_MS = 15_000, FORCE_GAP_MS = 5_000;

export class Timeout extends Error { constructor(ms: number) { super(`no answer within ${ms} ms`); } }
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Timeout(ms)), ms); })]).finally(() => clearTimeout(t)) as Promise<T>;
}
const msSince = (t0: number) => Math.round(performance.now() - t0);

// ---------- classification (pure: every rule is unit-tested) ----------
type Probe = { ok: boolean; ms: number | null; timedOut?: boolean; error?: string };
const base = (key: string, label: string, now: Date) => ({ key, label, checkedAt: now.toISOString() });

export function classifyDatabase(p: Probe, now = new Date()): Component {
  const b = base("database", "Database", now);
  if (p.ok && (p.ms ?? 0) >= LIMITS.dbSlowMs) return { ...b, status: "degraded", latencyMs: p.ms, summary: "The database answers, but slowly", evidence: [`A trivial query took ${p.ms} ms (slow above ${LIMITS.dbSlowMs} ms)`] };
  if (p.ok) return { ...b, status: "healthy", latencyMs: p.ms, summary: "The database answers", evidence: [`A trivial query succeeded in ${p.ms} ms`] };
  return { ...b, status: "unavailable", latencyMs: p.ms, summary: p.timedOut ? "The database did not answer in time" : "The database query failed", evidence: [p.timedOut ? `No answer within ${LIMITS.dbMs} ms` : `Query failed: ${scrub(p.error ?? "unknown error")}`] };
}
export function classifyStorage(i: { configured: boolean; probe?: Probe; buckets?: string[]; expected: string[] }, now = new Date()): Component {
  const b = base("storage", "File storage", now);
  if (!i.configured) return { ...b, status: "not_configured", latencyMs: null, summary: "File storage is not configured", evidence: ["SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set"] };
  const p = i.probe!;
  if (!p.ok) return { ...b, status: "unavailable", latencyMs: p.ms, summary: p.timedOut ? "Storage did not answer in time" : "Storage could not be reached", evidence: [p.timedOut ? `No answer within ${LIMITS.storageMs} ms` : `Request failed: ${scrub(p.error ?? "unknown error")}`] };
  const missing = i.expected.filter((x) => !(i.buckets ?? []).includes(x));
  if (missing.length) return { ...b, status: "degraded", latencyMs: p.ms, summary: "Storage answers, but a required bucket is missing", evidence: [`Listing buckets succeeded in ${p.ms} ms`, `Missing: ${missing.join(", ")}`] };
  if ((p.ms ?? 0) >= LIMITS.storageSlowMs) return { ...b, status: "degraded", latencyMs: p.ms, summary: "Storage answers, but slowly", evidence: [`Listing buckets took ${p.ms} ms (slow above ${LIMITS.storageSlowMs} ms)`] };
  return { ...b, status: "healthy", latencyMs: p.ms, summary: "Storage answers and the required bucket exists", evidence: [`Listing buckets succeeded in ${p.ms} ms`, `Required buckets present: ${i.expected.join(", ")}`, "Only a bucket listing is checked: no file is read, written or linked"] };
}
export type AiStats = ReturnType<typeof aiStats>;
/** Extra facts about the AI configuration and usage, appended to what the provider check found. A problem here lowers a healthy provider to "degraded" at most. */
function aiExtras(cfg: AiHealthCfg | null | undefined): { evidence: string[]; warn: string | null; details: Record<string, unknown> } {
  if (!cfg) return { evidence: [], warn: null, details: {} };
  const ev: string[] = []; let warn: string | null = null;
  const bad = cfg.purposes.filter((p) => p.error);
  if (bad.length) { warn = "An AI key or its configuration could not be read"; ev.push(...bad.map((p) => `${p.purpose}: ${p.error === "AI_KEY_UNREADABLE" ? "the stored key cannot be decrypted (check the master key)" : "the configuration could not be read"}`)); }
  if (cfg.purposes.some((p) => p.stale)) { warn ??= "The AI configuration could not be read from the database; the last known one is in use"; ev.push("AI configuration: database unreadable, using the last known configuration"); }
  const off = cfg.purposes.filter((p) => !p.enabled && !p.error);
  if (off.length) ev.push(`Switched off: ${off.map((p) => `${p.purpose}${p.disabledBy === "global" ? " (global switch)" : ""}`).join(", ")}`);
  for (const pr of Object.values(cfg.probes)) if (pr && !pr.ok) { warn ??= `The ${pr.provider} provider check failed (${pr.reason})`; ev.push(`${pr.provider} model-list check: ${pr.reason}`); }
  if (cfg.usage.available) { ev.push(`Today: ${cfg.usage.callsToday} AI call(s), ${cfg.usage.failuresToday} failed, ${cfg.usage.blockedToday} refused by a daily limit`); for (const n of cfg.usage.nearLimit) ev.push(`Limit nearly reached: ${n.scope} at ${n.used} of ${n.limit}`); }
  else ev.push("Today's AI usage could not be read");
  return { evidence: ev, warn, details: { ai: cfg } };
}
export function classifyAi(i: { configured: boolean; httpStatus?: number | null; probe?: Probe; stats: AiStats; cfg?: AiHealthCfg | null }, now = new Date()): Component {
  const c = classifyAiBase(i, now), x = aiExtras(i.cfg);
  const globalOff = !!i.cfg && i.cfg.purposes.length > 0 && i.cfg.purposes.every((p) => !p.enabled && p.disabledBy === "global");
  if (globalOff) return { ...c, status: "not_configured", latencyMs: null, summary: "AI is switched off by a platform administrator", evidence: ["The global AI switch is off: no AI feature is running", ...x.evidence], details: { ...(c.details ?? {}), ...x.details } };
  let status = c.status, summary = c.summary;
  if (x.warn && status === "healthy") { status = "degraded"; summary = x.warn; }
  return { ...c, status, summary, evidence: [...c.evidence, ...x.evidence], details: { ...(c.details ?? {}), ...x.details } };
}
function classifyAiBase(i: { configured: boolean; httpStatus?: number | null; probe?: Probe; stats: AiStats }, now = new Date()): Component {
  const b = base("ai", "AI provider", now); const s = i.stats;
  const recent = `This instance, last ${s.windowMinutes} min: ${s.calls} call(s), ${s.failures} failed, ${s.timeouts} timed out${s.avgLatencyMs !== null ? `, average ${s.avgLatencyMs} ms` : ""}`;
  if (!i.configured) return { ...b, status: "not_configured", latencyMs: null, summary: "No AI provider key is configured", evidence: ["GROQ_API_KEY is not set", "AI features return 'not switched on'"], details: { stats: s } };
  const p = i.probe!;
  if (!p.ok) return { ...b, status: "unavailable", latencyMs: p.ms, summary: p.timedOut ? "The AI provider did not answer in time" : "The AI provider could not be reached", evidence: [p.timedOut ? `No answer within ${LIMITS.aiMs} ms` : `Request failed: ${scrub(p.error ?? "unknown error")}`, recent], details: { stats: s } };
  const h = i.httpStatus ?? 0;
  if (h === 401 || h === 403) return { ...b, status: "unavailable", latencyMs: p.ms, summary: "The AI provider refused the configured key", evidence: [`The provider answered HTTP ${h}`, "Check the key in the server settings"], details: { stats: s } };
  if (h === 429) return { ...b, status: "degraded", latencyMs: p.ms, summary: "The AI provider is rate-limiting requests", evidence: ["The provider answered HTTP 429", recent], details: { stats: s } };
  if (h >= 500 || h === 0) return { ...b, status: "unavailable", latencyMs: p.ms, summary: "The AI provider reported a server error", evidence: [`The provider answered HTTP ${h}`, recent], details: { stats: s } };
  if (h >= 400) return { ...b, status: "degraded", latencyMs: p.ms, summary: "The AI provider answered with an unexpected status", evidence: [`The provider answered HTTP ${h}`, recent], details: { stats: s } };
  if (s.calls >= 5 && s.failures / s.calls >= 0.5) return { ...b, status: "degraded", latencyMs: p.ms, summary: "The provider answers, but most real requests recently failed", evidence: [`Provider check succeeded in ${p.ms} ms`, recent], details: { stats: s } };
  if ((p.ms ?? 0) >= LIMITS.aiSlowMs) return { ...b, status: "degraded", latencyMs: p.ms, summary: "The AI provider answers, but slowly", evidence: [`Provider check took ${p.ms} ms (slow above ${LIMITS.aiSlowMs} ms)`, recent], details: { stats: s } };
  return { ...b, status: "healthy", latencyMs: p.ms, summary: "The AI provider accepts the configured key", evidence: [`Authenticated model-list request succeeded in ${p.ms} ms (no tokens are used)`, recent], details: { stats: s } };
}
export type EmailHistory = { sent24h: number; failed24h: number; lastSentAt: string | null; lastFailureAt: string | null; lastFailure: string | null; available: boolean };
export function classifyEmail(i: { configured: boolean; dryRun: boolean; probe?: Probe; history?: EmailHistory }, now = new Date()): Component {
  const b = base("email", "Email (SMTP)", now);
  const h = i.history; const hist = h?.available ? [`Last 24 h: ${h.sent24h} sent, ${h.failed24h} failed`, h.lastSentAt ? `Last successful delivery: ${h.lastSentAt}` : "No successful delivery recorded in the last 30 days", ...(h.lastFailureAt ? [`Last failure: ${h.lastFailureAt} (${h.lastFailure})`] : [])] : ["Delivery history could not be read"];
  if (i.dryRun) return { ...b, status: "not_configured", latencyMs: null, summary: "Email is in dry-run mode: messages are built but not sent", evidence: ["SMTP_DRY_RUN=true"], details: { history: h } };
  if (!i.configured) return { ...b, status: "not_configured", latencyMs: null, summary: "SMTP is not configured", evidence: ["SMTP_HOST, SMTP_USER or SMTP_PASS is not set"], details: { history: h } };
  const p = i.probe!;
  if (!p.ok) return { ...b, status: "unavailable", latencyMs: p.ms, summary: p.timedOut ? "The mail server did not answer in time" : "The mail server could not be reached or refused the login", evidence: [p.timedOut ? `No answer within ${LIMITS.smtpMs} ms` : `Connection check failed: ${scrub(p.error ?? "unknown error")}`, ...hist], details: { history: h } };
  const total = (h?.sent24h ?? 0) + (h?.failed24h ?? 0);
  if (h?.available && total >= 3 && (h.failed24h / total) >= 0.5) return { ...b, status: "degraded", latencyMs: p.ms, summary: "The mail server accepts connections, but most recent deliveries failed", evidence: [`Connection and login check succeeded in ${p.ms} ms`, ...hist], details: { history: h } };
  if ((p.ms ?? 0) >= LIMITS.smtpSlowMs) return { ...b, status: "degraded", latencyMs: p.ms, summary: "The mail server answers, but slowly", evidence: [`Connection check took ${p.ms} ms (slow above ${LIMITS.smtpSlowMs} ms)`, ...hist], details: { history: h } };
  return { ...b, status: "healthy", latencyMs: p.ms, summary: "The mail server accepts a connection and login", evidence: [`Connection and login check succeeded in ${p.ms} ms (no message is sent)`, ...hist], details: { history: h } };
}
export type JobRow = { path: string; schedule: string; description: string; nextDueAt: string | null };
const STATE_TEXT: Record<JobState, string> = { succeeded: "last run succeeded", failed: "last run failed", running: "running now", interrupted: "last run started but never finished", overdue: "the expected run did not happen", no_run_recorded: "no run recorded yet" };
export function classifyScheduledJobs(i: { cronSecret: boolean; jobs: JobRow[]; history?: JobHistory | null }, now = new Date()): Component {
  const b = base("scheduledJobs", "Scheduled jobs", now);
  const h = i.history ?? null;
  const rows = i.jobs.map((j) => {
    const latest = h?.available ? h.latest[j.path] : undefined, ok = h?.available ? h.lastSuccess[j.path] : undefined, bad = h?.available ? h.lastFailure[j.path] : undefined;
    const state: JobState | null = h?.available ? judgeJob({ schedule: j.schedule, latest, since: h.since, now }) : null;
    return {
      ...j, state, history: (h?.available ? "recorded" : h ? "unavailable" : "not recorded") as "recorded" | "unavailable" | "not recorded",
      lastRunAt: latest?.lastStartedAt ?? null, lastSuccessAt: ok?.finishedAt ?? null, lastFailure: bad?.error ?? null, lastFailureAt: bad?.finishedAt ?? null,
      durationMs: latest?.durationMs ?? null, lastRunOk: latest?.ok ?? null, attempts: latest?.attempts ?? null, failedAttempts: latest?.failedAttempts ?? null, summary: latest?.summary ?? null,
    };
  });
  const jobs = rows;
  if (!jobs.length) return { ...b, status: "not_configured", latencyMs: null, summary: "No scheduled jobs are registered", evidence: ["vercel.json lists no cron entries"], details: { jobs } };
  if (!i.cronSecret) return { ...b, status: "not_configured", latencyMs: null, summary: "Jobs are registered, but CRON_SECRET is not set, so a scheduler cannot trigger them", evidence: [`${jobs.length} job(s) in vercel.json`, "CRON_SECRET is not set"], details: { jobs } };
  if (!h?.available) return { ...b, status: "unknown", latencyMs: null, summary: h ? "Jobs are registered, but their run history could not be read, so a run cannot be confirmed" : "Jobs are registered, but the application records no execution history, so a run cannot be confirmed", evidence: [`${jobs.length} job(s) registered in vercel.json`, h ? "The run history could not be read (database unavailable or the table is missing)" : "No run history was provided"], details: { jobs } };
  const count = (st: JobState) => rows.filter((r) => r.state === st).length;
  const failed = count("failed"), overdue = count("overdue"), interrupted = count("interrupted"), none = count("no_run_recorded"), unhealthy = failed + overdue + interrupted;
  const lines = rows.filter((r) => r.state !== "succeeded").map((r) => `${r.description}: ${STATE_TEXT[r.state!]}${r.state === "failed" && r.lastFailure ? ` (${r.lastFailure})` : ""}`);
  const ev = [`${jobs.length} job(s) registered; history kept for 90 days${h.since ? `, recorded since ${h.since}` : ""}`, ...lines.slice(0, 8)];
  if (unhealthy === jobs.length) return { ...b, status: "unavailable", latencyMs: null, summary: "Every scheduled job has failed, was interrupted or missed its run", evidence: ev, details: { jobs } };
  if (unhealthy > 0) return { ...b, status: "degraded", latencyMs: null, summary: `${unhealthy} of ${jobs.length} scheduled job(s) need attention (${[failed && `${failed} failed`, overdue && `${overdue} overdue`, interrupted && `${interrupted} interrupted`].filter(Boolean).join(", ")})`, evidence: ev, details: { jobs } };
  if (none > 0) return { ...b, status: "unknown", latencyMs: null, summary: `${none} of ${jobs.length} job(s) have no recorded run yet, so they cannot be confirmed`, evidence: ev, details: { jobs } };
  return { ...b, status: "healthy", latencyMs: null, summary: `All ${jobs.length} scheduled jobs ran and their latest run succeeded`, evidence: ev, details: { jobs } };
}
export type ImportCounts = { available: boolean; preview: number; processing: number; completed7d: number; stuck: number };
export function classifyBackground(i: ImportCounts, now = new Date()): Component {
  const b = base("backgroundJobs", "Background jobs", now);
  const note = "The application has no general job queue: no retry counts and no worker states exist. Only bulk student imports have a persisted state, shown here.";
  if (!i.available) return { ...b, status: "unknown", latencyMs: null, summary: "Import job states could not be read", evidence: [note], details: { imports: i } };
  if (i.stuck > 0) return { ...b, status: "degraded", latencyMs: null, summary: `${i.stuck} bulk import(s) have been processing for over 15 minutes`, evidence: [`Pending preview: ${i.preview}, processing: ${i.processing}, completed in 7 days: ${i.completed7d}`, note], details: { imports: i } };
  return { ...b, status: "healthy", latencyMs: null, summary: "No bulk import is stuck", evidence: [`Pending preview: ${i.preview}, processing: ${i.processing}, completed in 7 days: ${i.completed7d}`, note], details: { imports: i } };
}
export function classifyErrors(c: ReturnType<typeof errorCounts>, started: Date, now = new Date(), durable = false): Component {
  const b = base("errors", "Server errors", now);
  const since = durable ? "Counted from the durable error record: all server instances, kept for 14 days" : `Counted since this server instance started (${started.toISOString()}); not durable and not shared between instances (the durable record could not be read)`;
  const bd = [...(c.byStatusLastHour?.length ? [`By status (last hour): ${c.byStatusLastHour.map((x) => `${x.key} ×${x.count}`).join(", ")}`] : []), ...(c.byRouteLastHour?.length ? [`By endpoint (last hour): ${c.byRouteLastHour.map((x) => `${x.key} ×${x.count}`).join(", ")}`] : [])];
  if (c.last15Minutes >= 20) return { ...b, status: "unavailable", latencyMs: null, summary: `${c.last15Minutes} server errors in the last 15 minutes`, evidence: [since, ...bd], details: { counts: c } };
  if (c.last15Minutes >= 1) return { ...b, status: "degraded", latencyMs: null, summary: `${c.last15Minutes} server error(s) in the last 15 minutes`, evidence: [since, ...bd], details: { counts: c } };
  return { ...b, status: "healthy", latencyMs: null, summary: c.lastHour ? `No server errors in the last 15 minutes (${c.lastHour} in the last hour)` : "No server errors recorded recently", evidence: [since, ...bd], details: { counts: c } };
}
export type AppInfo = { buildId: string | null; commit: string | null; node: string; mode: string; uptimeSeconds: number; startedAt: string };
export function classifyApp(i: { envErrors: string[]; envWarnings: string[]; info: AppInfo }, now = new Date()): Component {
  const b = base("application", "Application", now);
  const ev = ["This response was produced by the running process (liveness only)", `Mode ${i.info.mode}, up ${i.info.uptimeSeconds} s`];
  if (i.envErrors.length) return { ...b, status: "degraded", latencyMs: null, summary: "The application runs with invalid configuration", evidence: [...ev, ...i.envErrors.map((e) => scrub(e))], details: { info: i.info } };
  if (i.envWarnings.length) return { ...b, status: "degraded", latencyMs: null, summary: `The application runs, with ${i.envWarnings.length} configuration warning(s)`, evidence: [...ev, ...i.envWarnings.map((e) => scrub(e))], details: { info: i.info } };
  return { ...b, status: "healthy", latencyMs: null, summary: "The application process is running with valid configuration", evidence: ev, details: { info: i.info } };
}
const CORE = new Set(["application", "database", "storage"]);
/** Overall = worst core component. A non-core component that is down or degraded makes the platform degraded, never unavailable. Unknown / not configured are listed but never counted as healthy. */
export function overall(cs: Component[]): { status: Status; counts: Record<Status, number>; notes: string[] } {
  const counts: Record<Status, number> = { healthy: 0, degraded: 0, unavailable: 0, unknown: 0, not_configured: 0 };
  for (const c of cs) counts[c.status]++;
  const core = cs.filter((c) => CORE.has(c.key)), rest = cs.filter((c) => !CORE.has(c.key));
  let status: Status;
  if (core.some((c) => c.status === "unavailable")) status = "unavailable";
  else if (core.some((c) => c.status === "degraded") || rest.some((c) => c.status === "unavailable" || c.status === "degraded")) status = "degraded";
  else if (core.some((c) => c.status === "unknown" || c.status === "not_configured")) status = "unknown";
  else status = "healthy";
  const notes: string[] = [];
  if (counts.unknown) notes.push(`${counts.unknown} component(s) cannot be confirmed`);
  if (counts.not_configured) notes.push(`${counts.not_configured} component(s) not configured`);
  return { status, counts, notes };
}

// ---------- live checks (real dependencies by default; replaceable in tests) ----------
export type Deps = {
  env: NodeJS.ProcessEnv; now: () => Date;
  dbPing: () => Promise<void>; listBuckets: () => Promise<string[]>; aiProbe: (key: string, baseUrl: string) => Promise<number>; smtpVerify: (cfg: SmtpCfg) => Promise<void>;
  emailHistory: () => Promise<EmailHistory>; importCounts: () => Promise<ImportCounts>;
  /** Optional so older mocks keep working: absent means "no history / no durable record available". */
  jobHistory?: () => Promise<JobHistory>; durableErrors?: () => Promise<ReturnType<typeof errorCounts>>;
  /** Optional: the effective AI configuration (database first). Absent means the environment key alone is used, as before. */
  aiConfig?: () => Promise<AiHealthCfg>;
};
export type SmtpCfg = { host: string; port: number; user: string; pass: string };
export const EXPECTED_BUCKETS = ["student-documents"];
export const aiBase = (env: NodeJS.ProcessEnv = process.env) => env.GROQ_API_BASE?.trim() || "https://api.groq.com/openai/v1";

export const realDeps: Deps = {
  env: process.env, now: () => new Date(),
  dbPing: async () => { await db.$queryRaw`select 1`; },
  listBuckets: async () => { const { data, error } = await supabaseAdmin().storage.listBuckets(); if (error) throw new Error(error.message); return (data ?? []).map((x) => x.name); },
  aiProbe: async (key, baseUrl) => { const r = await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(LIMITS.aiMs) }); await r.body?.cancel().catch(() => undefined); return r.status; },
  smtpVerify: async (c) => { const t = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass }, connectionTimeout: LIMITS.smtpMs, greetingTimeout: LIMITS.smtpMs, socketTimeout: LIMITS.smtpMs }); try { await t.verify(); } finally { t.close(); } },
  emailHistory: async () => {
    const [r] = await db.$queryRaw<{ sent: number; failed: number; last_sent: Date | null; last_fail_at: Date | null; last_fail: string | null }[]>`
      with ev as (
        select status::text as status, "createdAt" as at, "sentAt" as sent_at, error from "InvitationEmailLog" where "createdAt" > now() - interval '30 days'
        union all select status::text, "createdAt", case when status::text = 'SENT' then "createdAt" end, error from "MessageLog" where "createdAt" > now() - interval '30 days')
      select (count(*) filter (where status = 'SENT' and at > now() - interval '24 hours'))::int as sent, (count(*) filter (where status = 'FAILED' and at > now() - interval '24 hours'))::int as failed,
             max(coalesce(sent_at, at)) filter (where status = 'SENT') as last_sent, max(at) filter (where status = 'FAILED') as last_fail_at,
             (array_agg(error order by at desc) filter (where status = 'FAILED'))[1] as last_fail from ev`;
    return { available: true, sent24h: Number(r.sent), failed24h: Number(r.failed), lastSentAt: r.last_sent?.toISOString() ?? null, lastFailureAt: r.last_fail_at?.toISOString() ?? null, lastFailure: r.last_fail ? scrub(r.last_fail) : null };
  },
  jobHistory: () => loadJobHistory(), durableErrors: () => durableErrorCounts(), aiConfig: () => loadAiHealth(),
  importCounts: async () => {
    const [r] = await db.$queryRaw<{ preview: number; processing: number; completed: number; stuck: number }[]>`
      select (count(*) filter (where status = 'PREVIEW'))::int as preview, (count(*) filter (where status = 'PROCESSING'))::int as processing,
             (count(*) filter (where status = 'COMPLETED' and "completedAt" > now() - interval '7 days'))::int as completed,
             (count(*) filter (where status = 'PROCESSING' and "createdAt" < now() - interval '15 minutes'))::int as stuck
      from "ImportJob" where "createdAt" > now() - interval '30 days'`;
    return { available: true, preview: Number(r.preview), processing: Number(r.processing), completed7d: Number(r.completed), stuck: Number(r.stuck) };
  },
};

/** A timeout can come from our own limit, from fetch's abort signal, or from a library's socket timer; all of them mean "no answer in time". */
export const isTimeout = (e: unknown) => e instanceof Timeout || ["TimeoutError", "AbortError"].includes((e as Error)?.name) || ["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes((e as { code?: string })?.code ?? "") || /timed? ?out|timeout|never received/i.test((e as Error)?.message ?? "");
async function timed(fn: () => Promise<void>, limit: number): Promise<Probe> {
  const t0 = performance.now();
  try { await withTimeout(fn(), limit); return { ok: true, ms: msSince(t0) }; } catch (e) { return { ok: false, ms: msSince(t0), timedOut: isTimeout(e), error: e instanceof Error ? e.message : String(e) }; }
}
export function appInfo(): AppInfo {
  let buildId: string | null = null; try { buildId = readFileSync(`${process.cwd()}/.next/BUILD_ID`, "utf8").trim().slice(0, 40); } catch { /* not a production build */ }
  return { buildId, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null, node: process.version, mode: process.env.NODE_ENV ?? "unknown", uptimeSeconds: Math.round(process.uptime()), startedAt: startedAt().toISOString() };
}

/** The Groq model-list check made while loading the AI configuration, expressed as the probe and HTTP status the classifier already understands (its duration is the real one). */
function fromAiProbe(pr: NonNullable<AiHealthCfg["probes"]["GROQ"]>, holder: { aiStatus: number | null }): Probe {
  holder.aiStatus = pr.reason === "ok" ? 200 : pr.reason === "unauthorized" ? 401 : pr.reason === "rate_limited" ? 429 : pr.reason === "error" ? 400 : null;
  return pr.reason === "timeout" ? { ok: false, ms: pr.ms, timedOut: true } : pr.reason === "unavailable" ? { ok: false, ms: pr.ms, error: "provider unavailable" } : { ok: true, ms: pr.ms };
}

/** Runs every check once, in parallel, each with its own limit. Never throws: a failing check becomes that component's status. */
export async function runChecks(d: Deps = realDeps): Promise<{ checkedAt: string; overall: ReturnType<typeof overall>; components: Component[] }> {
  const now = d.now(); const env = d.env;
  const storageCfg = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  const dry = env.SMTP_DRY_RUN === "true";
  const aiCfg = d.aiConfig ? await withTimeout(d.aiConfig(), LIMITS.aiMs + 2000).catch(() => null) : null;
  // With a resolved configuration the TEXT purpose decides whether a Groq key is in use; without one the environment key alone is used, as before.
  const textP = aiCfg?.purposes.find((p) => p.purpose === "TEXT");
  const aiKey = aiCfg ? (textP && textP.enabled && !textP.error && textP.configured ? "resolved" : undefined) : env.GROQ_API_KEY?.trim();
  const smtpCfg = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  const holder: { aiStatus: number | null } = { aiStatus: null };
  const [db_, st, ai, sm, em, im, jh, de] = await Promise.all([
    timed(d.dbPing, LIMITS.dbMs),
    storageCfg ? (async () => { let buckets: string[] = []; const p = await timed(async () => { buckets = await d.listBuckets(); }, LIMITS.storageMs); return { p, buckets }; })() : Promise.resolve(null),
    aiCfg ? Promise.resolve(aiCfg.probes.GROQ ? fromAiProbe(aiCfg.probes.GROQ, holder) : null) : aiKey ? timed(async () => { holder.aiStatus = await d.aiProbe(aiKey, aiBase(env)); }, LIMITS.aiMs) : Promise.resolve(null),
    !dry && smtpCfg ? timed(() => d.smtpVerify({ host: env.SMTP_HOST!, port: Number(env.SMTP_PORT ?? 465), user: env.SMTP_USER!, pass: env.SMTP_PASS!.replace(/\s+/g, "") }), LIMITS.smtpMs) : Promise.resolve(null),
    withTimeout(d.emailHistory(), LIMITS.queryMs).catch((): EmailHistory => ({ available: false, sent24h: 0, failed24h: 0, lastSentAt: null, lastFailureAt: null, lastFailure: null })),
    withTimeout(d.importCounts(), LIMITS.queryMs).catch((): ImportCounts => ({ available: false, preview: 0, processing: 0, completed7d: 0, stuck: 0 })),
    d.jobHistory ? withTimeout(d.jobHistory(), LIMITS.queryMs).catch((): JobHistory => noHistory()) : Promise.resolve<JobHistory | null>(null),
    d.durableErrors ? withTimeout(d.durableErrors(), LIMITS.queryMs).catch(() => null) : Promise.resolve(null),
  ]);
  const env2 = checkEnv(env);
  const components: Component[] = [
    classifyApp({ envErrors: env2.errors, envWarnings: env2.warnings, info: appInfo() }, now),
    classifyDatabase(db_, now),
    classifyStorage({ configured: storageCfg, probe: st?.p, buckets: st?.buckets, expected: EXPECTED_BUCKETS }, now),
    classifyAi({ configured: !!aiKey, probe: ai ?? undefined, httpStatus: holder.aiStatus, stats: aiStats(), cfg: aiCfg }, now),
    classifyEmail({ configured: smtpCfg, dryRun: dry, probe: sm ?? undefined, history: em }, now),
    classifyScheduledJobs({ cronSecret: !!env.CRON_SECRET, jobs: scheduledJobs(now), history: jh }, now),
    classifyBackground(im, now),
    de ? classifyErrors(de, startedAt(), now, true) : classifyErrors(errorCounts(now.getTime()), startedAt(), now),
  ];
  return { checkedAt: now.toISOString(), overall: overall(components), components };
}

// ---------- throttling: repeated requests share one check ----------
type Cached = Awaited<ReturnType<typeof runChecks>>;
const g = globalThis as unknown as { __health?: { at: number; data: Cached | null; inflight: Promise<Cached> | null; lastForced: number } };
const st = () => (g.__health ??= { at: 0, data: null, inflight: null, lastForced: 0 });
/** At most one check runs at a time and results are reused for 15 s. A forced refresh is honoured at most once every 5 s; faster requests get the current result and `throttled: true`. */
export async function getHealth(opts: { refresh?: boolean; deps?: Deps; nowMs?: number } = {}): Promise<Cached & { cached: boolean; throttled: boolean; ageMs: number }> {
  const s = st(); const nowMs = opts.nowMs ?? Date.now();
  let throttled = false;
  const fresh = s.data && nowMs - s.at < CACHE_MS;
  const forceOk = !!opts.refresh && nowMs - s.lastForced >= FORCE_GAP_MS;
  if (opts.refresh && !forceOk) throttled = true;
  if (fresh && !forceOk) return { ...s.data!, cached: true, throttled, ageMs: nowMs - s.at };
  if (s.inflight) { const data = await s.inflight; return { ...data, cached: true, throttled, ageMs: 0 }; }
  if (forceOk) s.lastForced = nowMs;
  s.inflight = runChecks(opts.deps).finally(() => { s.inflight = null; });
  const data = await s.inflight; s.data = data; s.at = nowMs;
  return { ...data, cached: false, throttled, ageMs: 0 };
}
export const resetHealthCache = () => { delete g.__health; };

/** Liveness: the process answers. Touches no dependency. */
export const liveness = () => ({ status: "alive" as const });
let ready: { at: number; ok: boolean } | null = null;
/** Readiness: can this instance serve requests, i.e. does the database answer within 2 s? One query at most every 5 s; the answer is cached and carries no detail. */
export async function readiness(pingDb: () => Promise<void> = realDeps.dbPing, nowMs = Date.now()) {
  if (ready && nowMs - ready.at < 5000) return ready.ok;
  const p = await timed(pingDb, LIMITS.dbMs); ready = { at: nowMs, ok: p.ok };
  return p.ok;
}
export const resetReadiness = () => { ready = null; };

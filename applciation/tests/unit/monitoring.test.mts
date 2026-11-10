// Unit tests: health classification, roll-up, scrubbing, bounded error memory, cron next-run, timeouts, throttling, and runChecks with mocked dependencies.
// No network, no database, no real SMTP, no real AI provider.
import { isTimeout, classifyDatabase, classifyStorage, classifyAi, classifyEmail, classifyScheduledJobs, classifyBackground, classifyErrors, classifyApp, overall, withTimeout, Timeout, runChecks, getHealth, resetHealthCache, readiness, resetReadiness, LIMITS, CACHE_MS, FORCE_GAP_MS, type Deps, type Component, type EmailHistory } from "../../lib/health";
import { scrub, scrubPath, recordError, listErrors, errorCounts, recordAiCall, aiStats, resetMonitorStore } from "../../lib/monitorStore";
import { nextRun, scheduledJobs } from "../../lib/cronMeta";
import { errorsQuery as eq, summaryQuery as sq, SERVICES } from "../../lib/monitorQuery";
let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const NOW = new Date("2026-03-10T12:00:00Z");
const S = (c: Component) => c.status;

// ---- database
t("db: fast success is healthy", S(classifyDatabase({ ok: true, ms: 12 })) === "healthy");
t("db: slow success is degraded", S(classifyDatabase({ ok: true, ms: LIMITS.dbSlowMs })) === "degraded" && S(classifyDatabase({ ok: true, ms: LIMITS.dbSlowMs - 1 })) === "healthy");
t("db: failure is unavailable", S(classifyDatabase({ ok: false, ms: 5, error: "ECONNREFUSED" })) === "unavailable");
t("db: timeout is unavailable and says so", (() => { const c = classifyDatabase({ ok: false, ms: 2000, timedOut: true }); return c.status === "unavailable" && /in time/.test(c.summary); })());
t("db: a connection string in the error is scrubbed", !JSON.stringify(classifyDatabase({ ok: false, ms: 1, error: "connect failed postgresql://postgres:hunter2@db.example.com:5432/postgres" })).includes("hunter2"));
// ---- storage
const ST = { expected: ["student-documents"] };
t("storage: not configured is never healthy", S(classifyStorage({ ...ST, configured: false })) === "not_configured");
t("storage: ok with the bucket is healthy", S(classifyStorage({ ...ST, configured: true, probe: { ok: true, ms: 30 }, buckets: ["student-documents", "x"] })) === "healthy");
t("storage: missing bucket is degraded and names it", (() => { const c = classifyStorage({ ...ST, configured: true, probe: { ok: true, ms: 30 }, buckets: ["other"] }); return c.status === "degraded" && c.evidence.join().includes("student-documents"); })());
t("storage: slow is degraded", S(classifyStorage({ ...ST, configured: true, probe: { ok: true, ms: LIMITS.storageSlowMs }, buckets: ["student-documents"] })) === "degraded");
t("storage: failure and timeout are unavailable", S(classifyStorage({ ...ST, configured: true, probe: { ok: false, ms: 9, error: "x" } })) === "unavailable" && S(classifyStorage({ ...ST, configured: true, probe: { ok: false, ms: 3000, timedOut: true } })) === "unavailable");
t("storage: evidence says no file is touched", classifyStorage({ ...ST, configured: true, probe: { ok: true, ms: 5 }, buckets: ["student-documents"] }).evidence.join().includes("no file is read"));
// ---- AI
const NOSTATS = aiStats(Date.now());
t("ai: no key is not_configured, never healthy", S(classifyAi({ configured: false, stats: NOSTATS })) === "not_configured");
t("ai: 200 is healthy", S(classifyAi({ configured: true, httpStatus: 200, probe: { ok: true, ms: 120 }, stats: NOSTATS })) === "healthy");
t("ai: key refused (401/403) is unavailable", S(classifyAi({ configured: true, httpStatus: 401, probe: { ok: true, ms: 50 }, stats: NOSTATS })) === "unavailable" && S(classifyAi({ configured: true, httpStatus: 403, probe: { ok: true, ms: 50 }, stats: NOSTATS })) === "unavailable");
t("ai: 429 is degraded", S(classifyAi({ configured: true, httpStatus: 429, probe: { ok: true, ms: 50 }, stats: NOSTATS })) === "degraded");
t("ai: 5xx is unavailable", S(classifyAi({ configured: true, httpStatus: 503, probe: { ok: true, ms: 50 }, stats: NOSTATS })) === "unavailable");
t("ai: other 4xx is degraded", S(classifyAi({ configured: true, httpStatus: 404, probe: { ok: true, ms: 50 }, stats: NOSTATS })) === "degraded");
t("ai: network failure and timeout are unavailable", S(classifyAi({ configured: true, probe: { ok: false, ms: 10, error: "ECONNREFUSED" }, stats: NOSTATS })) === "unavailable" && S(classifyAi({ configured: true, probe: { ok: false, ms: 4000, timedOut: true }, stats: NOSTATS })) === "unavailable");
t("ai: slow answer is degraded", S(classifyAi({ configured: true, httpStatus: 200, probe: { ok: true, ms: LIMITS.aiSlowMs }, stats: NOSTATS })) === "degraded");
t("ai: provider fine but most real calls failed is degraded", S(classifyAi({ configured: true, httpStatus: 200, probe: { ok: true, ms: 100 }, stats: { ...NOSTATS, calls: 10, failures: 6, timeouts: 2 } })) === "degraded");
t("ai: a few failures among many calls stay healthy", S(classifyAi({ configured: true, httpStatus: 200, probe: { ok: true, ms: 100 }, stats: { ...NOSTATS, calls: 10, failures: 2, timeouts: 0 } })) === "healthy");
t("ai: evidence never carries a key", !JSON.stringify(classifyAi({ configured: true, probe: { ok: false, ms: 1, error: "request to https://api.x.com failed Bearer gsk_abcdefghijklmnop123456" }, stats: NOSTATS })).includes("gsk_abcdefghijklmnop"));
// ---- email
const H = (o: Partial<EmailHistory> = {}): EmailHistory => ({ available: true, sent24h: 4, failed24h: 0, lastSentAt: "2026-03-10T10:00:00.000Z", lastFailureAt: null, lastFailure: null, ...o });
t("email: dry-run is not_configured (not healthy)", S(classifyEmail({ configured: true, dryRun: true, history: H() })) === "not_configured");
t("email: not configured", S(classifyEmail({ configured: false, dryRun: false, history: H() })) === "not_configured");
t("email: verify ok is healthy and says no message is sent", (() => { const c = classifyEmail({ configured: true, dryRun: false, probe: { ok: true, ms: 40 }, history: H() }); return c.status === "healthy" && c.evidence.join().includes("no message is sent"); })());
t("email: connection failure is unavailable", S(classifyEmail({ configured: true, dryRun: false, probe: { ok: false, ms: 3, error: "ECONNREFUSED" }, history: H() })) === "unavailable");
t("email: timeout is unavailable", S(classifyEmail({ configured: true, dryRun: false, probe: { ok: false, ms: 4000, timedOut: true }, history: H() })) === "unavailable");
t("email: connection ok but most recent deliveries failed is degraded", S(classifyEmail({ configured: true, dryRun: false, probe: { ok: true, ms: 40 }, history: H({ sent24h: 1, failed24h: 4, lastFailureAt: "2026-03-10T11:00:00.000Z", lastFailure: "550 rejected" }) })) === "degraded");
t("email: a single failure among successes stays healthy", S(classifyEmail({ configured: true, dryRun: false, probe: { ok: true, ms: 40 }, history: H({ sent24h: 9, failed24h: 1 }) })) === "healthy");
t("email: too few deliveries to judge by history", S(classifyEmail({ configured: true, dryRun: false, probe: { ok: true, ms: 40 }, history: H({ sent24h: 0, failed24h: 2 }) })) === "healthy");
t("email: slow is degraded", S(classifyEmail({ configured: true, dryRun: false, probe: { ok: true, ms: LIMITS.smtpSlowMs }, history: H() })) === "degraded");
t("email: history unreadable is stated, not hidden", classifyEmail({ configured: true, dryRun: false, probe: { ok: true, ms: 10 }, history: { ...H(), available: false } }).evidence.join().includes("could not be read"));
t("email: no recipient address appears in the component", !JSON.stringify(classifyEmail({ configured: true, dryRun: false, probe: { ok: true, ms: 10 }, history: H({ failed24h: 1, lastFailureAt: "x", lastFailure: scrub("550 user someone@school.edu unknown") }) })).includes("someone@school.edu"));
// ---- scheduled jobs / background / errors / app
const JOBS = scheduledJobs(NOW);
t("jobs: registry comes from vercel.json (5 jobs, each with a next due time)", JOBS.length === 5 && JOBS.every((j) => !!j.nextDueAt && !!j.description));
t("jobs: with a secret but no history the status is unknown, never healthy", (() => { const c = classifyScheduledJobs({ cronSecret: true, jobs: JOBS }); return c.status === "unknown" && /no execution history/.test(c.summary); })());
t("jobs: no secret is not_configured", S(classifyScheduledJobs({ cronSecret: false, jobs: JOBS })) === "not_configured");
t("jobs: none registered is not_configured", S(classifyScheduledJobs({ cronSecret: true, jobs: [] })) === "not_configured");
t("jobs: every row reports last run, success, failure and duration as not recorded", (() => { const rows = (classifyScheduledJobs({ cronSecret: true, jobs: JOBS }).details!.jobs as { lastRunAt: unknown; lastSuccessAt: unknown; lastFailure: unknown; durationMs: unknown }[]); return rows.every((r) => r.lastRunAt === null && r.lastSuccessAt === null && r.lastFailure === null && r.durationMs === null); })());
t("background: nothing stuck is healthy and says there is no queue", (() => { const c = classifyBackground({ available: true, preview: 1, processing: 0, completed7d: 3, stuck: 0 }); return c.status === "healthy" && c.evidence.join().includes("no general job queue"); })());
t("background: stuck imports are degraded", S(classifyBackground({ available: true, preview: 0, processing: 2, completed7d: 0, stuck: 2 })) === "degraded");
t("background: unreadable is unknown", S(classifyBackground({ available: false, preview: 0, processing: 0, completed7d: 0, stuck: 0 })) === "unknown");
const C0 = { last15Minutes: 0, lastHour: 0, last24Hours: 0, byServiceLastHour: {}, byStatusLastHour: [], byRouteLastHour: [], retained: 0, capacity: 500 };
t("errors: none is healthy; 1-19 in 15 min is degraded; 20+ is unavailable", S(classifyErrors(C0, NOW)) === "healthy" && S(classifyErrors({ ...C0, last15Minutes: 1 }, NOW)) === "degraded" && S(classifyErrors({ ...C0, last15Minutes: 19 }, NOW)) === "degraded" && S(classifyErrors({ ...C0, last15Minutes: 20 }, NOW)) === "unavailable");
t("errors: evidence lists counts by status and by endpoint", (() => { const e = classifyErrors({ ...C0, last15Minutes: 3, lastHour: 4, byStatusLastHour: [{ key: "500", count: 3 }, { key: "502", count: 1 }], byRouteLastHour: [{ key: "GET /api/x", count: 4 }] }, NOW).evidence.join(" | "); return /500 ×3, 502 ×1/.test(e) && /GET \/api\/x ×4/.test(e); })());
t("errors: states the counts are per instance and not durable", classifyErrors(C0, NOW).evidence.join().includes("not durable"));
const INFO = { buildId: "abc", commit: null, node: "v24", mode: "production", uptimeSeconds: 10, startedAt: NOW.toISOString() };
t("app: valid configuration is healthy; warnings and errors are degraded", S(classifyApp({ envErrors: [], envWarnings: [], info: INFO })) === "healthy" && S(classifyApp({ envErrors: [], envWarnings: ["CORS_ORIGINS is not set"], info: INFO })) === "degraded" && S(classifyApp({ envErrors: ["DATABASE_URL: required"], envWarnings: [], info: INFO })) === "degraded");
t("app: evidence says it proves liveness only", classifyApp({ envErrors: [], envWarnings: [], info: INFO }).evidence.join().includes("liveness only"));

// ---- roll-up
const mk = (key: string, status: Component["status"]): Component => ({ key, label: key, status, checkedAt: "", summary: "", evidence: [], latencyMs: null });
const all = (o: Record<string, Component["status"]>) => overall(Object.entries({ application: "healthy", database: "healthy", storage: "healthy", ai: "healthy", email: "healthy", scheduledJobs: "healthy", backgroundJobs: "healthy", errors: "healthy", ...o }).map(([k, v]) => mk(k, v as Component["status"])));
t("overall: all healthy", all({}).status === "healthy");
t("overall: database unavailable is unavailable", all({ database: "unavailable" }).status === "unavailable");
t("overall: storage unavailable is unavailable", all({ storage: "unavailable" }).status === "unavailable");
t("overall: a degraded core component is degraded", all({ storage: "degraded" }).status === "degraded");
t("overall: AI or email unavailable only degrades the platform", all({ ai: "unavailable" }).status === "degraded" && all({ email: "unavailable" }).status === "degraded");
t("overall: unknown/not configured non-core components do not hide a healthy core, and are counted", (() => { const o = all({ scheduledJobs: "unknown", ai: "not_configured", email: "not_configured" }); return o.status === "healthy" && o.counts.unknown === 1 && o.counts.not_configured === 2 && o.notes.length === 2; })());
t("overall: an unconfigured core component is never healthy", all({ storage: "not_configured" }).status === "unknown");

// ---- scrubbing
for (const [n, raw, bad] of [["postgres url", "failed postgresql://user:pw123@host:5432/db", "pw123"], ["bearer", "sent Bearer abcdef0123456789xyz", "abcdef0123456789xyz"], ["jwt", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig_abcdefgh", "eyJhbGci"], ["api key", "key sk-live-abcdefghijklmnop1234", "abcdefghijklmnop1234"], ["groq key", "gsk_abcdefghijklmnop123456", "abcdefghijklmnop123456"], ["password=", "password=hunter2 failed", "hunter2"], ["email", "mail to anna.k@college.edu bounced", "anna.k@college.edu"], ["opaque blob", "id AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 fail", "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"], ["url creds", "GET https://user:secret@api.example.com/x", "secret"], ["api_key", "api_key: abc123def", "abc123def"], ["host:port", "Can't reach database server at 127.0.0.1:54330", "54330"], ["named host", "connect ECONNREFUSED db.internal.example.com:5432", "db.internal"], ["localhost", "fetch failed localhost:54321", "54321"]] as const) t(`scrub hides ${n}`, !scrub(raw).includes(bad), scrub(raw));
t("scrub keeps the first line only (no stack frames)", !scrub("Error: boom\n    at foo (/home/x/y/z.ts:1:2)").includes("at foo"));
t("scrub truncates long text", scrub("word ".repeat(200)).length <= 241);
t("scrub removes absolute source paths", !scrub("failed in /home/user/app/lib/x.ts:12:3").includes("/home/user"));
t("scrub handles non-strings", typeof scrub(null) === "string");
t("scrub keeps a UUID request id (it is not a secret)", scrub("req 3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f failed").includes("3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f"));
t("scrubPath: UUID segments become :id", scrubPath("/api/jds/3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f/extract?x=1") === "/api/jds/:id/extract");
t("scrubPath: a public link token is never stored", (() => { const p = scrubPath("/api/showcase/Qw3rTy9uIoP0aSdFgHjKlZxCvBnM1234567890abcd/resume.pdf"); return p === "/api/showcase/:token/resume.pdf" && !p.includes("Qw3rTy"); })());
t("scrubPath: ordinary paths are unchanged", scrubPath("/api/notifications/reminders/run") === "/api/notifications/reminders/run" && scrubPath("/api/students") === "/api/students");
t("scrubPath: the query string is dropped", !scrubPath("/api/x?token=abc").includes("token"));
t("isTimeout: our limit, abort, socket and library timeouts all count", isTimeout(new Timeout(5)) && isTimeout(Object.assign(new Error("x"), { name: "TimeoutError" })) && isTimeout(Object.assign(new Error("x"), { name: "AbortError" })) && isTimeout(Object.assign(new Error("x"), { code: "ETIMEDOUT" })) && isTimeout(new Error("Greeting never received")) && isTimeout(new Error("Connection timeout")));
t("isTimeout: ordinary failures do not", !isTimeout(new Error("ECONNREFUSED")) && !isTimeout(new Error("authentication failed")));

// ---- bounded error memory
resetMonitorStore();
recordError({ status: 400, code: "BAD_REQUEST", path: "/api/x" });
t("errors: 4xx are not recorded", listErrors({ page: 1, pageSize: 10 }).total === 0);
recordError({ status: 500, code: "INTERNAL", message: "boom postgresql://u:pw9@h/db", method: "GET", path: "/api/x?secret=1", requestId: "req-1" });
recordError({ status: 502, code: "AI_FAILED", message: "ai down", method: "POST", path: "/api/jds/3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f/extract", requestId: "req-2" });
const l = listErrors({ page: 1, pageSize: 10 });
t("errors: 5xx recorded, newest first, query string dropped, secret scrubbed", l.total === 2 && l.items[0].code === "AI_FAILED" && l.items[1].path === "/api/x" && !JSON.stringify(l).includes("pw9") && !JSON.stringify(l).includes("secret=1"));
t("errors: ids in the path are replaced", l.items[0].path === "/api/jds/:id/extract");
t("errors: service is inferred from the code", l.items[0].service === "ai" && l.items[1].service === "application");
t("errors: filter by service and by search", listErrors({ page: 1, pageSize: 10, service: "ai" }).total === 1 && listErrors({ page: 1, pageSize: 10, q: "req-1" }).total === 1 && listErrors({ page: 1, pageSize: 10, q: "nothing-here" }).total === 0);
t("errors: filter by date", listErrors({ page: 1, pageSize: 10, from: new Date(Date.now() + 86_400_000) }).total === 0 && listErrors({ page: 1, pageSize: 10, to: new Date(Date.now() + 86_400_000) }).total === 2);
recordError({ status: 500, code: "INTERNAL", message: "uuid id", method: "GET", path: "/api/showcase/Qw3rTy9uIoP0aSdFgHjKlZxCvBnM1234567890abcd", requestId: "3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f" });
t("errors: a UUID request id is kept and a public token path is not stored", (() => { const x = listErrors({ page: 1, pageSize: 10, q: "uuid id" }).items[0]; return x.requestId === "3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f" && x.path === "/api/showcase/:token"; })());
recordError({ status: 500, code: "X", message: "odd id", requestId: "bad id with spaces & <script>" });
t("errors: an odd request id is hidden", listErrors({ page: 1, pageSize: 10, q: "odd id" }).items[0].requestId === "[hidden]");
resetMonitorStore();
for (let i = 0; i < 5000; i++) recordError({ status: 500, code: "INTERNAL", message: `e${i}`, path: "/api/y" });
const big = listErrors({ page: 1, pageSize: 100 });
t("errors: 5000 events keep memory bounded at the capacity", big.retained === 500 && big.capacity === 500 && big.total === 500);
t("errors: paging a large history is bounded and ordered", big.items.length === 100 && big.items[0].message === "e4999" && listErrors({ page: 5, pageSize: 100 }).items.length === 100 && listErrors({ page: 6, pageSize: 100 }).items.length === 0 && listErrors({ page: 6, pageSize: 100 }).totalPages === 5);
t("errors: counts by window and by service", (() => { const c = errorCounts(); return c.last15Minutes === 500 && c.lastHour === 500 && c.byServiceLastHour.application === 500; })());
t("errors: counts by status and by endpoint", (() => { resetMonitorStore(); recordError({ status: 500, code: "A", method: "GET", path: "/api/a" }); recordError({ status: 500, code: "A", method: "GET", path: "/api/a" }); recordError({ status: 502, code: "AI_FAILED", method: "POST", path: "/api/b/3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f" }); const c = errorCounts(); return c.byStatusLastHour[0].key === "500" && c.byStatusLastHour[0].count === 2 && c.byRouteLastHour[0].key === "GET /api/a" && c.byRouteLastHour[0].count === 2 && c.byRouteLastHour.some((x) => x.key === "POST /api/b/:id"); })());
t("errors: counts exclude old events", errorCounts(Date.now() + 2 * 3_600_000).lastHour === 0);
t("errors: recordError never throws on odd input", (() => { try { recordError({ status: 500, code: "X", message: { toString() { throw new Error("no"); } } as unknown as string }); return true; } catch { return false; } })());

// ---- AI tally
resetMonitorStore();
recordAiCall({ ok: true, ms: 100 }); recordAiCall({ ok: true, ms: 300 }); recordAiCall({ ok: false, timeout: true, ms: 50000 }); recordAiCall({ ok: false, ms: 20, status: 502 });
const a = aiStats();
t("ai tally: calls, failures, timeouts, average and p95 latency of successes, last success", a.calls === 4 && a.failures === 2 && a.timeouts === 1 && a.avgLatencyMs === 200 && a.p95LatencyMs === 300 && !!a.lastSuccessAt);
t("ai tally: stores outcome and time only (no prompt field exists)", !Object.keys(a).some((k) => /prompt|payload|key|body/i.test(k)));
t("ai tally: window excludes old calls", aiStats(Date.now() + 2 * 3_600_000).calls === 0);

// ---- cron next-run
t("cron: daily 02:00 from 01:00 is today 02:00", nextRun("0 2 * * *", new Date("2026-03-10T01:00:00Z"))!.toISOString() === "2026-03-10T02:00:00.000Z");
t("cron: daily 02:00 from 02:00 exactly is tomorrow", nextRun("0 2 * * *", new Date("2026-03-10T02:00:00Z"))!.toISOString() === "2026-03-11T02:00:00.000Z");
t("cron: hourly at :30", nextRun("30 * * * *", new Date("2026-03-10T12:31:00Z"))!.toISOString() === "2026-03-10T13:30:00.000Z");
t("cron: hourly at :00 crosses midnight and a month end", nextRun("0 * * * *", new Date("2026-03-31T23:30:00Z"))!.toISOString() === "2026-04-01T00:00:00.000Z");
t("cron: steps and lists", nextRun("*/15 * * * *", new Date("2026-03-10T12:01:00Z"))!.toISOString() === "2026-03-10T12:15:00.000Z" && nextRun("0 9,17 * * *", new Date("2026-03-10T10:00:00Z"))!.toISOString() === "2026-03-10T17:00:00.000Z");
t("cron: day of week (Sunday 03:00)", nextRun("0 3 * * 0", new Date("2026-03-10T00:00:00Z"))!.toISOString() === "2026-03-15T03:00:00.000Z");
t("cron: leap day", nextRun("0 0 29 2 *", new Date("2027-03-01T00:00:00Z"))!.toISOString() === "2028-02-29T00:00:00.000Z");
for (const bad of ["", "* * * *", "61 * * * *", "* 24 * * *", "a b c d e", "*/0 * * * *", "5-2 * * * *"]) t(`cron: refuses ${JSON.stringify(bad)}`, nextRun(bad, NOW) === null);

// ---- timeouts
t("withTimeout: resolves in time", (await withTimeout(Promise.resolve(7), 50)) === 7);
t("withTimeout: rejects with Timeout when the call hangs", await withTimeout(new Promise(() => undefined), 30).then(() => false, (e) => e instanceof Timeout));
t("withTimeout: passes the original rejection through", await withTimeout(Promise.reject(new Error("real")), 50).then(() => false, (e) => e.message === "real"));

// ---- runChecks with mocked dependencies
const ENV = { DATABASE_URL: "postgresql://x:y@localhost:5432/db", SUPABASE_URL: "http://localhost:54321", SUPABASE_ANON_KEY: "a".repeat(30), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(30), GROQ_API_KEY: "gsk_test_key_0000000000000000", SMTP_HOST: "localhost", SMTP_PORT: "1025", SMTP_USER: "u", SMTP_PASS: "p", CRON_SECRET: "c".repeat(30), NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv;
const good = (o: Partial<Deps> = {}): Deps => ({ env: ENV, now: () => NOW, dbPing: async () => undefined, listBuckets: async () => ["student-documents"], aiProbe: async () => 200, smtpVerify: async () => undefined, emailHistory: async () => H(), importCounts: async () => ({ available: true, preview: 0, processing: 1 - 1, completed7d: 1, stuck: 0 }), ...o });
const by = (r: Awaited<ReturnType<typeof runChecks>>, k: string) => r.components.find((c) => c.key === k)!;
{
  const r = await runChecks(good());
  t("runChecks: everything available gives healthy components (jobs unknown, history not recorded)", ["application", "database", "storage", "ai", "email", "backgroundJobs", "errors"].every((k) => by(r, k).status === "healthy") && by(r, "scheduledJobs").status === "unknown" && r.overall.status === "healthy");
  t("runChecks: eight components, each with a timestamp and evidence", r.components.length === 8 && r.components.every((c) => c.checkedAt && c.evidence.length > 0));
  t("runChecks: nothing in the result carries the configured secrets", !JSON.stringify(r).match(/gsk_test_key|c{30}|b{30}|a{30}|postgresql:\/\/x:y/));
}
{ const r = await runChecks(good({ dbPing: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:5432 postgresql://x:y@localhost:5432/db"); } })); t("runChecks: database down is unavailable, overall unavailable, and the URL is scrubbed", by(r, "database").status === "unavailable" && r.overall.status === "unavailable" && !JSON.stringify(r).includes("x:y@")); }
{ const r = await runChecks(good({ listBuckets: async () => { throw new Error("fetch failed"); } })); t("runChecks: storage down is unavailable", by(r, "storage").status === "unavailable" && r.overall.status === "unavailable"); }
{ const r = await runChecks(good({ listBuckets: async () => ["other"] })); t("runChecks: wrong buckets is degraded", by(r, "storage").status === "degraded" && r.overall.status === "degraded"); }
{ const r = await runChecks(good({ aiProbe: async () => { throw new Error("getaddrinfo ENOTFOUND api.groq.com"); } })); t("runChecks: AI unreachable is unavailable but the platform is only degraded", by(r, "ai").status === "unavailable" && r.overall.status === "degraded"); }
{ const r = await runChecks(good({ aiProbe: async () => 401 })); t("runChecks: AI key refused is unavailable", by(r, "ai").status === "unavailable"); }
{ const r = await runChecks(good({ aiProbe: async () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); } })); t("runChecks: an abort-signal timeout from the provider call is reported as 'did not answer in time'", by(r, "ai").status === "unavailable" && /in time/.test(by(r, "ai").summary)); }
{ const r = await runChecks(good({ env: { ...ENV, GROQ_API_KEY: "" } })); t("runChecks: no AI key is not_configured (the provider is not called)", by(r, "ai").status === "not_configured"); }
{ let called = false; const r = await runChecks(good({ env: { ...ENV, GROQ_API_KEY: undefined } as NodeJS.ProcessEnv, aiProbe: async () => { called = true; return 200; } })); t("runChecks: an unconfigured provider is never probed", !called && by(r, "ai").status === "not_configured"); }
{ const r = await runChecks(good({ smtpVerify: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:1025"); } })); t("runChecks: SMTP down is unavailable, platform degraded", by(r, "email").status === "unavailable" && r.overall.status === "degraded"); }
{ let verified = false; const r = await runChecks(good({ env: { ...ENV, SMTP_DRY_RUN: "true" } as NodeJS.ProcessEnv, smtpVerify: async () => { verified = true; } })); t("runChecks: SMTP dry-run is not_configured and is not contacted", by(r, "email").status === "not_configured" && !verified); }
{ const r = await runChecks(good({ env: { ...ENV, SMTP_HOST: "" } as NodeJS.ProcessEnv })); t("runChecks: no SMTP host is not_configured", by(r, "email").status === "not_configured"); }
{ const r = await runChecks(good({ env: { ...ENV, CRON_SECRET: "" } as NodeJS.ProcessEnv })); t("runChecks: no CRON_SECRET makes scheduled jobs not_configured", by(r, "scheduledJobs").status === "not_configured"); }
{ const r = await runChecks(good({ env: { ...ENV, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" } as NodeJS.ProcessEnv })); t("runChecks: no storage settings is not_configured", by(r, "storage").status === "not_configured"); }
{ const t0 = Date.now(); const r = await runChecks(good({ dbPing: () => new Promise(() => undefined), aiProbe: () => new Promise(() => undefined), smtpVerify: () => new Promise(() => undefined), listBuckets: () => new Promise(() => undefined) })); const ms = Date.now() - t0;
  t("runChecks: four hung dependencies are all cut off by their limits (database, storage, AI, SMTP unavailable)", ["database", "storage", "ai", "email"].every((k) => by(r, k).status === "unavailable" && /in time/.test(by(r, k).summary)) && ms < LIMITS.smtpMs + 1500, `${ms} ms`);
  t("runChecks: the hung checks ran in parallel, not one after another", ms < LIMITS.dbMs + LIMITS.storageMs + LIMITS.aiMs + LIMITS.smtpMs - 3000, `${ms} ms`); }
{ const r = await runChecks(good({ emailHistory: async () => { throw new Error("db down"); }, importCounts: async () => { throw new Error("db down"); } })); t("runChecks: unreadable history is reported as such (email still checked, background unknown)", by(r, "email").evidence.join().includes("could not be read") && by(r, "backgroundJobs").status === "unknown"); }
{ const r = await runChecks(good({ importCounts: async () => ({ available: true, preview: 0, processing: 1, completed7d: 0, stuck: 1 }) })); t("runChecks: a stuck import degrades background jobs and the platform", by(r, "backgroundJobs").status === "degraded" && r.overall.status === "degraded"); }

// ---- throttling and caching
resetHealthCache();
let probes = 0; const counting = good({ dbPing: async () => { probes++; } });
const h1 = await getHealth({ deps: counting, nowMs: 1_000_000 });
const h2 = await getHealth({ deps: counting, nowMs: 1_000_000 + 5_000 });
t("throttle: a second request within 15 s reuses the result (one probe)", probes === 1 && h2.cached === true && !h1.cached);
const h3 = await getHealth({ deps: counting, nowMs: 1_000_000 + 6_000, refresh: true });
t("throttle: a forced refresh is honoured after 5 s (second probe)", probes === 2 && !h3.cached && !h3.throttled);
const h4 = await getHealth({ deps: counting, nowMs: 1_000_000 + 7_000, refresh: true });
t("throttle: a forced refresh within 5 s is refused and says so", probes === 2 && h4.throttled === true && h4.cached === true);
const h5 = await getHealth({ deps: counting, nowMs: 1_000_000 + 6_000 + CACHE_MS + 1 });
t("throttle: the cache expires after 15 s", probes === 3 && !h5.cached);
resetHealthCache(); probes = 0; const slow = good({ dbPing: async () => { probes++; await new Promise((r) => setTimeout(r, 80)); } });
await Promise.all(Array.from({ length: 20 }, () => getHealth({ deps: slow, nowMs: 5_000_000 })));
t("throttle: 20 simultaneous requests cause exactly one probe", probes === 1, String(probes));
t("throttle: policy constants", CACHE_MS === 15_000 && FORCE_GAP_MS === 5_000);

// ---- readiness
resetReadiness(); let pings = 0;
t("readiness: database answering is ready", (await readiness(async () => { pings++; }, 10_000)) === true);
t("readiness: the answer is cached for 5 s (no second query)", (await readiness(async () => { pings++; throw new Error("x"); }, 12_000)) === true && pings === 1);
t("readiness: after 5 s it asks again and reports unavailable on failure", (await readiness(async () => { throw new Error("down"); }, 16_000)) === false);
resetReadiness();
t("readiness: a hung database is cut off within the limit", await (async () => { const t0 = Date.now(); const ok = await readiness(() => new Promise(() => undefined), 99_000); return ok === false && Date.now() - t0 < LIMITS.dbMs + 800; })());

// ---- query contracts
t("errors query defaults", (() => { const v = eq.parse({}); return v.page === 1 && v.pageSize === 25 && !v.service; })());
t("errors query accepts every service", SERVICES.every((s) => eq.safeParse({ service: s }).success));
for (const bad of [{ service: "kernel" }, { service: "AI" }, { page: "0" }, { page: "x" }, { pageSize: "0" }, { pageSize: "101" }, { q: "x".repeat(101) }, { from: "yesterday" }, { from: "2026-03-02", to: "2026-03-01" }]) t(`errors query refuses ${JSON.stringify(bad)}`, !eq.safeParse(bad).success);
t("errors query: date-only to covers the day", eq.parse({ to: "2026-03-05" }).to!.toISOString() === "2026-03-05T23:59:59.999Z");
t("summary query accepts refresh only", sq.safeParse({}).success && sq.safeParse({ refresh: "1" }).success && !sq.safeParse({ refresh: "yes" }).success && !sq.safeParse({ x: "1" }).success);
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

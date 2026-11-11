// Gate 4 Phase 4.3 (+ closing fixes): system health and monitoring (SA-TC-054..057, SA-TC-055 job history, SA-TC-008 scope finding, SA-TC-019 adjacent access rules).
// Dependencies are failed in CONTROLLED ways without touching the real local services: this suite starts its OWN app instance (port 3114) whose
// database, Supabase storage, SMTP and AI provider all go through proxies/mocks it controls. The real database and Auth are never stopped.
// No real email is sent (the mock SMTP server only accepts a connection and a login). Local stack only.
import net from "node:net";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g3-08-monitoring");
const SA = ["SA-TC-054"], ACC = ["SA-TC-035", "SRS-SECURITY-TC-022", "SRS-SECURITY-TC-023", "SRS-SECURITY-TC-024"];
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const PORT = 3114, BASE = `http://localhost:${PORT}`;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const listen = (srv) => new Promise((res) => srv.listen(0, "127.0.0.1", () => res(srv.address().port)));

// ---------------- controllable mocks ----------------
const ctl = { ai: { mode: "ok", delay: 0, probes: 0, chat: "ok", chats: 0 }, smtp: { mode: "ok", connections: 0, mailCommands: 0 }, storage: { mode: "ok", calls: 0 }, pg: { mode: "up", delay: 0 } };
// AI provider (OpenAI-compatible subset): GET /v1/models and POST /v1/chat/completions
const aiSrv = http.createServer(async (req, res) => {
  if (req.url?.endsWith("/models")) {
    ctl.ai.probes++;
    if (ctl.ai.mode === "hang") return;
    if (ctl.ai.delay) await sleep(ctl.ai.delay);
    const code = { ok: 200, "401": 401, "403": 403, "429": 429, "500": 500, "503": 503 }[ctl.ai.mode] ?? 200;
    res.writeHead(code, { "content-type": "application/json" }); return res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
  }
  if (req.url?.endsWith("/chat/completions")) {
    ctl.ai.chats++; for await (const _ of req) void _;
    if (ctl.ai.chat === "fail") { res.writeHead(500, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: "mock provider failure key=sk-mocksecret0123456789abcdef" } })); }
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ choices: [{ message: { content: "{}" } }] }));
  }
  res.writeHead(404).end();
});
const aiPort = await listen(aiSrv);
// SMTP: accepts a connection and a login, and counts any attempt to send mail (there must be none)
const smtpSockets = new Set();
const smtpSrv = net.createServer((s) => {
  ctl.smtp.connections++; smtpSockets.add(s); s.on("close", () => smtpSockets.delete(s)); s.on("error", () => undefined);
  if (ctl.smtp.mode === "hang") return;
  s.write("220 mock ESMTP ready\r\n"); let loginStep = 0, inData = false;
  s.on("data", (b) => { for (const line of b.toString().split("\r\n").filter(Boolean)) {
    const u = line.toUpperCase();
    if (inData) { if (line === ".") { inData = false; s.write("250 queued\r\n"); } }
    else if (u.startsWith("DATA")) { ctl.smtp.mailCommands++; inData = true; s.write("354 go ahead\r\n"); }
    else if (/^(MAIL FROM|RCPT TO)/.test(u)) s.write("250 ok\r\n");
    else if (u.startsWith("EHLO") || u.startsWith("HELO")) s.write("250-mock\r\n250 AUTH PLAIN LOGIN\r\n");
    else if (u.startsWith("AUTH PLAIN")) s.write(ctl.smtp.mode === "reject" ? "535 5.7.8 authentication failed\r\n" : "235 ok\r\n");
    else if (u.startsWith("AUTH LOGIN")) { loginStep = 1; s.write("334 VXNlcm5hbWU6\r\n"); }
    else if (loginStep === 1) { loginStep = 2; s.write("334 UGFzc3dvcmQ6\r\n"); }
    else if (loginStep === 2) { loginStep = 0; s.write(ctl.smtp.mode === "reject" ? "535 5.7.8 authentication failed\r\n" : "235 ok\r\n"); }
    else if (u.startsWith("QUIT")) { s.write("221 bye\r\n"); s.end(); } else s.write("250 ok\r\n");
  } });
});
const smtpPort = await listen(smtpSrv);
// Supabase: pass everything through to the real local stack; only /storage/v1 can be made to fail, hang or return no buckets
const supaSrv = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (req.url?.startsWith("/storage/v1")) {
    ctl.storage.calls++;
    if (ctl.storage.mode === "hang") return;
    if (ctl.storage.mode === "500") { res.writeHead(500, { "content-type": "application/json" }); return res.end(JSON.stringify({ message: "storage exploded postgresql://u:pw77@db/x" })); }
    if (ctl.storage.mode === "empty" && /\/bucket\/?$/.test(req.url.split("?")[0])) { res.writeHead(200, { "content-type": "application/json" }); return res.end("[]"); }
  }
  const r = await fetch("http://localhost:54321" + req.url, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !["host", "connection", "content-length"].includes(k))), body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }).catch(() => null);
  if (!r) { res.writeHead(502).end(); return; }
  const body = Buffer.from(await r.arrayBuffer());
  res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !["content-encoding", "transfer-encoding", "content-length", "connection"].includes(k)))); res.end(body);
});
const supaPort = await listen(supaSrv);
// Postgres: a TCP proxy to the real database that can be paused (new connections refused, open ones closed) or slowed. The real database is never touched.
const pgSockets = new Set();
const pgSrv = net.createServer((c) => {
  if (ctl.pg.mode === "down") return c.destroy();
  const u = net.connect(54330, "127.0.0.1"); pgSockets.add(c); pgSockets.add(u);
  const drop = () => { c.destroy(); u.destroy(); pgSockets.delete(c); pgSockets.delete(u); };
  c.on("error", drop); u.on("error", drop); c.on("close", drop); u.on("close", drop);
  c.on("data", (d) => { if (ctl.pg.delay) setTimeout(() => u.write(d), ctl.pg.delay); else u.write(d); });
  u.on("data", (d) => c.write(d));
});
const pgPort = await listen(pgSrv);
const pgDown = () => { ctl.pg.mode = "down"; for (const s of pgSockets) s.destroy(); pgSockets.clear(); };
const pgUp = () => { ctl.pg.mode = "up"; ctl.pg.delay = 0; };

// ---------------- the app instance under test ----------------
const dbUrl = `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres?pgbouncer=true`;   // the flag only silences the app's own "not a pooled connection" production advisory
const env = { ...process.env, NODE_ENV: "production", PORT: String(PORT), RATE_LIMIT_DISABLED: "true", FLOOD_MAX_PER_MINUTE: "100000", APP_URL: BASE, CORS_ORIGINS: "http://localhost:5173",
  DATABASE_URL: dbUrl, SUPABASE_URL: `http://127.0.0.1:${supaPort}`, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${supaPort}`,
  SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtpPort), SMTP_USER: "mock-user", SMTP_PASS: "mock-pass-VERY-SECRET-0001", SMTP_DRY_RUN: "false",
  GROQ_API_KEY: "gsk_MOCKKEY_should_never_appear_0123456789", GROQ_API_BASE: `http://127.0.0.1:${aiPort}/v1`, GROQ_MODEL: "mock-model", CRON_SECRET: "cron-secret-for-monitoring-tests-0001", DB_POOL_MAX: "5" };
const WIN = process.platform === "win32";   // Windows: npx is npx.cmd and needs a shell; a process tree is stopped with taskkill
const app = spawn(WIN ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT)], { env, detached: !WIN, stdio: "ignore", shell: WIN, windowsHide: true });
const stopApp = () => { try { if (WIN) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-app.pid); } catch { /* already gone */ } };
process.on("exit", stopApp);
const wait = async (path, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + path)).ok) return true; } catch { /* starting */ } await sleep(700); } return false; };
const pw = `G3-mon-${tag}-Pw!`, emailA = `g3mona${tag}@example.com`, emailC = `g3monc${tag}@example.com`;
const made = { users: [], co: [], rec: [], colleges: [] };
const timings = [];
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
let lastForced = 0, aiReadingBefore = null, seedCollege = null;
try {
  t(SA, "the instance under test starts with mocks wired in (liveness answers)", await wait("/api/health/live"));
  for (const [e, p] of [[emailA, pw], [emailC, pw]]) { const r = spawnSync(WIN ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: WIN, env: { ...process.env, PLATFORM_ADMIN_EMAIL: e, PLATFORM_ADMIN_NAME: "G3 Monitor Admin", PLATFORM_ADMIN_PASSWORD: p } }); if (r.status !== 0) throw new Error(r.stderr); }
  const c1 = client(await login(emailA, pw), BASE); const enr = await c1("POST", "/api/platform/mfa/enroll");
  const tok = (await c1("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token;
  const P = client(tok, BASE), aal1 = client(await login(emailA, pw), BASE), noMfa = client(await login(emailC, pw), BASE);
  const mon = (qs = "") => P("GET", "/api/platform/monitoring" + (qs ? "?" + qs : ""));
  /** A fresh check: waits out the 5 s minimum gap between forced refreshes, then forces one. */
  const fresh = async () => { const wait5 = Math.max(0, lastForced + 5200 - Date.now()); if (wait5) await sleep(wait5); const t0 = Date.now(); const r = await mon("refresh=1"); lastForced = Date.now(); r.ms = lastForced - t0; return r; };
  const comp = (r, k) => r.d.components.find((c) => c.key === k);

  // The two monitoring tables start empty so every count below is exact (isolated local test database only).
  await rows(`delete from "JobRun"`); await rows(`delete from "MonitorEvent"`);

  // ============ baseline ============
  const b = await fresh();
  t(SA, "authorized platform administrator gets the health summary", b.s === 200 && b.d.components.length === 8 && !!b.d.overall, JSON.stringify(b.j).slice(0, 200));
  t(SA, "all five statuses are possible values and every component has a timestamp, summary and evidence", b.d.components.every((c) => ["healthy", "degraded", "unavailable", "unknown", "not_configured"].includes(c.status) && c.checkedAt && c.summary && c.evidence.length > 0));
  t(SA, "baseline: application, database, storage, AI, email, background jobs are healthy", ["application", "database", "storage", "ai", "email", "backgroundJobs"].every((k) => comp(b, k).status === "healthy"), JSON.stringify(b.d.components.map((c) => [c.key, c.status])));
  t(SA, "baseline: scheduled jobs are UNKNOWN (registered, no run recorded yet) and the platform is still healthy overall", comp(b, "scheduledJobs").status === "unknown" && b.d.overall.status === "healthy" && b.d.overall.counts.unknown === 1, JSON.stringify(b.d.overall));
  t(SA, "database latency is measured and reported in milliseconds", typeof comp(b, "database").latencyMs === "number" && comp(b, "database").latencyMs < 500);
  const info = comp(b, "application").details.info;
  t(SA, "application component reports build, mode, uptime and start time", /production/.test(info.mode) && info.uptimeSeconds >= 0 && !!info.startedAt && (info.buildId === null || typeof info.buildId === "string") && /^v\d+/.test(info.node), JSON.stringify(info));
  t(SA, "storage evidence says only a bucket listing is checked (no file, no link)", /no file is read/.test(comp(b, "storage").evidence.join()));
  t(SA, "email check made a connection and login to the mock SMTP server but sent nothing", ctl.smtp.connections >= 1 && ctl.smtp.mailCommands === 0, `connections ${ctl.smtp.connections} mail commands ${ctl.smtp.mailCommands}`);
  t(SA, "AI check was one authenticated model-list request (no chat completion, no tokens used)", ctl.ai.probes >= 1 && ctl.ai.chats === 0);

  // ============ scheduled jobs: registry, then REAL runs recorded in JobRun (SA-TC-055) ============
  const jobs = comp(b, "scheduledJobs").details.jobs;
  t(["SA-TC-055"], "scheduled jobs: all five registered jobs listed with description, schedule and a future next-due time", jobs.length === 5 && jobs.every((j) => j.description && j.schedule && new Date(j.nextDueAt) > new Date()) && jobs.some((j) => j.path === "/api/notifications/reminders/run"), JSON.stringify(jobs.map((j) => j.path)));
  t(["SA-TC-055"], "before any run: every job shows no run (state 'no_run_recorded'), the history is readable ('recorded'), and the component is UNKNOWN, never healthy", jobs.every((j) => j.lastRunAt === null && j.lastSuccessAt === null && j.lastFailure === null && j.durationMs === null && j.history === "recorded" && j.state === "no_run_recorded") && comp(b, "scheduledJobs").status === "unknown", JSON.stringify(jobs[0]));
  const CRON = { authorization: "Bearer " + env.CRON_SECRET };
  const JOB5 = jobs.map((j) => j.path);
  // Runs are grouped by schedule slot (:00 and :30 of each hour here), so a phase must not straddle a slot boundary: wait until it is safe.
  const offBoundary = async () => { for (;;) { const d = new Date(), m = d.getUTCMinutes() % 30, sec = d.getUTCSeconds(); if ((30 - m) * 60 - sec > 25 && m * 60 + sec > 4) return; await sleep(1000); } };
  const jobRow = async (job) => (await rows(`select * from "JobRun" where job=$1`, [job]))[0];
  const numOnly = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
  const LEAK = { email: "ravi.kumar@college.edu", phone: "9876543210", name: "Ravi Kumar", jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyYXZpIn0.abcdefghijklmnop" };
  const leakPii = (x) => new RegExp(["ravi", "kumar", "9876543210", "college\\.edu", "eyJhbGci"].join("|"), "i").test(String(x ?? ""));
  const FJOB = "/api/blocking/evaluate";

  // --- a job that FAILS first (its table is replaced, for a moment, by a view whose error text quotes a student's address, phone, name and a token)
  await offBoundary();
  await rows(`create or replace function g3_leak() returns uuid language plpgsql as $f$ begin raise exception 'student % phone % name % token %', '${LEAK.email}', '${LEAK.phone}', '${LEAK.name}', '${LEAK.jwt}'; end $f$`);
  await rows(`alter table "CollegeModule" rename to "CollegeModule_off"`);
  await rows(`create view "CollegeModule" as select g3_leak() as "collegeId", 'ATTENDANCE_BLOCKING'::"ModuleKey" as module, true as enabled`);
  let fres;
  try { fres = await fetch(BASE + FJOB, { headers: { ...CRON, "x-request-id": `mon-fail-${tag}` } }); }
  finally { await rows(`drop view "CollegeModule"`); await rows(`alter table "CollegeModule_off" rename to "CollegeModule"`); await rows(`drop function g3_leak()`); }
  const ftxt = await fres.text();
  t(["SA-TC-055"], "a job that fails returns a clean 5xx: no query, table, student detail or stack in the response", fres.status >= 500 && !leakPii(ftxt) && !/CollegeModule|select |prisma|node_modules/i.test(ftxt), `HTTP ${fres.status} ${ftxt.slice(0, 120)}`);
  const fr = await jobRow(FJOB);
  t(["SA-TC-055"], "the failure is recorded: one row, not ok, one attempt (one failed), finished, with a duration", !!fr && fr.ok === false && fr.attempts === 1 && fr.failedAttempts === 1 && !!fr.finishedAt && fr.durationMs >= 0, JSON.stringify(fr));
  t(["SA-TC-055"], "the recorded failure note is sanitized: only the error class (and code), nothing from the database message (no address, phone, name or token)", !!fr && !leakPii(fr.error) && /^[A-Za-z]+(\s[A-Z0-9_]+)?: /.test(fr.error) && fr.error.length < 160 && fr.summary === null, fr?.error);
  { const af = await fresh(); const c = comp(af, "scheduledJobs"); const row = c.details.jobs.find((j) => j.path === FJOB);
    t(["SA-TC-055"], "the dashboard shows the failure: state 'failed', its time and sanitized note, one attempt (1 failed); the component is degraded and the platform degraded (never unavailable: jobs are not a core dependency)", row.state === "failed" && row.lastFailure === fr.error && !!row.lastFailureAt && row.attempts === 1 && row.failedAttempts === 1 && c.status === "degraded" && af.d.overall.status === "degraded", `${c.status} ${c.summary} ${af.d.overall.status}`);
    t(["SA-TC-055"], "the failure is attributed to the right job only: the other four jobs show 'no run yet'", c.details.jobs.filter((j) => j.path !== FJOB).every((j) => j.state === "no_run_recorded"));
    t(["SA-TC-055"], "nothing sensitive is anywhere in the dashboard response", !leakPii(JSON.stringify(af.j))); }

  // --- all five jobs run with the scheduler secret (the failed one is now a RETRY of the same slot)
  await offBoundary();
  const runs = []; for (const j of JOB5) { const t0 = Date.now(); const r = await fetch(BASE + j, { headers: CRON }); runs.push({ j, s: r.status, ms: Date.now() - t0, body: await r.json().catch(() => null) }); }
  t(["SA-TC-055"], "each of the five scheduled jobs, run with the scheduler secret (GET), succeeds and returns its normal result", runs.every((r) => r.s === 200 && r.body && "data" in r.body), runs.map((r) => `${r.j}:${r.s}`).join(" "));
  const dbRows = await rows(`select * from "JobRun" order by job`);
  t(["SA-TC-055"], "after the runs the database holds exactly one record per job (five), each finished and ok, with a start, an end and a duration", dbRows.length === 5 && dbRows.every((r) => r.ok === true && r.finishedAt && r.startedAt && r.durationMs >= 0 && r.error === null), JSON.stringify(dbRows.map((r) => [r.job, r.ok, r.attempts])));
  { const r = dbRows.find((x) => x.job === FJOB);
    t(["SA-TC-055"], "retry: the job that failed earlier in the same slot now shows ONE row with 2 attempts (1 failed), outcome ok, and the failure note cleared - no duplicate row", r.attempts === 2 && r.failedAttempts === 1 && r.ok === true && r.error === null && dbRows.filter((x) => x.job === FJOB).length === 1, JSON.stringify(r)); }
  { const canon = (o) => JSON.stringify(Object.entries(numOnly(o ?? {})).sort(([a], [b]) => (a < b ? -1 : 1)));
    t(["SA-TC-055"], "the stored counts equal what each job returned (numbers only, same names and values)", runs.every((r) => { const row = dbRows.find((x) => x.job === r.j); return canon(row.summary) === canon(r.body.data) && (row.summary === null || Object.values(row.summary).every((v) => typeof v === "number")); }), JSON.stringify(dbRows.map((r) => r.summary))); }
  t(["SA-TC-055"], "the recorded duration is consistent with the measured request time (not longer than the request took)", runs.every((r) => dbRows.find((x) => x.job === r.j).durationMs <= r.ms + 50), JSON.stringify(runs.map((r) => [r.ms, dbRows.find((x) => x.job === r.j).durationMs])));
  const aft = await fresh(); const jobs2 = comp(aft, "scheduledJobs").details.jobs;
  t(["SA-TC-055"], "the dashboard shows each job's last run, last success, duration, 'succeeded' and attempts, equal to the database rows", jobs2.every((j) => { const r = dbRows.find((x) => x.job === j.path); return r && j.state === "succeeded" && !!j.lastRunAt && !!j.lastSuccessAt && j.durationMs === r.durationMs && j.lastFailure === null; }), JSON.stringify(jobs2.map((j) => [j.path, j.state, j.attempts])));
  t(["SA-TC-055"], "all five ran and the latest run succeeded: the Scheduled jobs component is healthy and nothing else is wrong except the recent 5xx the induced failure itself caused", comp(aft, "scheduledJobs").status === "healthy" && aft.d.components.filter((c) => c.status !== "healthy").map((c) => c.key).join() === "errors", `${comp(aft, "scheduledJobs").status} ${JSON.stringify(aft.d.components.filter((c) => c.status !== "healthy").map((c) => [c.key, c.status]))}`);

  // --- a scheduled job called without the secret leaves no trace
  { const before = (await rows(`select count(*)::int n, coalesce(sum(attempts),0)::int a from "JobRun"`))[0];
    const s1 = (await fetch(BASE + "/api/reports/schedules/run")).status, s2 = (await fetch(BASE + "/api/reports/schedules/run", { headers: { authorization: "Bearer wrong-secret" } })).status, s3 = (await fetch(BASE + "/api/blocking/evaluate", { method: "POST" })).status;
    const after = (await rows(`select count(*)::int n, coalesce(sum(attempts),0)::int a from "JobRun"`))[0];
    t(["SA-TC-055"], "a scheduled job called without the secret, or with a wrong one, is refused (401) and leaves no record", s1 === 401 && s2 === 401 && s3 === 401 && before.n === after.n && before.a === after.a, `${s1}/${s2}/${s3}`); }

  // --- concurrent executions of the same slot: one row, no lost or duplicated attempt
  await offBoundary();
  { const CJOB = "/api/notifications/reminders/run"; const b4 = await jobRow(CJOB);
    const rs = await Promise.all(Array.from({ length: 12 }, () => fetch(BASE + CJOB, { headers: CRON }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }))));
    const af = await rows(`select * from "JobRun" where job=$1`, [CJOB]);
    t(["SA-TC-055"], "12 simultaneous executions of one job all run to completion and return their normal result", rs.every((r) => r.s === 200 && r.j?.data), rs.map((r) => r.s).join(","));
    t(["SA-TC-055"], "concurrent executions share ONE row: attempts rose by exactly 12 (none lost, none duplicated), no failures, outcome ok", af.length === 1 && af[0].attempts === b4.attempts + 12 && af[0].failedAttempts === b4.failedAttempts && af[0].ok === true, JSON.stringify(af.map((r) => [r.attempts, r.failedAttempts, r.ok]))); }

  // --- partial failure under concurrency: 6 attempts fail (table briefly unavailable), then 6 succeed; all in one slot
  await offBoundary();
  { const b4 = await jobRow(FJOB);
    await rows(`alter table "CollegeModule" rename to "CollegeModule_off"`);
    let bad; try { bad = await Promise.all(Array.from({ length: 6 }, () => fetch(BASE + FJOB, { headers: CRON }).then((r) => r.status))); } finally { await rows(`alter table "CollegeModule_off" rename to "CollegeModule"`); }
    const mid = await jobRow(FJOB);
    const good = await Promise.all(Array.from({ length: 6 }, () => fetch(BASE + FJOB, { headers: CRON }).then((r) => r.status)));
    const fin = await rows(`select * from "JobRun" where job=$1`, [FJOB]);
    t(["SA-TC-055"], "partial failure: six concurrent attempts fail cleanly (5xx) and are all counted on the one row, outcome failed", bad.every((x) => x >= 500) && mid.attempts === b4.attempts + 6 && mid.failedAttempts === b4.failedAttempts + 6 && mid.ok === false, `${bad.join(",")} ${JSON.stringify([mid.attempts, mid.failedAttempts, mid.ok])}`);
    t(["SA-TC-055"], "then six concurrent attempts succeed: still ONE row, attempts +12 in total, failed attempts +6, final outcome ok with the failure note cleared", good.every((x) => x === 200) && fin.length === 1 && fin[0].attempts === b4.attempts + 12 && fin[0].failedAttempts === b4.failedAttempts + 6 && fin[0].ok === true && fin[0].error === null, JSON.stringify(fin.map((r) => [r.attempts, r.failedAttempts, r.ok, r.error]))); }

  // --- monitoring persistence fails: the job still does its work
  await offBoundary();
  { const RJOB = "/api/notifications/round-reminders/run"; const b4 = await jobRow(RJOB);
    await rows(`alter table "JobRun" rename to "JobRun_off"`);
    let pf, hist; try { pf = await fetch(BASE + RJOB, { headers: CRON }); hist = await fresh(); } finally { await rows(`alter table "JobRun_off" rename to "JobRun"`); }
    const pj = await pf.json().catch(() => null);
    t(["SA-TC-055"], "monitoring table unavailable: the job still runs and returns its normal 200 result (monitoring failure and cleanup failure are both swallowed)", pf.status === 200 && pj?.data && typeof pj.data.colleges === "number", `HTTP ${pf.status} ${JSON.stringify(pj)}`);
    t(["SA-TC-055"], "monitoring table unavailable: nothing was recorded for that run, and nothing else was disturbed", (await jobRow(RJOB)).attempts === b4.attempts);
    const sj = comp(hist, "scheduledJobs");
    t(["SA-TC-055"], "monitoring table unavailable: the dashboard still loads and says the run history could not be read (unknown, history 'unavailable'), never healthy", hist.s === 200 && sj.status === "unknown" && /could not be read/.test(sj.summary) && sj.details.jobs.every((j) => j.history === "unavailable"), `${hist.s} ${sj.status} ${sj.summary}`); }
  // --- monitoring writes that HANG (a trigger sleeps 4 s on every insert): the job is held back by at most the 1 s write limits
  await offBoundary();
  { const HJOB = "/api/notifications/reminders/run";
    await rows(`create or replace function g3_slow_jobrun() returns trigger language plpgsql as $f$ begin perform pg_sleep(4); return new; end $f$`);
    await rows(`create trigger g3_slow before insert on "JobRun" for each row execute function g3_slow_jobrun()`);
    let ms, hres; try { const t0 = Date.now(); hres = await fetch(BASE + HJOB, { headers: CRON }); ms = Date.now() - t0; await sleep(9500); } finally { await rows(`drop trigger if exists g3_slow on "JobRun"`); await rows(`drop function if exists g3_slow_jobrun()`); }
    t(["SA-TC-055"], "monitoring writes hang (4 s each): the job still returns its normal 200 result and is delayed by at most the two 1-second write limits", hres.status === 200 && (await hres.json()).data && ms < 3500, `HTTP ${hres.status} in ${ms} ms`);
    t(["SA-TC-055"], "after the hung writes finish nothing is corrupted: one row per job still, attempts only ever increase", (await rows(`select job from "JobRun" group by job having count(*) > 1`)).length === 0); }

  // --- history endpoint: paging, filters, validation
  { const l1 = await P("GET", "/api/platform/monitoring/jobs?pageSize=2&page=1"), l2 = await P("GET", "/api/platform/monitoring/jobs?pageSize=2&page=2"), lf = await P("GET", `/api/platform/monitoring/jobs?job=${encodeURIComponent(FJOB)}`), lo = await P("GET", "/api/platform/monitoring/jobs?outcome=failed");
    t(["SA-TC-055"], "job history API: newest first, paged (distinct pages, correct total), filter by job and by outcome", l1.s === 200 && l1.d.items.length === 2 && l2.d.items.length === 2 && new Set([...l1.d.items, ...l2.d.items].map((r) => r.job)).size === 4 && l1.d.total === 5 && lf.d.items.every((r) => r.job === FJOB) && lf.d.total === 1 && lo.d.items.every((r) => r.ok === false), `${l1.d?.total} ${lf.d?.total}`);
    t(["SA-TC-055"], "job history API: a row carries start, finish, outcome, duration, attempts and counts, and keeps 90 days", ["job", "slotAt", "startedAt", "finishedAt", "ok", "durationMs", "attempts", "failedAttempts", "summary", "error"].every((k) => k in l1.d.items[0]) && l1.d.retentionDays === 90);
    const bads = []; for (const q of ["job=/api/other", "pageSize=0", "pageSize=101", "page=0", "outcome=weird", "x=1"]) { const r = await P("GET", "/api/platform/monitoring/jobs?" + q); if (r.s !== 400) bads.push(`${q}:${r.s}`); }
    t(["SA-TC-055"], "job history API: unknown jobs, bad paging, bad outcome and unknown parameters are refused (400)", bads.length === 0, bads.join(" ")); }

  // --- retention, through the real hourly job: bounded per call, oldest first, recent rows untouched
  await offBoundary();
  { await rows(`insert into "JobRun" (id, job, trigger, "slotAt", "startedAt", "lastStartedAt", attempts) select gen_random_uuid(), 'old' || (g % 5), 'scheduler', now() - interval '100 days' - (g || ' hours')::interval, now(), now(), 1 from generate_series(1, 2500) g`);
    await rows(`insert into "JobRun" (id, job, trigger, "slotAt", "startedAt", "lastStartedAt", attempts) select gen_random_uuid(), 'keep' || (g % 5), 'scheduler', now() - interval '60 days' - (g || ' hours')::interval, now(), now(), 1 from generate_series(1, 300) g`);
    await rows(`insert into "MonitorEvent" (id, at, service, status, code, message) select gen_random_uuid(), now() - interval '20 days' - (g || ' minutes')::interval, 'application', 500, 'OLD', 'old event' from generate_series(1, 12500) g`);
    await rows(`insert into "MonitorEvent" (id, at, service, status, code, message) select gen_random_uuid(), now() - interval '10 days' - (g || ' minutes')::interval, 'application', 500, 'KEEP', 'recent event' from generate_series(1, 400) g`);
    const cnt = async () => (await rows(`select (select count(*)::int from "MonitorEvent" where code='OLD') olde, (select count(*)::int from "MonitorEvent" where code='KEEP') keepe, (select count(*)::int from "JobRun" where job like 'old%') oldj, (select count(*)::int from "JobRun" where job like 'keep%') keepj`))[0];
    const RJOB = "/api/notifications/round-reminders/run"; const ts = [], res = []; let ret1, ret2, ret3;
    for (let i = 0; i < 3; i++) { const t0 = Date.now(); const r = await fetch(BASE + RJOB, { headers: CRON }); ts.push(Date.now() - t0); res.push(r.status); if (i === 0) ret1 = await cnt(); if (i === 1) ret2 = await cnt(); }
    ret3 = await cnt();
    t(["SA-TC-055"], "retention: one hourly job run removes at most one bounded slice (5 x 1000 per table), oldest first - a 12,500-row backlog is NOT cleared in one call", ret1.olde === 12500 - 5000 && ret1.oldj === 0, JSON.stringify(ret1));
    t(["SA-TC-055"], "retention: the next runs keep draining the backlog in bounded slices until nothing older than 14 days (events) / 90 days (job runs) remains", ret2.olde === 12500 - 10000 && ret3.olde === 0 && ret3.oldj === 0, JSON.stringify([ret2, ret3]));
    t(["SA-TC-055"], "retention: rows inside the window are never deleted (events from 10 days ago, job runs from 60 days ago)", ret1.keepe === 400 && ret3.keepe === 400 && ret1.keepj === 300 && ret3.keepj === 300, JSON.stringify([ret1, ret3]));
    t(["SA-TC-055"], "retention: the job itself is unaffected (200 every time) and cleanup keeps its time bounded", res.every((x) => x === 200) && Math.max(...ts) < 4500, `${res.join(",")} ${ts.join(",")} ms`);
    // The tables are small by now, so the planner would rightly scan them; force it off to prove the INDEXES exist and serve these exact statements. (At 20,000 / 30,000 rows the planner chose them unforced: see the migration report.)
    // Which scan form the planner picks (plain, backward, bitmap, index-only) depends on table statistics at that moment; any of them, naming the right index, proves the index serves the statement.
    const viaIndex = (plan, name) => new RegExp(`(Bitmap )?Index (Only )?Scan( Backward)?( using)? .*"${name}"`).test(plan);
    const ex = async (sql) => { await pgc.query("begin"); try { await pgc.query("set local enable_seqscan = off"); return (await pgc.query(`explain ${sql}`)).rows.map((r) => r["QUERY PLAN"]).join(" | "); } finally { await pgc.query("rollback"); } };
    const pj = await ex(`delete from "JobRun" where ctid = any (array(select ctid from "JobRun" where "slotAt" < now() - interval '90 days' order by "slotAt" limit 1000 for update skip locked))`);
    const pe = await ex(`delete from "MonitorEvent" where ctid = any (array(select ctid from "MonitorEvent" where "at" < now() - interval '14 days' order by "at" limit 1000 for update skip locked))`);
    const pl = await ex(`select distinct on (job) job, "slotAt" from "JobRun" where "slotAt" > now() - interval '90 days' order by job, "slotAt" desc`);
    const pq = await ex(`select * from "MonitorEvent" where service = 'ai' and at > now() - interval '14 days' order by at desc limit 25`);
    t(["SA-TC-055"], "indexes: retention deletes, the latest-run-per-job read and the filtered error list are served by indexes (JobRun_slotAt_idx, JobRun_job_slotAt_key, MonitorEvent_at_idx, MonitorEvent_service_at_idx) and the delete is a TID delete (no full-table scan)", viaIndex(pj, "JobRun_slotAt_idx") && /Tid Scan on "JobRun"/.test(pj) && viaIndex(pe, "MonitorEvent_at_idx") && /Tid Scan on "MonitorEvent"/.test(pe) && (viaIndex(pl, "JobRun_job_slotAt_key") || viaIndex(pl, "JobRun_slotAt_idx")) && (viaIndex(pq, "MonitorEvent_service_at_idx") || viaIndex(pq, "MonitorEvent_at_idx")), [pj, pe, pl, pq].map((x) => x.slice(0, 220)).join(" || ")); }
  // --- the schema: additive, no foreign keys, row-level security on, nothing granted to the public roles
  { const fk = await rows(`select conname from pg_constraint where contype='f' and (conrelid in ('"JobRun"'::regclass,'"MonitorEvent"'::regclass) or confrelid in ('"JobRun"'::regclass,'"MonitorEvent"'::regclass))`);
    const rls = await rows(`select relname, relrowsecurity from pg_class where relname in ('JobRun','MonitorEvent')`);
    const gr = await rows(`select grantee from information_schema.role_table_grants where table_name in ('JobRun','MonitorEvent') and grantee in ('anon','authenticated')`);
    t(["SA-TC-055"], "schema safety: no foreign keys in or out, row-level security on both tables, nothing granted to the public (anon / authenticated) roles", fk.length === 0 && rls.length === 2 && rls.every((r) => r.relrowsecurity) && gr.length === 0, JSON.stringify([fk, rls, gr])); }
  await rows(`delete from "JobRun" where job like 'old%' or job like 'keep%'`);
  { const ev = await rows(`select code, status, service, message, path, "requestId" from "MonitorEvent" where path = $1`, [FJOB]);
    t(["SA-TC-055", "SA-TC-056"], "the failed job's server errors are in the durable record (one per failed attempt: 1 + 6), each with only the error class and code (database message withheld), no address, phone, name or token", ev.length === 7 && ev.every((e) => e.status === 500 && e.code === "UNHANDLED" && !leakPii(JSON.stringify(e)) && /database error \(details withheld\)/.test(e.message)), JSON.stringify(ev.slice(0, 2)));
    await rows(`delete from "MonitorEvent"`); }   // the induced failures are verified; start the rest of the suite from a clean error record (the 15-minute error counts would otherwise keep the platform degraded)

  // ============ AI provider ============
  for (const [mode, want, label] of [["401", "unavailable", "key refused (401)"], ["403", "unavailable", "key refused (403)"], ["429", "degraded", "rate limited (429)"], ["500", "unavailable", "provider error (500)"], ["503", "unavailable", "provider error (503)"]]) {
    ctl.ai.mode = mode; const r = await fresh(); t(["SA-TC-058", ...SA.slice(0, 0)], `AI mock ${label}: ${want}`, comp(r, "ai").status === want, comp(r, "ai").status + " " + comp(r, "ai").summary);
    if (want === "unavailable") t(SA, `AI ${label}: the platform is degraded, not unavailable (AI is not a core dependency)`, r.d.overall.status === "degraded", r.d.overall.status);
  }
  ctl.ai.mode = "ok"; ctl.ai.delay = 3300; { const r = await fresh(); t(SA, "AI mock slow (3.3 s): degraded, and the check still finishes inside its limit", comp(r, "ai").status === "degraded" && r.ms < 4500, `${comp(r, "ai").status} ${r.ms} ms`); }
  ctl.ai.delay = 0; ctl.ai.mode = "hang"; { const r = await fresh(); const ms = r.ms; t(SA, "AI mock hangs: unavailable 'did not answer in time', and the whole health request returns within the 4 s limit + margin", comp(r, "ai").status === "unavailable" && /in time/.test(comp(r, "ai").summary) && ms < 6000, `${ms} ms ${comp(r, "ai").summary}`); }
  ctl.ai.mode = "ok"; { const r = await fresh(); t(SA, "AI recovers: healthy again after the provider answers", comp(r, "ai").status === "healthy" && r.d.overall.status === "healthy"); }

  // ============ SMTP ============
  ctl.smtp.mode = "reject"; { const r = await fresh(); t(["SA-TC-057", "SA-TC-054"], "SMTP login refused: email unavailable, platform degraded", comp(r, "email").status === "unavailable" && r.d.overall.status === "degraded", comp(r, "email").summary); t(SA, "SMTP failure evidence carries no password", !JSON.stringify(r.j).includes("VERY-SECRET")); }
  ctl.smtp.mode = "hang"; { const r = await fresh(); t(SA, "SMTP server hangs: unavailable within the limit", comp(r, "email").status === "unavailable" && /in time/.test(comp(r, "email").summary) && r.ms < 6500, `${r.ms} ms`); }
  ctl.smtp.mode = "closed"; smtpSrv.close(); for (const s of smtpSockets) s.destroy(); { const r = await fresh(); t(SA, "SMTP server closed (connection refused): unavailable", comp(r, "email").status === "unavailable", comp(r, "email").summary); }
  await new Promise((res) => smtpSrv.listen(smtpPort, "127.0.0.1", res)); ctl.smtp.mode = "ok"; { const r = await fresh(); t(SA, "SMTP recovers: healthy again", comp(r, "email").status === "healthy"); }
  t(SA, "through every SMTP scenario no mail was ever submitted to the mock server", ctl.smtp.mailCommands === 0);

  // ============ email delivery history (real tables, synthetic rows) ============
  const col = (await rows(`select "collegeId" c from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL]))[0].c;
  const ins = (status, ago, err, to) => rows(`insert into "MessageLog" (id,"collegeId",purpose,subject,"recipientEmail",status,error,"createdAt") values (gen_random_uuid(),$1,'g3-monitor','s',$2,$3::"MessageStatus",$4, now() - ($5 || ' minutes')::interval)`, [col, to, status, err, String(ago)]);
  await ins("SENT", 30, null, `recipient-ok-${tag}@example.org`); await ins("SENT", 90, null, `recipient-ok2-${tag}@example.org`);
  { const r = await fresh(); const h = comp(r, "email").details.history; t(["SA-TC-057"], "email history: sent count and last successful delivery are read from the delivery logs", h.available && h.sent24h >= 2 && !!h.lastSentAt && comp(r, "email").status === "healthy" && /Last successful delivery/.test(comp(r, "email").evidence.join()), JSON.stringify(h)); }
  await rows(`insert into "MessageLog" (id,"collegeId",purpose,subject,"recipientEmail",status,error,"createdAt") select gen_random_uuid(), $1, 'g3-monitor', 's', 'bulkfail' || g || '@school.edu', 'FAILED', '550 bulk', now() - interval '20 minutes' from generate_series(1, (select count(*) from "MessageLog" where status::text = 'SENT' and "createdAt" > now() - interval '24 hours')::int + (select count(*) from "InvitationEmailLog" where status::text = 'SENT' and "createdAt" > now() - interval '24 hours')::int + 50) g`, [col]);
  for (let i = 0; i < 6; i++) await ins("FAILED", 5 + i, `550 mailbox unavailable for victim${i}-${tag}@school.edu via smtp://user:pw@mail.example.com`, `victim${i}-${tag}@school.edu`);
  { const r = await fresh(); const e = comp(r, "email"); t(["SA-TC-057"], "email history: mostly failed deliveries make a reachable mail server DEGRADED, with the last failure shown", e.status === "degraded" && e.details.history.failed24h >= 6 && !!e.details.history.lastFailureAt, e.status + " " + JSON.stringify(e.details.history).slice(0, 200));
    t(["SA-TC-057", "SA-TC-056"], "email failure detail is scrubbed: no recipient address and no credentials in the response", !/victim\d-/.test(JSON.stringify(r.j)) && !/recipient-ok/.test(JSON.stringify(r.j)) && !/user:pw/.test(JSON.stringify(r.j)), JSON.stringify(e.details.history.lastFailure)); }
  await rows(`delete from "MessageLog" where purpose='g3-monitor'`);

  // ============ storage ============
  ctl.storage.mode = "500"; { const r = await fresh(); t(["SA-TC-056"], "storage returns 500: unavailable and the platform is unavailable (storage is core)", comp(r, "storage").status === "unavailable" && r.d.overall.status === "unavailable", comp(r, "storage").summary); t(["SA-TC-056"], "storage error detail is scrubbed (the connection string in the provider's message is not shown)", !/pw77/.test(JSON.stringify(r.j))); }
  ctl.storage.mode = "hang"; { const r = await fresh(); t(SA, "storage hangs: unavailable within the limit", comp(r, "storage").status === "unavailable" && /in time/.test(comp(r, "storage").summary) && r.ms < 6000, `${r.ms} ms`); }
  ctl.storage.mode = "empty"; { const r = await fresh(); t(SA, "storage answers but the required bucket is missing: degraded and names the bucket", comp(r, "storage").status === "degraded" && /student-documents/.test(comp(r, "storage").evidence.join()), comp(r, "storage").summary); }
  ctl.storage.mode = "ok"; { const r = await fresh(); t(SA, "storage recovers: healthy", comp(r, "storage").status === "healthy" && r.d.overall.status === "healthy"); }

  // ============ background jobs (bulk imports) ============
  const adm = (await rows(`select id from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL]))[0].id;
  const imp = (await rows(`insert into "ImportJob" (id,"collegeId","createdById","fileName",status,"totalRows","createdAt") values (gen_random_uuid(),$1,$2,'g3-monitor.csv','PROCESSING',5, now() - interval '40 minutes') returning id`, [col, adm]))[0].id;
  { const r = await fresh(); const bj = comp(r, "backgroundJobs"); t(["SA-TC-055"], "a bulk import stuck in PROCESSING for 40 min makes background jobs degraded and the platform degraded", bj.status === "degraded" && bj.details.imports.stuck >= 1 && r.d.overall.status === "degraded", bj.summary); t(["SA-TC-055"], "background jobs state that no general queue exists (no invented retry counts)", /no general job queue/.test(bj.evidence.join())); }
  await rows(`update "ImportJob" set status='COMPLETED', "completedAt"=now() where id=$1`, [imp]);
  { const r = await fresh(); t(["SA-TC-055"], "after the import completes, background jobs are healthy again", comp(r, "backgroundJobs").status === "healthy"); }
  await rows(`delete from "ImportJob" where "fileName"='g3-monitor.csv'`);

  // ============ errors: real 5xx recorded with request id, scrubbed, paged ============
  const wasOn = (await rows(`select "aiDocumentReading" a from "CollegeSettings" where "collegeId"=$1`, [col]))[0]?.a; aiReadingBefore = !!wasOn; seedCollege = col; await rows(`update "CollegeSettings" set "aiDocumentReading"=true where "collegeId"=$1`, [col]);
  const staff = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD), BASE);
  const jd = await staff("POST", "/api/jds", { source: "PASTE", title: "Monitor JD", text: "We need a developer who knows SQL. ".repeat(10) });
  ctl.ai.chat = "fail";
  const jdId = jd.d?.id ?? jd.d?.jd?.id;
  const rid = `mon-req-${tag}`;
  let aiRes = null;
  if (jdId) aiRes = await fetch(BASE + `/api/jds/${jdId}/extract`, { method: "POST", headers: { authorization: "Bearer " + (await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD)), "x-request-id": rid, "content-type": "application/json" }, body: "{}" });
  t(["SA-TC-056"], "a real AI failure (mock provider answers 500) surfaces to the caller as a clean 502 without provider details", !!aiRes && aiRes.status === 502 && !/sk-mocksecret|mock provider failure/.test(await aiRes.clone().text()), `jd ${JSON.stringify(jd.j).slice(0, 120)} -> ${aiRes?.status}`);
  await sleep(500);   // the durable copy is written just after the response
  const E1 = await P("GET", "/api/platform/monitoring/errors?pageSize=100");
  const ai502 = E1.d.items.find((e) => e.requestId === rid);
  t(["SA-TC-056"], "API error logging: the failure appears with request id, service 'ai', status 502, code AI_FAILED, method, path and time", !!ai502 && ai502.service === "ai" && ai502.status === 502 && ai502.code === "AI_FAILED" && ai502.method === "POST" && /\/api\/jds\/.+\/extract/.test(ai502.path) && !!ai502.at, JSON.stringify(ai502));
  t(["SA-TC-056"], "the error record holds a safe message only: no provider body, key or stack", !!ai502 && !/sk-mocksecret|mock provider|at \w+ \(|node_modules/.test(JSON.stringify(E1.j)));
  const mm = await fresh(); t(["SA-TC-056"], "AI tally: the real failed call is counted in the AI component (calls, failures) with no prompt data", comp(mm, "ai").details.stats.failures >= 1 && comp(mm, "ai").details.stats.calls >= 1 && !JSON.stringify(comp(mm, "ai")).includes("developer who knows SQL"));
  t(["SA-TC-056"], "the error counts feed the errors component (degraded after a 5xx within 15 minutes)", comp(mm, "errors").status === "degraded" && comp(mm, "errors").details.counts.last15Minutes >= 1, comp(mm, "errors").summary);
  { const ec = (await fresh()); const cnt = comp(ec, "errors").details.counts; t(["SA-TC-056"], "error summaries: counts by service, by status and by endpoint are shown and match what was caused", cnt.byStatusLastHour.some((x) => x.key === "502" && x.count >= 1) && cnt.byRouteLastHour.some((x) => /^POST \/api\/jds\/:id\/extract$/.test(x.key) && x.count >= 1) && cnt.byServiceLastHour.ai >= 1 && /By status/.test(comp(ec, "errors").evidence.join()), JSON.stringify(cnt)); }
  ctl.ai.chat = "ok"; await rows(`update "CollegeSettings" set "aiDocumentReading"=$2 where "collegeId"=$1`, [col, !!wasOn]);
  const f1 = await P("GET", "/api/platform/monitoring/errors?service=ai"), f2 = await P("GET", "/api/platform/monitoring/errors?service=database"), f3 = await P("GET", `/api/platform/monitoring/errors?q=${rid}`), f4 = await P("GET", "/api/platform/monitoring/errors?q=zzz-none");
  t(["SA-TC-056"], "errors: filter by service, by request id, and no match gives an empty page", f1.d.total >= 1 && f1.d.items.every((e) => e.service === "ai") && f2.d.total === 0 && f3.d.total === 1 && f4.d.total === 0 && f4.d.items.length === 0 && f4.d.totalPages === 1);
  t(["SA-TC-056"], "errors: the response says it is the durable record (all instances, 14 days) with the retained count and the oldest entry", E1.d.durable === true && E1.d.retentionDays === 14 && typeof E1.d.retained === "number" && !!E1.d.since);
  { const row = (await rows(`select * from "MonitorEvent" where "requestId"=$1`, [rid]))[0];
    t(["SA-TC-056"], "durable error record: the 502 is in the MonitorEvent table exactly as the API shows it (service, status, code, method, cleaned path, request id)", !!row && row.service === "ai" && row.status === 502 && row.code === "AI_FAILED" && row.method === "POST" && /\/api\/jds\/:id\/extract/.test(row.path) && row.path === ai502.path && row.message === ai502.message, JSON.stringify(row)); }
  { // 'AI_FAILED' is in the record. If % or _ were wildcards, 'A%D' and 'AI_FAILE_' would match it; as plain characters they must not.
    const q = (x) => P("GET", "/api/platform/monitoring/errors?q=" + encodeURIComponent(x));
    const pct = await q("A%D"), und = await q("AI_FAILE_"), exact = await q("AI_FAILED"), low = await q("ai_failed"), lone = await q("%");
    t(["SA-TC-056"], "error search treats % and _ as plain characters ('A%D', 'AI_FAILE_' and '%' match nothing) while the real text 'AI_FAILED' matches, case-insensitively", pct.d.total === 0 && und.d.total === 0 && lone.d.total === 0 && exact.d.total >= 1 && low.d.total === exact.d.total, `${pct.d.total} ${und.d.total} ${lone.d.total} ${exact.d.total} ${low.d.total}`); }
  t(["SA-TC-056"], "errors: date filters work and from-after-to is refused", (await P("GET", "/api/platform/monitoring/errors?from=2031-01-01")).d.total === 0 && (await P("GET", "/api/platform/monitoring/errors?to=2031-01-01")).d.total >= 1 && (await P("GET", "/api/platform/monitoring/errors?from=2031-02-01&to=2031-01-01")).s === 400);

  // ============ database: slow, down, recovery (via the proxy; the real database is untouched) ============
  ctl.pg.delay = 700; { const r = await fresh(); t(["SA-TC-054"], "database slowed by 700 ms per round trip: degraded (answers, but slowly)", r.s === 200 && comp(r, "database").status === "degraded" && comp(r, "database").latencyMs >= 500, r.s === 200 ? comp(r, "database").status + " " + comp(r, "database").latencyMs : `HTTP ${r.s}`); }
  ctl.pg.delay = 0;
  { const r = await fresh(); t(["SA-TC-054"], "database back to normal: healthy", comp(r, "database").status === "healthy"); }
  pgDown();
  { const t0 = Date.now(); const live = await fetch(BASE + "/api/health/live"); const ready = await fetch(BASE + "/api/health/ready"); const old = await fetch(BASE + "/api/health"); const ms = Date.now() - t0;
    const rb = await ready.text(), ob = await old.text();
    t(["SA-TC-054"], "database DOWN: liveness stays 200 (the process is alive) while readiness is 503 'unavailable' and the legacy /api/health is 503", live.status === 200 && ready.status === 503 && JSON.parse(rb).status === "unavailable" && old.status === 503, `${live.status}/${ready.status}/${old.status}`);
    t(["SA-TC-054"], "database DOWN: readiness answers within its bound (2 s) and shows no detail to an unauthenticated caller", ms < 4500 && Object.keys(JSON.parse(rb)).join() === "status" && !/postgres|127\.0\.0\.1|ECONN|database/i.test(rb + ob.replace(/"db":"down"/, "")), `${ms} ms ${rb}`); }
  const dbErr = await P("GET", "/api/platform/monitoring");
  const dbErrRaw = await fetch(BASE + "/api/platform/monitoring", { headers: { authorization: "Bearer " + tok } }); const dbErrTxt = await dbErrRaw.text();
  t(["SA-TC-054"], "database DOWN: the monitoring dashboard API answers a clear 503 DATABASE_UNAVAILABLE with a retry hint (not a vague 500, not 200); the dashboard shows this as a connection failure", dbErr.s === 503 && dbErr.code === "DATABASE_UNAVAILABLE" && dbErrRaw.status === 503 && dbErrRaw.headers.get("retry-after") === "5" && !!JSON.parse(dbErrTxt).error.requestId, `HTTP ${dbErr.s} ${dbErr.code}`);
  t(["SA-TC-054", "SA-TC-056"], "database DOWN: that response reveals nothing (no host, port, credential, driver text, stack or health data)", !/postgres|127\.0\.0\.1|ECONN|prisma|stack|node_modules|password|components|overall|\d{4,5}/i.test(dbErrTxt.replace(/"requestId":"[^"]*"/, "")), dbErrTxt.slice(0, 200));
  // NO AUTHENTICATION BYPASS: with the database down no credential of any kind gets platform data
  { const kinds = [["valid second-step token", (p) => fetch(BASE + p, { headers: { authorization: "Bearer " + tok } })], ["password-only token", (p) => aal1("GET", p).then((r) => ({ status: r.s }))], ["no-authenticator token", (p) => noMfa("GET", p).then((r) => ({ status: r.s }))], ["no token", (p) => fetch(BASE + p)], ["garbage token", (p) => fetch(BASE + p, { headers: { authorization: "Bearer not.a.token" } })]];
    const got = []; for (const [n, f] of kinds) for (const p of ["/api/platform/monitoring", "/api/platform/monitoring/errors", "/api/platform/monitoring/jobs"]) { const r = await f(p); got.push([n, p, r.status]); }
    t(["SA-TC-054", "SRS-SECURITY-TC-022"], "database DOWN, NO AUTH BYPASS: not one credential kind (valid, password-only, no authenticator, none, garbage) receives platform data on any monitoring route - all are refused (401, 403 or 503)", got.every(([, , st]) => [401, 403, 503].includes(st)), JSON.stringify(got.filter(([, , st]) => ![401, 403, 503].includes(st))));
    t(["SA-TC-054", "SRS-SECURITY-TC-022"], "database DOWN: the valid token is answered 503 (service unavailable), never treated as 'still signed in' and never given a degraded dashboard", got.filter(([n]) => n === "valid second-step token").every(([, , st]) => st === 503) && got.filter(([n]) => ["no token", "garbage token"].includes(n)).every(([, , st]) => st === 401), JSON.stringify(got)); }
  const burst = []; for (let i = 0; i < 40; i++) burst.push(fetch(BASE + "/api/platform/monitoring", { headers: { authorization: "Bearer " + tok } }).then((r) => r.status));
  const burstS = await Promise.all(burst); t(["SA-TC-054"], "database DOWN: 40 simultaneous monitoring requests all fail cleanly (503) and none hangs", burstS.every((s) => s === 503), burstS.join(","));
  const jobDown = await fetch(BASE + "/api/notifications/reminders/run", { headers: { ...CRON, "x-request-id": `mon-job-${tag}` } });
  t(["SA-TC-055"], "a scheduled job that fails because the database is down returns a clean 5xx (and, honestly, cannot be recorded: the history lives in that database)", jobDown.status >= 500 && !/postgres|127\.0\.0\.1|prisma/i.test(await jobDown.text()), `HTTP ${jobDown.status}`);
  const tUp = Date.now(); pgUp();
  let readyMs = null, readyS = null; for (let i = 0; i < 30; i++) { const rr = await fetch(BASE + "/api/health/ready"); readyS = rr.status; await rr.arrayBuffer(); if (rr.status === 200) { readyMs = Date.now() - tUp; break; } await sleep(500); }
  t(["SA-TC-054"], "database back: readiness returns to 200 'ready' without restarting the app, within its bound (2 s check + 5 s cache)", readyS === 200 && readyMs !== null && readyMs <= 7500, `${readyMs} ms`);
  { const r = await fresh(); t(["SA-TC-054"], "database back: the dashboard works again, shows the database healthy, and the first request after recovery succeeds (the connection pool recovered by itself)", r.s === 200 && comp(r, "database").status === "healthy", `HTTP ${r.s}`); }
  // the errors raised during the outage are written once the database answers again (bounded queue, flushed after the pause)
  let E2 = null, jobErr = null, nDb = 0; for (let i = 0; i < 60; i++) { E2 = await P("GET", "/api/platform/monitoring/errors?pageSize=100&page=1"); jobErr = E2.d?.items?.find((e) => e.requestId === `mon-job-${tag}`); nDb = (E2.d?.items ?? []).filter((e) => e.service === "database" && e.code === "DATABASE_UNAVAILABLE").length; if (jobErr && nDb >= 40) break; await sleep(1000); }
  t(["SA-TC-055", "SA-TC-056"], "the failed scheduled job is in the durable error list with its endpoint and request id (written after the outage), and its message has no host, address or credentials", !!jobErr && /\/api\/notifications\/reminders\/run/.test(jobErr.path) && !/127\.0\.0\.1|postgres|:\d{4,5}|password/i.test(JSON.stringify(E2.j)), JSON.stringify(jobErr));
  t(["SA-TC-054", "SA-TC-056"], "database errors raised during the outage are recorded as service 'database', 503, DATABASE_UNAVAILABLE and survive the outage (>= 40 of the 41 requests), newest first", nDb >= 40 && E2.d.items.every((e, i, a) => i === 0 || new Date(a[i - 1].at) >= new Date(e.at)), `${nDb} database entries of ${E2.d?.items?.length}`);
  { const p1 = await P("GET", "/api/platform/monitoring/errors?pageSize=20&page=1"), p2 = await P("GET", "/api/platform/monitoring/errors?pageSize=20&page=2"), pLast = await P("GET", `/api/platform/monitoring/errors?pageSize=20&page=${p1.d.totalPages}`), pBeyond = await P("GET", `/api/platform/monitoring/errors?pageSize=20&page=${p1.d.totalPages + 5}`);
    const ids = new Set([...p1.d.items, ...p2.d.items].map((e) => e.id));
    t(["SA-TC-056"], "errors: paging returns distinct pages, a last page, and an empty page past the end with the right total", p1.d.items.length === 20 && p2.d.items.length === 20 && ids.size === 40 && pLast.d.items.length >= 1 && pBeyond.s === 200 && pBeyond.d.items.length === 0 && pBeyond.d.total === p1.d.total, `${p1.d.total} total, ${p1.d.totalPages} pages`); }

  // ============ refresh behaviour and load protection ============
  const k1 = await fresh(), k2 = await mon(), k3 = await mon("refresh=1");
  t(["SA-TC-054"], "refresh: a normal request within 15 s returns the shared result (same check time, cached)", k2.d.cached === true && k2.d.checkedAt === k1.d.checkedAt);
  t(["SA-TC-054"], "refresh: a forced refresh within 5 s of the last one is refused with throttled=true and the current result", k3.d.throttled === true && k3.d.checkedAt === k1.d.checkedAt);
  { const before = { ai: ctl.ai.probes, smtp: ctl.smtp.connections, st: ctl.storage.calls }; await sleep(5300); const many = await Promise.all(Array.from({ length: 30 }, () => mon("refresh=1"))); const checks = new Set(many.map((r) => r.d.checkedAt)); const performed = many.filter((r) => r.d.throttled === false).length, throttledN = many.filter((r) => r.d.throttled === true).length;
    const used = { ai: ctl.ai.probes - before.ai, smtp: ctl.smtp.connections - before.smtp };
    t(["SA-TC-054"], "load protection: 30 simultaneous forced refreshes cause ONE round of checks (one AI probe, one SMTP connection): one request performs it and the other 29 are throttled and get the current result", performed === 1 && throttledN === 29 && used.ai === 1 && used.smtp === 1 && many.every((r) => r.s === 200), `performed ${performed}, throttled ${throttledN}, ai probes ${used.ai}, smtp connections ${used.smtp}, distinct results ${checks.size}`); lastForced = Date.now(); }
  for (const bad of ["refresh=2", "refresh=yes", "x=1", "refresh=1&x=1", "refresh="]) { const r = await mon(bad); t(SA, `invalid parameter refused (400, no leak): ${bad}`, r.s === 400 && !/prisma|SELECT|stack|constraint/i.test(JSON.stringify(r.j)), `HTTP ${r.s}`); }
  for (const bad of ["service=kernel", "service=AI", "page=0", "page=x", "pageSize=0", "pageSize=101", "q=" + "x".repeat(101), "from=yesterday", "to=31-31-2026"]) { const r = await P("GET", "/api/platform/monitoring/errors?" + bad); t(["SA-TC-056"], `errors: invalid parameter refused (400): ${bad.slice(0, 30)}`, r.s === 400 && !/prisma|stack/i.test(JSON.stringify(r.j)), `HTTP ${r.s}`); }

  // ============ secret masking over everything the API returns ============
  const full = JSON.stringify([(await fresh()).j, (await P("GET", "/api/platform/monitoring/errors?pageSize=100")).j]);
  const SECRETS = [env.GROQ_API_KEY, env.SMTP_PASS, env.CRON_SECRET, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ANON_KEY, "postgres:postgres", dbUrl, tok, "sk-mocksecret", "pw77", "pw@", `127.0.0.1:${pgPort}`, `127.0.0.1:${supaPort}`, `127.0.0.1:${aiPort}`, `127.0.0.1:${smtpPort}`, "mock-user"];
  const leaked = SECRETS.filter((x) => x && full.includes(x));
  t(["SA-TC-057", "SRS-SECURITY-TC-035", "SRS-SECURITY-TC-043"], "secret masking: no API key, SMTP password/user, cron secret, service key, database URL or password, token, or internal host:port appears anywhere in the monitoring responses", leaked.length === 0, `leaked: ${leaked.join(" | ")}`);
  t(["SA-TC-057", "SRS-SECURITY-TC-035"], "no stack trace, file path or private student/staff data appears in the monitoring responses", !/\bat \w+ \(|node_modules|\/home\/|\.ts:\d+|@example\.com/.test(full.replace(new RegExp(emailA.replace(/[.+]/g, "\\$&"), "g"), "")), full.match(/.{30}(\bat \w+ \(|node_modules|\/home\/|\.ts:\d+|@example\.com).{20}/)?.[0] ?? "");

  // The same sweep over what is STORED (every row and column of both monitoring tables, and the job-history API), not only over what is shown.
  { const tblText = JSON.stringify([await rows(`select * from "JobRun"`), await rows(`select * from "MonitorEvent"`)]) + JSON.stringify((await P("GET", "/api/platform/monitoring/jobs?pageSize=100")).j);
    const stored = (await rows(`select (select count(*)::int from "JobRun") j, (select count(*)::int from "MonitorEvent") e`))[0];
    const leakedDb = SECRETS.filter((x) => x && tblText.includes(x));
    t(["SA-TC-055", "SA-TC-057", "SRS-SECURITY-TC-035", "SRS-SECURITY-TC-043"], `secret masking in the DATABASE: no key, password, cron secret, service key, database URL, token or internal host:port is stored in any of the ${stored.j} JobRun and ${stored.e} MonitorEvent rows`, stored.j >= 5 && stored.e >= 1 && leakedDb.length === 0, `leaked: ${leakedDb.join(" | ")}`);
    const stripped = tblText.replaceAll(tag, "TAG").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "UUID").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "TS");
    const pii = stripped.match(/[\w.+-]+@[\w-]+\.[\w.]+|\b\d{7,}\b|Bearer\s+\S+|eyJ[\w-]{8,}\.[\w-]{8,}|ravi\.kumar|9876543210|Ravi Kumar/i);
    t(["SA-TC-055", "SA-TC-057", "SRS-SECURITY-TC-035"], "no student or staff data stored: no e-mail address, phone-length number, bearer token, JWT, or the student details quoted by the database error appear in any JobRun or MonitorEvent row", !pii, pii ? `found: ${pii[0]}` : ""); }

  // ============ access control ============
  const colAdmin =client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD), BASE);
  const S = await makeStudents(colAdmin, 1, "MON"); const stu = client(S.tokens.A, BASE);
  const co = (await rows(`insert into "Company" (id,"collegeId",name,"updatedAt") values (gen_random_uuid(),$1,$2,now()) returning id`, [col, `Mon Co ${tag}`]))[0].id; made.co.push(co);
  const { data: ru } = await sb.auth.admin.createUser({ email: `g3monrec${tag}@example.com`, password: pw, email_confirm: true });
  await rows(`insert into "Recruiter" (id,"collegeId","companyId",email,name) values ($1,$2,$3,$4,'Mon Rec')`, [ru.user.id, col, co, `g3monrec${tag}@example.com`]); made.rec.push(ru.user.id);
  const rec = client(await login(`g3monrec${tag}@example.com`, pw), BASE);
  const mkStaff = async (label, role) => { const email = `g3mon${label}${tag}@example.com`; const { data } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true }); await rows(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values ($1,$2,$3,$4,$5::"Role",'{}',now())`, [data.user.id, col, email, "Mon " + label, role]); made.users.push(data.user.id); return client(await login(email, pw), BASE); };
  const paths = ["/api/platform/monitoring", "/api/platform/monitoring?refresh=1", "/api/platform/monitoring/errors", "/api/platform/monitoring/errors?service=ai&q=x", "/api/platform/monitoring/jobs", "/api/platform/monitoring/jobs?outcome=failed"];
  const who = [["anonymous", (p) => fetch(BASE + p).then((r) => ({ s: r.status }))], ["institution administrator (Head TPO)", (p) => colAdmin("GET", p)], ["student", (p) => stu("GET", p)], ["recruiter", (p) => rec("GET", p)], ["platform admin, password only (second step incomplete)", (p) => aal1("GET", p)], ["platform admin, no authenticator", (p) => noMfa("GET", p)]];
  const probesBefore = { ai: ctl.ai.probes, smtp: ctl.smtp.connections };
  for (const [n, f] of who) for (const p of paths) { const r = await f(p); const okk = n === "anonymous" ? r.s === 401 : n.includes("password only") ? r.s === 403 && r.code === "MFA_REQUIRED" : n.includes("no authenticator") ? r.s === 403 && r.code === "MFA_SETUP_REQUIRED" : r.s === 403; t(ACC, `${n} is refused on ${p.replace(/\?.*/, "")}`, okk && !/components|overall|healthy|evidence/.test(JSON.stringify(r.j ?? "")), `HTTP ${r.s} ${r.code ?? ""}`); }
  for (const [label, role] of [["officer", "PLACEMENT_OFFICER"], ["coord", "DEPARTMENT_COORDINATOR"], ["faculty", "FACULTY"], ["principal", "PRINCIPAL"]]) { const c = await mkStaff(label, role); t(ACC, `college ${label} is refused on the monitoring and error routes`, (await c("GET", "/api/platform/monitoring")).s === 403 && (await c("GET", "/api/platform/monitoring/errors")).s === 403 && (await c("GET", "/api/platform/monitoring/jobs")).s === 403); }
  t(ACC, "refused callers cannot trigger any dependency check (no provider, SMTP or storage call was made for them)", ctl.ai.probes === probesBefore.ai && ctl.smtp.connections === probesBefore.smtp, `${ctl.ai.probes - probesBefore.ai} AI probes, ${ctl.smtp.connections - probesBefore.smtp} SMTP connections`);
  // unauthenticated health endpoints reveal nothing
  const lv = await (await fetch(BASE + "/api/health/live")).text(), rd = await (await fetch(BASE + "/api/health/ready")).text(), lg = await (await fetch(BASE + "/api/health")).text();
  t(["SA-TC-054", "SRS-SECURITY-TC-035"], "unauthenticated health endpoints reveal no configuration, versions, hosts or dependency names", lv === '{"status":"alive"}' && JSON.parse(rd).status === "ready" && Object.keys(JSON.parse(rd)).join() === "status" && !/postgres|supabase|smtp|groq|version|build|node|127\.0\.0\.1/i.test(lv + rd + lg), `${lv} ${rd} ${lg}`);
  // read-only and cache headers
  const wr = []; for (const m of ["POST", "PUT", "PATCH", "DELETE"]) for (const p of ["/api/platform/monitoring", "/api/platform/monitoring/errors", "/api/platform/monitoring/jobs"]) { const r = await P(m, p, m === "DELETE" ? undefined : {}); if (r.s !== 405) wr.push(`${m} ${p} ${r.s}`); const a = await fetch(BASE + p, { method: m }); if (a.status >= 200 && a.status < 300) wr.push(`anon ${m} ${p}`); }
  t(ACC, "monitoring is read-only: POST, PUT, PATCH and DELETE give 405 (and never succeed anonymously)", wr.length === 0, wr.join("; "));
  { const r = await fetch(BASE + "/api/platform/monitoring", { headers: { authorization: "Bearer " + tok } }); const cc = r.headers.get("cache-control") ?? ""; await r.arrayBuffer(); const r2 = await fetch(BASE + "/api/platform/monitoring/errors", { headers: { authorization: "Bearer " + tok } }); const cc2 = r2.headers.get("cache-control") ?? ""; await r2.arrayBuffer();
    t(ACC, "monitoring and error responses are not cacheable", r.status === 200 && /no-store|no-cache|private/.test(cc) && /no-store|no-cache|private/.test(cc2), `${cc} | ${cc2}`); }
  t(["SRS-SECURITY-TC-035"], "the platform administrator's own token never appears in a response", !JSON.stringify((await mon()).j).includes(tok));

  // ============ application performance (SA-TC-008) ============
  { const pr = await fresh(); const hasLatency = pr.d.components.some((c) => c.details && ("requestLatency" in c.details || "latencyByRoute" in c.details || "requests" in c.details)) || "requestMetrics" in pr.d;
    // The SRS says only "Monitor application performance" (3.1) and, in section 9, that common dashboard operations should normally respond within about 2-3 seconds. It does not define
    // request-latency or throughput metrics. Adding them is a scope decision that has not been approved, so this is recorded BLOCKED (never passed) and nothing is claimed without evidence.
    if (hasLatency) t(["SA-TC-008"], "application request latency and throughput per endpoint are shown", true);
    else R.blocked(["SA-TC-008"], "request latency and throughput per endpoint are shown", "Agreed scope (2026-11-11): the SRS names no latency or throughput metric (3.1 'Monitor application performance'; 9 'common dashboard operations ... approximately 2-3 seconds'). Request performance is observed with Vercel Observability (several independent function instances make in-memory metrics unreliable); this dashboard covers health, dependencies, jobs and errors. Blocked pending formal clarification or integration of performance monitoring; not passed.", "G3-SYS-09"); }
  t(["SA-TC-008"], "dependency latencies are measured and shown for the database, storage, AI and email checks", ["database", "storage", "ai", "email"].every((k) => typeof comp(b, k).latencyMs === "number"));
  // ============ performance and large history ============
  const timeIt = async (name, fn, n = 7) => { const ts = []; let last; for (let i = 0; i < n; i++) { const t0 = performance.now(); last = await fn(); ts.push(performance.now() - t0); } timings.push({ name, medianMs: Math.round(med(ts)), maxMs: Math.round(Math.max(...ts)), runs: n }); return last; };
  await sleep(5300);
  await timeIt("GET /api/health/live", () => fetch(BASE + "/api/health/live").then((r) => r.arrayBuffer()), 20);
  await timeIt("GET /api/health/ready (cached 5 s)", () => fetch(BASE + "/api/health/ready").then((r) => r.arrayBuffer()), 20);
  await timeIt("GET /api/platform/monitoring (shared result)", () => mon(), 20);
  { const ts = []; for (let i = 0; i < 5; i++) { await sleep(Math.max(0, lastForced + 5200 - Date.now())); const t0 = performance.now(); await mon("refresh=1"); ts.push(performance.now() - t0); lastForced = Date.now(); } timings.push({ name: "GET /api/platform/monitoring?refresh=1 (all dependencies checked, mocks local)", medianMs: Math.round(med(ts)), maxMs: Math.round(Math.max(...ts)), runs: 5 }); }
  await timeIt("GET /api/platform/monitoring/errors (page of 25)", () => P("GET", "/api/platform/monitoring/errors?pageSize=25"), 20);
  await timeIt("GET /api/platform/monitoring/jobs (page of 25)", () => P("GET", "/api/platform/monitoring/jobs?pageSize=25"), 20);
  // large delivery history: 120,000 synthetic message-log rows, then one forced check
  await rows(`insert into "MessageLog" (id,"collegeId",purpose,subject,"recipientEmail",status,error,"createdAt") select gen_random_uuid(), $1, 'g3-monitor-bulk', 's', 'x' || g || '@example.org', (case when g % 10 = 0 then 'FAILED' else 'SENT' end)::"MessageStatus", case when g % 10 = 0 then 'bulk failure' end, now() - ((g % 40000) || ' minutes')::interval from generate_series(1,120000) g`, [col]);
  await pgc.query("analyze \"MessageLog\"");
  const sizes = (await rows(`select count(*)::int n from "MessageLog"`))[0].n;
  await sleep(Math.max(0, lastForced + 5200 - Date.now())); const bigT0 = performance.now(); const big = await mon("refresh=1"); lastForced = Date.now(); const bigMs = Math.round(performance.now() - bigT0);
  timings.push({ name: `GET /api/platform/monitoring?refresh=1 with ${sizes} delivery-log rows`, medianMs: bigMs, maxMs: bigMs, runs: 1 });
  const bh = comp(big, "email").details.history; const dbCnt = (await rows(`select (count(*) filter (where status='SENT'))::int s, (count(*) filter (where status='FAILED'))::int f from (select status::text status from "MessageLog" where "createdAt" > now() - interval '24 hours' union all select status::text from "InvitationEmailLog" where "createdAt" > now() - interval '24 hours') x`))[0];
  t(["SA-TC-057"], `large delivery history (${sizes} rows): the dashboard's 24 h sent and failed counts equal an independent SQL count`, Math.abs(bh.sent24h - dbCnt.s) <= 10 && Math.abs(bh.failed24h - dbCnt.f) <= 10 && big.s === 200, `${JSON.stringify(bh)} vs ${JSON.stringify(dbCnt)}`);
  await rows(`delete from "MessageLog" where purpose='g3-monitor-bulk'`);
  const worst = Math.max(...timings.filter((x) => !/refresh=1 \(all/.test(x.name) && !/delivery-log/.test(x.name)).map((x) => x.medianMs));
  t(SA, `performance: shared-result, liveness, readiness and error-list calls each answer in under 500 ms (worst median ${worst} ms); a forced full check stays inside the provider limits; all measured, see results/g3-08-timings.json`, worst < 500 && timings.find((x) => /refresh=1 \(all/.test(x.name)).maxMs < 4500 && bigMs < 6000, JSON.stringify(timings));
  writeFileSync(fileURLToPath(new URL("./results/g3-08-timings.json", import.meta.url)), JSON.stringify({ note: "Median and maximum of sequential requests per call, production build on port 3114, local Docker Postgres/Auth, mocks for SMTP/AI/storage on loopback. Measured, not estimated. Mock providers answer instantly, so a forced full check here shows the application's own overhead, not real network latency.", timings }, null, 1));
} finally {
  stopApp(); pgDown(); smtpSrv.close(); aiSrv.close(); supaSrv.close(); pgSrv.close(); for (const s of [...smtpSockets, ...pgSockets]) s.destroy();
  // If the run was cut short while a table was swapped out for a failure scenario, put everything back (local test database only).
  await pgc.query(`do $$ begin
    if to_regclass('"CollegeModule_off"') is not null then drop view if exists "CollegeModule"; alter table "CollegeModule_off" rename to "CollegeModule"; end if;
    if to_regclass('"JobRun_off"') is not null then alter table "JobRun_off" rename to "JobRun"; end if;
  end $$`).catch(() => 0);
  await pgc.query(`drop trigger if exists g3_slow on "JobRun"`).catch(() => 0);
  await pgc.query(`drop function if exists g3_slow_jobrun()`).catch(() => 0);
  await pgc.query(`drop function if exists g3_leak()`).catch(() => 0);
  await pgc.query(`delete from "JobRun"`).catch(() => 0);
  await pgc.query(`delete from "MonitorEvent"`).catch(() => 0);
  await pgc.query(`delete from "MessageLog" where purpose like 'g3-monitor%'`).catch(() => 0);
  if (seedCollege) await pgc.query(`update "CollegeSettings" set "aiDocumentReading"=$2 where "collegeId"=$1`, [seedCollege, aiReadingBefore]).catch(() => 0);
  await pgc.query(`delete from "ImportJob" where "fileName"='g3-monitor.csv'`).catch(() => 0);
  await pgc.query(`delete from "JobDescription" where title='Monitor JD'`).catch(() => 0);
  await pgc.query(`delete from "Recruiter" where email like $1`, [`g3monrec${tag}%`]).catch(() => 0);
  await pgc.query(`delete from "Company" where name=$1`, [`Mon Co ${tag}`]).catch(() => 0);
  await pgc.end();
}
process.exit(R.done() ? 1 : 0);

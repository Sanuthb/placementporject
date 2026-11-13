// Gate 4 WP-01 (test harness and fixtures): the four platform cases that were Blocked for want of a harness.
//   SA-TC-025  registration rollback after a FORCED mid-transaction failure
//   SA-TC-030  scheduled jobs and a suspended institution (seeded due work)
//   SA-TC-033  platform session expiry, tampering, revocation and deactivation
//   SA-TC-034  rate limits on platform endpoints in PRODUCTION mode (flood harness)
// No seam is added to the application and nothing here can exist in a production build:
//   * the failure is injected by a TEMPORARY TRIGGER in the local database (created and dropped by this test);
//   * the expired and tampered tokens are signed with the local stack's throwaway JWT secret, read from tests/e2e/stack/docker-compose.yml;
//   * the servers are `next start` PRODUCTION builds on :3123 (normal flood guard) and :3124 (low flood guard); in production the RATE_LIMIT_DISABLED switch is ignored by lib/rateLimit.ts, and the test proves it.
// Local Docker stack only (the recorder refuses anything else); synthetic data; the mail sink is local.
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { client, login, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g4-10-platform-harness");
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT_A = 3123, PORT_B = 3124, A_URL = `http://localhost:${PORT_A}`, B_URL = `http://localhost:${PORT_B}`;
const pw = `G4h-${tag}-Pw!`;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, a = []) => (await pgc.query(sql, a)).rows;
const n1 = async (sql, a = []) => (await rows(sql, a))[0]?.n;
const b64u = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const jwtSecret = /GOTRUE_JWT_SECRET:\s*(\S+)/.exec(readFileSync("tests/e2e/stack/docker-compose.yml", "utf8"))?.[1];
const mint = (payload, secret = jwtSecret) => { const h = b64u({ alg: "HS256", typ: "JWT" }), p = b64u(payload); return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`; };
const claimsOf = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
function totp(secret) { const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += AL.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const mkAdmin = (e) => { const r = spawnSync(WIN ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: WIN, env: { ...process.env, PLATFORM_ADMIN_EMAIL: e, PLATFORM_ADMIN_NAME: "G4 Harness " + e.slice(6, 9), PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr); };
const withMfa = async (e, base) => { const c = client(await login(e, pw), base); const enr = await c("POST", "/api/platform/mfa/enroll"); const tok = (await c("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token; return { token: tok, call: client(tok, base) }; };
const raw = (base, m, p, headers = {}, body) => fetch(base + p, { method: m, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async (r) => ({ s: r.status, h: r.headers, j: await r.json().catch(() => null) }));
const sink = async (to) => (await (await fetch(`${process.env.MAIL_SINK}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json()).messages ?? [];

// ---------------- two production servers ----------------
const servers = [];
const startServer = (port, extra) => {
  const env = { ...process.env, PORT: String(port), NODE_ENV: "production", REQUIRE_LOCAL_DB: "true", APP_URL: `http://localhost:${port}`, ...extra };
  const p = spawn(WIN ? "npx.cmd" : "npx", ["next", "start", "-p", String(port)], { env, detached: !WIN, stdio: "ignore", shell: WIN, windowsHide: true }); servers.push(p); return p;
};
const stopAll = () => { for (const p of servers) { try { if (WIN) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-p.pid); } catch { /* gone */ } } };
process.on("exit", stopAll);
const waitUp = async (base) => { for (let i = 0; i < 120; i++) { try { if ((await fetch(base + "/api/health/live")).ok) return true; } catch { /* not yet */ } await sleep(1000); } return false; };
const portFree = (port) => new Promise((r) => { const s = net.createServer().once("error", () => r(false)).once("listening", () => s.close(() => r(true))).listen(port, "127.0.0.1"); });
if (!(await portFree(PORT_A)) || !(await portFree(PORT_B))) { console.error(`ports ${PORT_A}/${PORT_B} are busy`); process.exit(2); }
startServer(PORT_A, { RATE_LIMIT_DISABLED: "true", FLOOD_MAX_PER_MINUTE: "1000000" }); // the switch is set ON here: in production it must be ignored
startServer(PORT_B, { FLOOD_MAX_PER_MINUTE: "50" });

const made = { colleges: [], auth: [], admins: [], schedules: [] };
const mails = { p1: `g4hp1${tag}@example.com`, p2: `g4hp2${tag}@example.com`, p3: `g4hp3${tag}@example.com`, p4: `g4hp4${tag}@example.com` };
const failFn = `g4_inject_${tag}`;
try {
  t(["SA-TC-034"], "the two production servers start", (await waitUp(A_URL)) && (await waitUp(B_URL)));
  for (const e of Object.values(mails)) mkAdmin(e);
  made.admins.push(...(await rows(`select id from "PlatformAdmin" where email = any($1)`, [Object.values(mails)])).map((r) => r.id));
  const P1 = await withMfa(mails.p1, A_URL), P2 = await withMfa(mails.p2, A_URL);
  const uid = (e) => rows(`select id from "PlatformAdmin" where email=$1`, [e]).then((r) => r[0].id);

  // ================= SA-TC-025: registration rollback after a forced failure =================
  const regBody = (slug, email, depts) => ({ name: `G4H ${slug}`, slug, admin: { name: "Harness Admin", email }, departments: depts, academicYear: { name: "2026-27", startDate: "2026-06-01", endDate: "2027-05-31" }, modules: ["ONBOARDING", "DRIVES"] });
  const rb = { slug: `g4h-rb-${tag}`, email: `g4hrb${tag}@example.com` };
  const hasAuth = async (e) => ((await sb.auth.admin.listUsers({ perPage: 1000 })).data?.users ?? []).some((u) => u.email === e);
  await pgc.query(`create or replace function ${failFn}() returns trigger language plpgsql as $f$ begin if new.code = 'G4FAIL' then raise exception 'g4 injected failure after the college rows were written'; end if; return new; end $f$`);
  await pgc.query(`create trigger ${failFn} before insert on "Department" for each row execute function ${failFn}()`);
  const before = { colleges: await n1(`select count(*)::int n from "College"`), users: await n1(`select count(*)::int n from "User"`), settings: await n1(`select count(*)::int n from "CollegeSettings"`), mods: await n1(`select count(*)::int n from "CollegeModule"`), years: await n1(`select count(*)::int n from "AcademicYear"`), audit: await n1(`select count(*)::int n from "AuditLog" where action='institution.provision'`) };
  const failed = await P1.call("POST", "/api/platform/institutions", regBody(rb.slug, rb.email, [{ code: "OKDEPT", name: "Fine Department" }, { code: "G4FAIL", name: "Injected Failure" }]));
  const after = { colleges: await n1(`select count(*)::int n from "College"`), users: await n1(`select count(*)::int n from "User"`), settings: await n1(`select count(*)::int n from "CollegeSettings"`), mods: await n1(`select count(*)::int n from "CollegeModule"`), years: await n1(`select count(*)::int n from "AcademicYear"`), audit: await n1(`select count(*)::int n from "AuditLog" where action='institution.provision'`) };
  t(["SA-TC-025"], "a failure injected AFTER the institution, its settings, modules and administrator rows were written (a database trigger on the department insert) is reported as a failure (not 2xx)", failed.s >= 400, `HTTP ${failed.s} ${JSON.stringify(failed.j)?.slice(0, 150)}`);
  t(["SA-TC-025"], "ROLLBACK: nothing remains in any table the transaction touched (institutions, settings, modules, users, academic years and the provisioning audit rows have the same counts as before)", JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
  t(["SA-TC-025"], "no institution with that address, no staff row and no sign-in for the administrator's e-mail address remain (the sign-in created first is removed again)", (await n1(`select count(*)::int n from "College" where slug=$1`, [rb.slug])) === 0 && (await n1(`select count(*)::int n from "User" where email=$1`, [rb.email])) === 0 && !(await hasAuth(rb.email)));
  t(["SA-TC-025"], "the failure is not logged as a success (no 'institution.provision' audit row for the address)", (await n1(`select count(*)::int n from "AuditLog" where action='institution.provision' and after->>'slug'=$1`, [rb.slug])) === 0);
  await pgc.query(`drop trigger ${failFn} on "Department"`); await pgc.query(`drop function ${failFn}()`);
  const retry = await P1.call("POST", "/api/platform/institutions", regBody(rb.slug, rb.email, [{ code: "OKDEPT", name: "Fine Department" }]));
  if (retry.d?.college?.id) { made.colleges.push(retry.d.college.id); made.auth.push(retry.d.admin?.id); }
  t(["SA-TC-025"], "after the fault is removed the SAME address and e-mail register normally: the failed attempt left nothing that blocks a retry", retry.s === 200 && retry.d?.college?.slug === rb.slug, `HTTP ${retry.s} ${JSON.stringify(retry.j)?.slice(0, 160)}`);

  // ================= SA-TC-030: scheduled jobs and a suspended institution =================
  const mkCollege = async (label, active) => {
    const id = (await rows(`insert into "College" (id,name,slug,"isActive","updatedAt") values (gen_random_uuid(),$1,$2,$3,now()) returning id`, [`G4H ${label} ${tag}`, `g4h-${label}-${tag}`, active]))[0].id; made.colleges.push(id);
    for (const m of ["ATTENDANCE_BLOCKING", "EMPLOYER_CRM", "DRIVES"]) await rows(`insert into "CollegeModule" ("collegeId",module,enabled) values ($1,$2,true) on conflict do nothing`, [id, m]);
    await rows(`insert into "CollegeSettings" ("collegeId","updatedAt") values ($1, now()) on conflict do nothing`, [id]);
    return id;
  };
  const colS = await mkCollege("susp", true), colC = await mkCollege("ctrl", true);
  const cron = (p) => raw(A_URL, "POST", p, { authorization: "Bearer " + process.env.CRON_SECRET });
  const jobs = [["/api/blocking/evaluate", "colleges"], ["/api/crm/follow-ups/run", "colleges"], ["/api/notifications/round-reminders/run", "colleges"], ["/api/notifications/reminders/run", "colleges"]];
  const counts = async () => { const o = {}; for (const [p, k] of jobs) o[p] = (await cron(p)).j?.data?.[k]; return o; };
  const both = await counts();
  await rows(`update "College" set "isActive"=false where id=$1`, [colS]);
  const oneSusp = await counts();
  await rows(`update "College" set "isActive"=false where id=$1`, [colC]);
  const bothSusp = await counts();
  t(["SA-TC-030"], "SELECTION: each of the four institution-wide jobs (blocking, CRM follow-ups, round reminders, reminders and message sweep) processes one institution fewer when it is suspended, and two fewer when both are (the job counts the institutions it works on)", jobs.every(([p]) => Number.isInteger(both[p]) && oneSusp[p] === both[p] - 1 && bothSusp[p] === both[p] - 2), JSON.stringify({ both, oneSusp, bothSusp }));
  await rows(`update "College" set "isActive"=true where id=any($1)`, [[colS, colC]]);

  // reports: seeded DUE schedules for the suspended and the active institution, delivered to the local mail sink
  const rcpt = { s: `g4h-rep-susp-${tag}@example.com`, c: `g4h-rep-ctrl-${tag}@example.com` };
  const creator = (await rows(`select id from "User" limit 1`))[0].id;
  const mkSch = async (col, to) => { const id = (await rows(`insert into "ReportSchedule" (id,"collegeId",type,frequency,recipients,"nextRunAt","createdById") values (gen_random_uuid(),$1,'PLACEMENT_SUMMARY','WEEKLY',$2,now() - interval '1 hour',$3) returning id`, [col, [to], creator]))[0].id; made.schedules.push(id); return id; };
  const schS = await mkSch(colS, rcpt.s), schC = await mkSch(colC, rcpt.c);
  await rows(`update "College" set "isActive"=false where id=$1`, [colS]);
  const snapS = (await rows(`select "nextRunAt","lastRunAt","lastError" from "ReportSchedule" where id=$1`, [schS]))[0];
  const run = await cron("/api/reports/schedules/run");
  await sleep(1500);
  const afterS = (await rows(`select "nextRunAt","lastRunAt","lastError" from "ReportSchedule" where id=$1`, [schS]))[0], afterC = (await rows(`select "nextRunAt","lastRunAt" from "ReportSchedule" where id=$1`, [schC]))[0];
  const mailS = await sink(rcpt.s), mailC = await sink(rcpt.c);
  t(["SA-TC-030"], "CONTROL: the active institution's due scheduled report is sent (an e-mail reaches the sink) and its schedule moves on", run.s === 200 && mailC.length >= 1 && afterC.lastRunAt !== null, JSON.stringify({ http: run.s, data: run.j?.data, mailC: mailC.length }));
  t(["SA-TC-030"], "SCHEDULED REPORTS: a SUSPENDED institution's due report is NOT sent: no e-mail reaches the sink, the schedule is not run or advanced, and nothing is recorded against it", mailS.length === 0 && afterS.lastRunAt === null && +new Date(afterS.nextRunAt) === +new Date(snapS.nextRunAt), JSON.stringify({ mailToSuspended: mailS.length, lastRunAt: afterS.lastRunAt, nextRunAtChanged: +new Date(afterS.nextRunAt) !== +new Date(snapS.nextRunAt) }));
  await rows(`update "College" set "isActive"=true where id=$1`, [colS]);
  await rows(`update "ReportSchedule" set "nextRunAt"=now() - interval '1 hour', "lastRunAt"=null where id=$1`, [schS]);
  await cron("/api/reports/schedules/run"); await sleep(1500);
  t(["SA-TC-030"], "REACTIVATION: when the institution is switched back on its (unspent) due report is sent on the next run", (await sink(rcpt.s)).length >= 1);

  // ================= SA-TC-033: platform session expiry, tampering, revocation, deactivation =================
  const c1 = claimsOf(P1.token);
  const base = { aud: "authenticated", role: "authenticated", sub: c1.sub, aal: c1.aal, amr: c1.amr, session_id: c1.session_id, iss: c1.iss, email: c1.email };
  t(["SA-TC-033"], "baseline: the verified platform session works", (await P1.call("GET", "/api/platform/me")).s === 200);
  const now = Math.floor(Date.now() / 1000);
  const probes = {
    "an expired token (signed correctly, expiry two minutes ago)": mint({ ...base, iat: now - 3720, exp: now - 120 }),
    "a token signed with the wrong key": mint({ ...base, iat: now, exp: now + 3600 }, "not-the-signing-key-" + tag),
    "a token with the signature removed": mint({ ...base, iat: now, exp: now + 3600 }).split(".").slice(0, 2).join(".") + ".",
    "an unsigned token (alg none)": `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ ...base, iat: now, exp: now + 3600 })}.`,
    "a valid token whose subject was changed to another administrator": null,
  };
  const p2Id = await uid(mails.p2);
  { const [h, , s] = P1.token.split("."); probes["a valid token whose subject was changed to another administrator"] = `${h}.${b64u({ ...c1, sub: p2Id })}.${s}`; }
  const bad = [];
  for (const [name, tok] of Object.entries(probes)) for (const path of ["/api/platform/me", "/api/platform/institutions", "/api/platform/policy"]) { const r = await raw(A_URL, "GET", path, { authorization: "Bearer " + tok }); if (r.s !== 401) bad.push(`${name} ${path} -> ${r.s}`); }
  t(["SA-TC-033"], "EXPIRY AND TAMPERING: expired, wrongly signed, unsigned, signature-stripped and subject-swapped tokens are all refused with 401 on platform routes (15 probes)", bad.length === 0, bad.join("; "));
  // deactivation takes effect at once even though the session is valid and cached
  const P3 = await withMfa(mails.p3, A_URL); const p3Id = await uid(mails.p3);
  const okBefore = (await P3.call("GET", "/api/platform/me")).s;
  await rows(`update "PlatformAdmin" set "isActive"=false where id=$1`, [p3Id]);
  const afterDeact = await P3.call("GET", "/api/platform/policy");
  t(["SA-TC-033"], "DEACTIVATION: a deactivated platform administrator's very next request is refused (403) although the token is still valid and cached", okBefore === 200 && afterDeact.s === 403, `before ${okBefore}, after ${afterDeact.s}`);
  // revocation: sign out at the Auth server, then see how long the old token keeps working
  const warmUp = (await P2.call("GET", "/api/platform/me")).s; // this server now holds the token in its short cache (so the window below is a real one)
  const lo = await fetch(`${process.env.SUPABASE_URL}/auth/v1/logout?scope=global`, { method: "POST", headers: { authorization: `Bearer ${P2.token}`, apikey: process.env.SUPABASE_ANON_KEY } });
  const coldNow = await raw(B_URL, "GET", "/api/platform/me", { authorization: "Bearer " + P2.token }); // a server that has never seen this token
  const warm0 = Date.now(); let warmStatus = (await P2.call("GET", "/api/platform/me")).s, waited = 0;
  while (warmStatus === 200 && Date.now() - warm0 < 75_000) { await sleep(5000); warmStatus = (await P2.call("GET", "/api/platform/me")).s; }
  waited = Math.round((Date.now() - warm0) / 1000);
  t(["SA-TC-033"], "REVOCATION: after signing out at the Auth server the token is refused by a server that has not seen it before (the Auth server treats the session as ended)", lo.ok && coldNow.s === 401, `logout ${lo.status}; cold server ${coldNow.s}`);
  t(["SA-TC-033"], "REVOCATION WINDOW: a server that had already accepted the token (it was cached) stops accepting it within the documented 60-second cache (observed: refused after about " + waited + " s)", warmUp === 200 && warmStatus === 401 && waited <= 70, `warm-up ${warmUp}; status ${warmStatus} after ${waited} s`);

  // ================= SA-TC-034: rate limits in production mode =================
  const cur = (await P1.call("GET", "/api/platform/policy")).d?.mfa?.requireForInstitutionAdmins ?? false;
  const put = (c) => c.call("PUT", "/api/platform/policy/mfa", { required: cur }); // a no-op write: the limit counts requests, nothing changes
  const auditBefore = await n1(`select count(*)::int n from "PlatformAuditLog" where action like 'policy.%'`);
  const codes = []; for (let i = 0; i < 31; i++) codes.push((await put(P1)).s);
  const P4 = await withMfa(mails.p4, A_URL); // a different administrator (p2 was signed out above)
  const lim = await raw(A_URL, "PUT", "/api/platform/policy/mfa", { authorization: "Bearer " + P1.token }, { required: cur });
  t(["SA-TC-034"], "PRODUCTION: the first 30 writes in the window succeed and the 31st is refused with 429 RATE_LIMITED and a Retry-After header, even though RATE_LIMIT_DISABLED=true is set in the server's environment (production ignores that switch)", codes.slice(0, 30).every((c) => c === 200) && codes[30] === 429 && lim.s === 429 && lim.j?.error?.code === "RATE_LIMITED" && !!lim.h.get("retry-after"), JSON.stringify({ first30ok: codes.slice(0, 30).every((c) => c === 200), c31: codes[30], c32: lim.s, code: lim.j?.error?.code, retryAfter: lim.h.get("retry-after") }));
  t(["SA-TC-034"], "the limit is per administrator: a second administrator is not blocked while the first is", (await put(P4)).s === 200);
  t(["SA-TC-034"], "the refusals wrote nothing and changed nothing (the no-op writes left no policy audit rows) and the response carries no secret or internal detail", (await n1(`select count(*)::int n from "PlatformAuditLog" where action like 'policy.%'`)) === auditBefore && !/token|secret|postgres|stack/i.test(JSON.stringify(lim.j)));
  const flood = []; for (let i = 0; i < 70; i++) flood.push((await raw(B_URL, "GET", "/api/platform/me")).s);
  const first429 = flood.indexOf(429);
  t(["SA-TC-034"], "FLOOD GUARD: anonymous requests to a platform endpoint beyond the per-minute flood limit (50 on this server) are refused with 429, and before that the answer is the normal 401 (the limit does not reveal anything)", first429 > 0 && first429 <= 55 && flood.slice(0, first429).every((c) => c === 401) && flood.slice(first429).every((c) => c === 429), JSON.stringify({ first429, distinct: [...new Set(flood)] }));
} finally {
  try { await pgc.query(`drop trigger if exists ${failFn} on "Department"`); await pgc.query(`drop function if exists ${failFn}()`); } catch { /* best effort */ }
  try {
    await pgc.query(`delete from "ReportSchedule" where id = any($1)`, [made.schedules]);
    for (const c of made.colleges) { for (const tb of ["Notification", "AuditLog", "CollegeModule", "CollegeSettings", "Department", "AcademicYear", "BlockPolicy"]) await pgc.query(`delete from "${tb}" where "collegeId"=$1`, [c]).catch(() => {}); await pgc.query(`delete from "User" where "collegeId"=$1`, [c]).catch(() => {}); await pgc.query(`delete from "College" where id=$1`, [c]).catch(() => {}); }
    for (const a of made.auth.filter(Boolean)) await sb.auth.admin.deleteUser(a).catch(() => {});
    for (const a of made.admins) await sb.auth.admin.deleteUser(a).catch(() => {});
    await pgc.query(`delete from "PlatformAdmin" where email = any($1)`, [Object.values(mails)]);
  } catch { /* best effort */ }
  await pgc.end(); stopAll();
}
process.exit(R.done() ? 1 : 0);

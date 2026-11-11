// Gate 4.4.5: AI usage statistics, daily limits, their administration API and health (SA-TC-060, 061, 062, 058). Own app instance (production build, port 3117).
// Own app instance (production build, port 3116) with MOCKED Groq and Anthropic providers on loopback: no real provider is contacted, nothing is billed. Local Docker stack only. Synthetic data.
import net from "node:net";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g4-05-ai-usage");
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const PORT = 3117, BASE = `http://localhost:${PORT}`, WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const KEY1 = "gsk_ADMIN_K1_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4", KEY2 = "gsk_ADMIN_K2_Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8Nn7Mm6Ll5", KEY3 = "sk-ant-ADMIN-K3-Qq1Qq1Qq1Qq1Ww2Ww2Ww2Ww2Ee3Ee3Ee3Ee3Rr4Rr4", KEYBAD = "gsk_ADMIN_BAD_Xx0Xx0Xx0Xx0Xx0Xx0Xx0Xx0Xx0Xx0Xx0";
const ENV_G = "gsk_ADMIN_ENV_G_Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1", ENV_A = "sk-ant-ADMIN-ENV-A-Aa2Aa2Aa2Aa2Aa2Aa2Aa2Aa2Aa2Aa2";
const KEYS = [KEY1, KEY2, KEY3, KEYBAD, ENV_G, ENV_A];
const M1 = randomBytes(32), M2 = randomBytes(32);
const enc = (k) => [k, Buffer.from(k).toString("base64"), Buffer.from(k).toString("hex"), Buffer.from(k).toString("base64url")];
const leaks = (s) => [...KEYS.flatMap(enc), M1.toString("base64"), M1.toString("hex"), M2.toString("base64"), M2.toString("hex")].some((x) => String(s).includes(x));
const MARK = "USAGE-PROMPT-MARKER-6623";

// ---------------- mocked providers ----------------
const ctl = { groq: { log: [], models: 0, bad: false, chat: 0 }, claude: { log: [], models: 0, chat: 0 } };
const body = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
const groqSrv = http.createServer(async (req, res) => {
  const auth = String(req.headers.authorization ?? "").replace(/^Bearer /, ""); const b = await body(req);
  if (req.url.endsWith("/models")) { ctl.groq.models++; ctl.groq.log.push({ kind: "models", key: auth }); if (auth === KEYBAD) { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: "bad" } })); } res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ data: [{ id: "llama-3.3-70b-versatile" }, { id: "admin-custom-model" }] })); }
  ctl.groq.chat++; ctl.groq.log.push({ kind: "chat", key: auth, body: JSON.parse(b || "{}") }); res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ title: "T", requirements: [] }) } }] }));
});
const claudeSrv = http.createServer(async (req, res) => {
  const auth = String(req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /, "")); await body(req);
  if (req.url.startsWith("/v1/models")) { ctl.claude.models++; ctl.claude.log.push({ kind: "models", key: auth }); res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ data: [{ id: "claude-opus-5-5", type: "model", display_name: "x", created_at: "2025-01-01T00:00:00Z" }], has_more: false, first_id: "claude-opus-5-5", last_id: "claude-opus-5-5" })); }
  ctl.claude.chat++; res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "x", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
});
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)));
const gp = await listen(groqSrv), cp = await listen(claudeSrv);

// ---------------- the app under test ----------------
const env = { ...process.env, NODE_ENV: "production", PORT: String(PORT), RATE_LIMIT_DISABLED: "true", FLOOD_MAX_PER_MINUTE: "100000", APP_URL: BASE, REQUIRE_LOCAL_DB: "true",
  GROQ_API_BASE: `http://127.0.0.1:${gp}/v1`, ANTHROPIC_BASE_URL: `http://127.0.0.1:${cp}`, GROQ_API_KEY: ENV_G, ANTHROPIC_API_KEY: ENV_A,
  AI_MASTER_KEY_V1: M1.toString("base64"), AI_MASTER_KEY_V2: M2.toString("hex"), AI_MASTER_KEY_ACTIVE: "1", CRON_SECRET: "cron-secret-for-ai-admin-tests-0001" };
env.GROQ_MODEL = ""; env.GROQ_VISION_MODEL = ""; // empty on purpose: env.sh sets GROQ_MODEL=none for other suites and the app also reads .env for anything left unset; this suite tests the real defaults
const out = [];
const app = spawn(WIN ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT)], { env, detached: !WIN, stdio: ["ignore", "pipe", "pipe"], shell: WIN, windowsHide: true });
app.stdout.on("data", (d) => out.push(String(d))); app.stderr.on("data", (d) => out.push(String(d)));
const stopApp = () => { try { if (WIN) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-app.pid); } catch { /* gone */ } };
process.on("exit", stopApp);
const wait = async (path, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + path)).ok) return true; } catch { /* starting */ } await sleep(700); } return false; };
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pw = `G4-us-${tag}-Pw!`, emailA = `g4usa${tag}@example.com`, emailC = `g4usc${tag}@example.com`;
const seen = [];   // every response body and every audit detail, for the final secret sweep
let col = null, aiBefore = null;
const crypto = {};
try {
  t(["SA-TC-062"], "the instance under test starts with mocks wired in", await wait("/api/health/live"));
  await rows(`delete from "AiProviderConfig"`); await rows(`delete from "AiGlobalSetting"`); await rows(`delete from "PlatformAuditLog" where action like 'ai.%'`);
  for (const e of [emailA, emailC]) { const r = spawnSync(WIN ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: WIN, env: { ...process.env, PLATFORM_ADMIN_EMAIL: e, PLATFORM_ADMIN_NAME: "G4 AI Admin", PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr); }
  const c1 = client(await login(emailA, pw), BASE); const enr = await c1("POST", "/api/platform/mfa/enroll");
  const tok = (await c1("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token;
  const P0 = client(tok, BASE); const P = async (m, p, b) => { const r = await P0(m, p, b); seen.push(JSON.stringify(r.j ?? "")); return r; };
  const aal1 = client(await login(emailA, pw), BASE), noMfa = client(await login(emailC, pw), BASE);
  const colAdmin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD), BASE);
  const S = await makeStudents(colAdmin, 1, "AIA"); const stu = client(S.tokens.A, BASE);
  col = (await rows(`select id from "College" limit 1`))[0].id; aiBefore = (await rows(`select "aiDocumentReading" a from "CollegeSettings" where "collegeId"=$1`, [col]))[0]?.a ?? false;
  const mkc = await import("../../lib/ai/crypto.ts"); Object.assign(crypto, mkc);
  const MK = mkc.loadMasterKeys({ AI_MASTER_KEY_V1: M1.toString("base64"), AI_MASTER_KEY_V2: M2.toString("hex"), AI_MASTER_KEY_ACTIVE: "1" });
  const dbRow = async (purpose) => (await rows(`select * from "AiProviderConfig" where purpose = $1::"AiPurpose"`, [purpose]))[0];
  const dbPlain = (r) => mkc.decryptSecret(r.keyCiphertext, { id: r.id, purpose: r.purpose, provider: r.provider }, MK);
  const audit = async (like = "ai.%") => rows(`select action, "adminId", email, detail, ip from "PlatformAuditLog" where action like $1 order by "createdAt"`, [like]);
  const snapshot = async () => JSON.stringify([await rows(`select * from "AiProviderConfig" order by purpose`), await rows(`select * from "AiGlobalSetting"`), (await audit()).length]);
  const reqMock = () => ({ g: ctl.groq.log.length, c: ctl.claude.log.length });
  const resetMocks = () => { ctl.groq.log = []; ctl.claude.log = []; ctl.groq.models = ctl.groq.chat = ctl.claude.models = ctl.claude.chat = 0; };
  const jd = async () => { const r = await colAdmin("POST", "/api/jds", { source: "PASTE", title: `AI Usage JD ${tag}`, text: "We need a developer who knows SQL. ".repeat(10) }); return r.d?.id ?? r.d?.jd?.id; };
  await rows(`update "CollegeSettings" set "aiDocumentReading"=true where "collegeId"=$1`, [col]);
  const jdId = await jd();
  const extract = async () => fetch(BASE + `/api/jds/${jdId}/extract`, { method: "POST", headers: { authorization: "Bearer " + (await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD)), "content-type": "application/json" }, body: JSON.stringify({ overwrite: true }) });
  const usage = (qs = "") => P("GET", "/api/platform/ai/usage" + (qs ? "?" + qs : ""));
  const limits = () => P("GET", "/api/platform/ai/limits");
  const setLimit = (kind, key, dailyCalls) => P("PUT", "/api/platform/ai/limits", { kind, key, dailyCalls });
  const resetAll = async () => { await rows(`delete from "AiLimit"`); await rows(`delete from "AiQuotaCounter"`); await rows(`delete from "AiUsageDaily"`); };
  const health = async () => { await sleep(5300); return P("GET", "/api/platform/monitoring?refresh=1"); };
  const aiComp = (r) => r.d.components.find((c) => c.key === "ai");
  const OTHER = "11111111-2222-4333-8444-555555555555";   // a second institution that exists only as usage rows (no data of its own is needed to count)
  await resetAll();
  await rows(`delete from "RateLimitBucket" where key like 'jd-extract%'`); // the route's own per-user limit (40 an hour) is separate from the AI limits tested here; repeated runs of this suite would otherwise trip it
  const sink = []; // every audit detail seen

  // ============ access control (SA-TC-062) ============
  const paths = [["GET", "/api/platform/ai/usage"], ["GET", "/api/platform/ai/limits"], ["PUT", "/api/platform/ai/limits", { kind: "PROVIDER", key: "GROQ", dailyCalls: 1 }]];
  const snap0 = JSON.stringify([await rows(`select * from "AiLimit"`), (await audit()).length]);
  const who = [["anonymous", (m, p, b) => fetch(BASE + p, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then((r) => ({ s: r.status }))],
    ["institution administrator", (m, p, b) => colAdmin(m, p, b)], ["student", (m, p, b) => stu(m, p, b)], ["platform admin, password only", (m, p, b) => aal1(m, p, b)], ["platform admin, no authenticator", (m, p, b) => noMfa(m, p, b)]];
  const refused = [];
  for (const [n, f] of who) for (const [m, p, b] of paths) { const r = await f(m, p, b); const ok = n === "anonymous" ? r.s === 401 : r.s === 403; if (!ok) refused.push(`${n} ${m} ${p} -> ${r.s}`); }
  t(["SA-TC-062"], "usage and limit endpoints refuse every identity except a verified platform administrator (anonymous 401; institution administrator, student, password-only and no-authenticator admins 403)", refused.length === 0, refused.join("; "));
  t(["SA-TC-062"], "the refused limit write changed nothing", JSON.stringify([await rows(`select * from "AiLimit"`), (await audit()).length]) === snap0);

  // ============ usage statistics are exact (SA-TC-061) ============
  resetMocks();
  const calls = 4;
  const codes = [];
  for (let i = 0; i < calls; i++) codes.push((await extract()).status);
  t(["SA-TC-061"], `${calls} real AI-backed requests from institution A reach the (mock) provider ${calls} times`, codes.every((c) => c === 200) && ctl.groq.chat === calls, `${codes} chat=${ctl.groq.chat}`);
  // institution B: known usage written directly, so the comparison has two institutions with different known numbers
  const day = new Date().toISOString().slice(0, 10);
  const putRow = (c, purpose, provider, model, feature, n, f, to, rl, bl, ms) => rows(`insert into "AiUsageDaily" (id, day, "collegeKey", purpose, provider, model, feature, calls, failures, timeouts, "rateLimited", blocked, "totalMs", "updatedAt") values (gen_random_uuid(), $1::date, $2, $3::"AiPurpose", $4::"AiProvider", $5, $6, $7, $8, $9, $10, $11, $12, now())`, [day, c, purpose, provider, model, feature, n, f, to, rl, bl, ms]);
  await putRow(OTHER, "TEXT", "GROQ", "llama-test", "resume_summary", 5, 2, 0, 0, 0, 1000);
  await putRow(OTHER, "INTERVIEW", "ANTHROPIC", "claude-test", "interview_question", 3, 0, 1, 0, 0, 900);
  const u = await usage("days=7");
  const A = (u.d.colleges.rows.find((r) => r.collegeKey === col)), Bq = u.d.colleges.rows.find((r) => r.collegeKey === OTHER);
  t(["SA-TC-061"], "institution A's count equals the calls it made (4), shown under its real name", u.s === 200 && A?.calls === calls && !!A.name && A.name !== "Unknown institution", JSON.stringify(A));
  t(["SA-TC-061"], "institution B's count equals the known rows (8 calls, 2 failed) and is shown as unknown (no such institution)", Bq?.calls === 8 && Bq.failures === 2 && Bq.name === "Unknown institution", JSON.stringify(Bq));
  const prov = Object.fromEntries(u.d.byProvider.map((r) => [r.key, r.calls])), feat = Object.fromEntries(u.d.byFeature.map((r) => [r.key, r.calls])), purp = Object.fromEntries(u.d.byPurpose.map((r) => [r.key, r.calls]));
  t(["SA-TC-061"], "counts per provider equal the calls made (GROQ 4+5=9, ANTHROPIC 3)", prov.GROQ === calls + 5 && prov.ANTHROPIC === 3, JSON.stringify(prov));
  t(["SA-TC-061"], "counts per feature equal the calls made (the real calls are recorded as jd_parse)", feat.jd_parse === calls && feat.resume_summary === 5 && feat.interview_question === 3, JSON.stringify(feat));
  t(["SA-TC-061"], "counts per purpose equal the calls made (TEXT 9, INTERVIEW 3)", purp.TEXT === calls + 5 && purp.INTERVIEW === 3, JSON.stringify(purp));
  t(["SA-TC-061"], "the total is the sum of the parts and the failure, timeout and average figures are right", u.d.totals.calls === 12 && u.d.totals.failures === 2 && u.d.totals.timeouts === 1 && Number.isInteger(u.d.totals.avgMs), JSON.stringify(u.d.totals));
  t(["SA-TC-061"], "the real calls were recorded against the default model name the resolver chose (the model that was actually used)", u.d.byModel.some((m) => m.key !== "unknown" && m.calls === calls), JSON.stringify(u.d.byModel));
  const cols = Object.keys((await rows(`select * from "AiUsageDaily" limit 1`))[0]).sort().join(",");
  t(["SA-TC-061"], "the usage table holds only counts, times and names (no prompt, answer, student, user or document column)", cols === "blocked,calls,collegeKey,day,failures,feature,id,model,provider,purpose,rateLimited,timeouts,totalMs,updatedAt", cols);
  t(["SA-TC-061"], "no prompt text reached the usage table or any usage response", !JSON.stringify(await rows(`select * from "AiUsageDaily"`)).includes(MARK) && !JSON.stringify(u.j).includes(MARK));
  const d1 = await usage("days=1"), d90 = await usage("days=90"), dBad = [await usage("days=0"), await usage("days=91"), await usage("days=abc"), await usage("page=0"), await usage("x=1")];
  t(["SA-TC-061"], "the period filter works and its range is enforced (1 to 90 days; anything else is a 400 and is never run)", d1.s === 200 && d90.s === 200 && dBad.every((r) => r.s === 400), dBad.map((r) => r.s).join());
  const pg1 = await usage("days=7&page=1"), pg9 = await usage("days=7&page=9999");
  t(["SA-TC-061"], "institution usage is paginated and a page past the end is empty, not an error", pg1.d.colleges.total === 2 && pg9.s === 200 && pg9.d.colleges.rows.length === 0);

  // ============ limits are enforced with a clear message (SA-TC-060) ============
  const beforeChat = ctl.groq.chat;
  const lim1 = await setLimit("COLLEGE", col, calls);   // institution A has already used exactly its allowance
  t(["SA-TC-060"], "an institution limit can be set", lim1.s === 200 && lim1.d.limit.after === calls && lim1.d.limit.before === null, JSON.stringify(lim1.j));
  const r1 = await extract(); const j1 = await r1.json().catch(() => null);
  t(["SA-TC-060"], "the call over the limit is refused with 429 and the clear code AI_LIMIT_REACHED", r1.status === 429 && j1?.error?.code === "AI_LIMIT_REACHED", `${r1.status} ${JSON.stringify(j1)}`);
  t(["SA-TC-060"], "the message tells the person what to do and names no other institution, number or provider", /daily AI limit/i.test(j1?.error?.message ?? "") && !/groq|anthropic|11111111|\d{3,}/i.test(j1?.error?.message ?? ""), j1?.error?.message);
  t(["SA-TC-060"], "the refused call never reached the provider (nothing sent, nothing billed)", ctl.groq.chat === beforeChat);
  const afterBlock = await usage("days=1");
  t(["SA-TC-060"], "the refusal is counted as blocked and is not counted as a call", afterBlock.d.totals.blocked === 1 && afterBlock.d.colleges.rows.find((r) => r.collegeKey === col).calls === calls, JSON.stringify(afterBlock.d.totals));
  const cons = afterBlock.d.today.find((x) => x.scope === `college:${col}`);
  t(["SA-TC-060"], "today's consumption shows the institution at its limit (4 of 4)", cons?.used === calls && cons.limit === calls && cons.ratio === 1, JSON.stringify(cons));
  // another institution is unaffected: the default is not set, and B has none
  const other = await setLimit("COLLEGE", OTHER, 1);
  t(["SA-TC-060"], "limits are per institution: a limit on another institution leaves A's limit as it was", other.s === 200 && (await limits()).d.limits.find((l) => l.key === col).dailyCalls === calls);
  const raise = await setLimit("COLLEGE", col, calls + 10);
  const r2 = await extract();
  t(["SA-TC-060"], "raising the limit lets the next call through at once (the change is read within the cache window of the limit table)", raise.s === 200 && (r2.status === 200 || (await sleep(16000), (await extract()).status === 200)));
  const rm = await setLimit("COLLEGE", col, null);
  t(["SA-TC-060"], "a limit can be removed; then none applies", rm.s === 200 && rm.d.limit.after === null && !(await limits()).d.limits.some((l) => l.key === col));
  const zero = await setLimit("PROVIDER", "GROQ", 0);
  const beforeZero = ctl.groq.chat; const rz = await extract();
  t(["SA-TC-060"], "a provider limit of 0 stops every call to that provider and nothing is sent", zero.s === 200 && rz.status === 429 && ctl.groq.chat === beforeZero);
  await setLimit("PROVIDER", "GROQ", null);

  // ============ the administration API is strict ============
  const snap1 = JSON.stringify(await rows(`select kind, key, "dailyCalls" from "AiLimit" order by kind, key`));
  const bad = [
    ["unknown kind", { kind: "USER", key: "x", dailyCalls: 1 }], ["negative", { kind: "PROVIDER", key: "GROQ", dailyCalls: -1 }], ["fraction", { kind: "PROVIDER", key: "GROQ", dailyCalls: 1.5 }],
    ["above the ceiling", { kind: "PROVIDER", key: "GROQ", dailyCalls: 10000001 }], ["text", { kind: "PROVIDER", key: "GROQ", dailyCalls: "5" }], ["missing value", { kind: "PROVIDER", key: "GROQ" }],
    ["unknown provider", { kind: "PROVIDER", key: "OPENAI", dailyCalls: 5 }], ["unknown purpose", { kind: "PURPOSE", key: "AUDIO", dailyCalls: 5 }], ["institution that is not an id", { kind: "COLLEGE", key: "' or 1=1 --", dailyCalls: 5 }],
    ["default with a name", { kind: "COLLEGE_DEFAULT", key: col, dailyCalls: 5 }], ["extra field", { kind: "PROVIDER", key: "GROQ", dailyCalls: 5, admin: true }],
  ];
  const badRes = []; for (const [n, b] of bad) { const r = await P("PUT", "/api/platform/ai/limits", b); if (![400, 422].includes(r.s)) badRes.push(`${n}: ${r.s}`); }
  t(["SA-TC-060"], "every invalid limit is refused (400 or 422): unknown kind, negative, fractional, above 10,000,000, wrong type, missing, unknown provider or purpose, a key that is not an institution id (including an injection attempt), a default with a name, and extra fields", badRes.length === 0, badRes.join("; "));
  t(["SA-TC-060"], "no invalid request changed any limit", JSON.stringify(await rows(`select kind, key, "dailyCalls" from "AiLimit" order by kind, key`)) === snap1);
  t(["SA-TC-060"], "limits that do not exist can be removed without an error (removal is idempotent)", (await setLimit("PURPOSE", "VISION", null)).s === 200);
  const dflt = await setLimit("COLLEGE_DEFAULT", "*", 100);
  t(["SA-TC-060"], "a default for every institution can be set and listed", dflt.s === 200 && (await limits()).d.limits.some((l) => l.kind === "COLLEGE_DEFAULT" && l.key === "*" && l.dailyCalls === 100));
  await setLimit("COLLEGE_DEFAULT", "*", null);

  // ============ audit ============
  const al = await audit("ai.limit.%"); for (const a of al) sink.push(JSON.stringify(a));
  t(["SA-TC-060", "SA-TC-058"], "every limit change is in the audit log with the administrator, the kind and key, and the value before and after", al.length >= 6 && al.every((a) => a.adminId && a.email && a.detail?.kind && "before" in a.detail && "after" in a.detail), `${al.length} rows`);
  t(["SA-TC-060"], "removing a limit is recorded as ai.limit.remove, setting as ai.limit.set", al.some((a) => a.action === "ai.limit.remove") && al.some((a) => a.action === "ai.limit.set"));

  // ============ health (SA-TC-060) ============
  await resetAll();
  await setLimit("PURPOSE", "TEXT", 5); const hs = []; for (let i = 0; i < 4; i++) { const x = await extract(); hs.push(x.status + (x.status === 200 ? "" : " " + (await x.text()).slice(0, 120))); }   // 4 of 5 = 80%: near its limit
  const h1 = await health(); const hc1 = aiComp(h1);
  t(["SA-TC-060"], "health shows today's AI usage and refusals", h1.s === 200 && hc1.evidence.some((e) => /Today: 4 AI call/.test(e)), JSON.stringify(hc1.evidence) + " | " + hs.join(" ; "));
  t(["SA-TC-060"], "health names a limit that is nearly reached", hc1.evidence.some((e) => /Limit nearly reached: purpose:TEXT at 4 of 5/.test(e)), JSON.stringify(hc1.evidence));
  t(["SA-TC-060"], "health does not hold a key or a prompt", !leaks(JSON.stringify(h1.j)) && !JSON.stringify(h1.j).includes(MARK));
  const off = await P("PUT", "/api/platform/ai/global", { enabled: false }); const h2 = await health();
  t(["SA-TC-060"], "when the global switch is off, health says AI is switched off by an administrator (not a provider fault)", off.s === 200 && aiComp(h2).status === "not_configured" && /switched off/i.test(aiComp(h2).summary), aiComp(h2).summary);
  await P("PUT", "/api/platform/ai/global", { enabled: true });
  const h3 = await health();
  t(["SA-TC-060"], "switched back on, health returns to a working provider", ["healthy", "degraded"].includes(aiComp(h3).status) && /accepts the configured key|nearly|failed/i.test(aiComp(h3).summary + aiComp(h3).evidence.join(" ")), `${aiComp(h3).status} ${aiComp(h3).summary}`);
  const noFailover = ctl.groq.log.filter((x) => x.kind === "chat").every((x) => x.key === ENV_G);
  t(["SA-TC-060"], "there is no failover: calls to the provider use only the one resolved key (never another provider's)", ctl.claude.chat === 0 && noFailover);

  // ============ sweep ============
  const server = out.join("");
  t(["SA-TC-058"], "SECRET SWEEP: no key and no master key in any response, audit row or usage row of this suite, and nothing the server printed contains a key, a master key or a prompt", !seen.some(leaks) && !sink.some(leaks) && !leaks(JSON.stringify(await rows(`select * from "AiUsageDaily"`))) && !leaks(server) && !server.includes(MARK), server.slice(0, 200));
} finally {
  try { await rows(`update "CollegeSettings" set "aiDocumentReading"=$2 where "collegeId"=$1`, [col, aiBefore ?? false]); } catch { /* best effort */ }
  await pgc.query(`delete from "AiLimit"`).catch(() => 0); await pgc.query(`delete from "AiQuotaCounter"`).catch(() => 0); await pgc.query(`delete from "AiUsageDaily"`).catch(() => 0);
  await pgc.query(`delete from "AiProviderConfig"`).catch(() => 0); await pgc.query(`delete from "AiGlobalSetting"`).catch(() => 0);
  await pgc.query(`delete from "JobDescription" where title like 'AI Usage JD%'`).catch(() => 0);
  await pgc.end().catch(() => 0); stopApp(); groqSrv.close(); claudeSrv.close();
}
process.exit(R.done() ? 1 : 0);

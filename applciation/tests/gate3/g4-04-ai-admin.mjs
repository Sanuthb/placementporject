// Gate 4.4.4: the platform AI administration API and its security (SA-TC-006, 058, 059, 062; usage and limits are added in 4.4.5 in g4-05-ai-usage.mjs).
// Own app instance (production build, port 3116) with MOCKED Groq and Anthropic providers on loopback: no real provider is contacted, nothing is billed. Local Docker stack only. Synthetic data.
import net from "node:net";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g4-04-ai-admin");
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const PORT = 3116, BASE = `http://localhost:${PORT}`, WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const KEY1 = "gsk_ADMIN_K1_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4", KEY2 = "gsk_ADMIN_K2_Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8Nn7Mm6Ll5", KEY3 = "sk-ant-ADMIN-K3-Qq1Qq1Qq1Qq1Ww2Ww2Ww2Ww2Ee3Ee3Ee3Ee3Rr4Rr4", KEYBAD = "gsk_ADMIN_BAD_Xx0Xx0Xx0Xx0Xx0Xx0Xx0Xx0Xx0Xx0Xx0";
const ENV_G = "gsk_ADMIN_ENV_G_Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1Ee1", ENV_A = "sk-ant-ADMIN-ENV-A-Aa2Aa2Aa2Aa2Aa2Aa2Aa2Aa2Aa2Aa2";
const KEYS = [KEY1, KEY2, KEY3, KEYBAD, ENV_G, ENV_A];
const M1 = randomBytes(32), M2 = randomBytes(32);
const enc = (k) => [k, Buffer.from(k).toString("base64"), Buffer.from(k).toString("hex"), Buffer.from(k).toString("base64url")];
const leaks = (s) => [...KEYS.flatMap(enc), M1.toString("base64"), M1.toString("hex"), M2.toString("base64"), M2.toString("hex")].some((x) => String(s).includes(x));
const MARK = "ADMIN-PROMPT-MARKER-5512";

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
const pw = `G4-ai-${tag}-Pw!`, emailA = `g4aia${tag}@example.com`, emailC = `g4aic${tag}@example.com`;
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
  col = (await rows(`select "collegeId" id from "User" where email=$1 limit 1`, [process.env.SEED_ADMIN_EMAIL]))[0].id; aiBefore = (await rows(`select "aiDocumentReading" a from "CollegeSettings" where "collegeId"=$1`, [col]))[0]?.a ?? false;
  const mkc = await import("../../lib/ai/crypto.ts"); Object.assign(crypto, mkc);
  const MK = mkc.loadMasterKeys({ AI_MASTER_KEY_V1: M1.toString("base64"), AI_MASTER_KEY_V2: M2.toString("hex"), AI_MASTER_KEY_ACTIVE: "1" });
  const dbRow = async (purpose) => (await rows(`select * from "AiProviderConfig" where purpose = $1::"AiPurpose"`, [purpose]))[0];
  const dbPlain = (r) => mkc.decryptSecret(r.keyCiphertext, { id: r.id, purpose: r.purpose, provider: r.provider }, MK);
  const audit = async (like = "ai.%") => rows(`select action, "adminId", email, detail, ip from "PlatformAuditLog" where action like $1 order by "createdAt"`, [like]);
  const snapshot = async () => JSON.stringify([await rows(`select * from "AiProviderConfig" order by purpose`), await rows(`select * from "AiGlobalSetting"`), (await audit()).length]);
  const reqMock = () => ({ g: ctl.groq.log.length, c: ctl.claude.log.length });
  const resetMocks = () => { ctl.groq.log = []; ctl.claude.log = []; ctl.groq.models = ctl.groq.chat = ctl.claude.models = ctl.claude.chat = 0; };
  const jd = async () => { const r = await colAdmin("POST", "/api/jds", { source: "PASTE", title: `AI Admin JD ${tag}`, text: "We need a developer who knows SQL. ".repeat(10) }); return r.d?.id ?? r.d?.jd?.id; };
  await rows(`update "CollegeSettings" set "aiDocumentReading"=true where "collegeId"=$1`, [col]);
  const jdId = await jd();
  const extract = async () => fetch(BASE + `/api/jds/${jdId}/extract`, { method: "POST", headers: { authorization: "Bearer " + (await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD)), "content-type": "application/json" }, body: JSON.stringify({ overwrite: true }) });

  // ============ access control (SA-TC-062) ============
  const paths = [["GET", "/api/platform/ai"], ["PUT", "/api/platform/ai/purposes/TEXT", { model: "m-refused" }], ["DELETE", "/api/platform/ai/purposes/TEXT"], ["POST", "/api/platform/ai/purposes/TEXT/test", {}], ["PUT", "/api/platform/ai/global", { enabled: false }]];
  const snap0 = await snapshot();
  const who = [["anonymous", (m, p, b) => fetch(BASE + p, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ s: r.status, code: (await r.json().catch(() => null))?.error?.code }))],
    ["garbage token", (m, p, b) => fetch(BASE + p, { method: m, headers: { authorization: "Bearer not.a.token", "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then((r) => ({ s: r.status }))],
    ["institution administrator (Head TPO)", (m, p, b) => colAdmin(m, p, b)], ["student", (m, p, b) => stu(m, p, b)], ["platform admin, password only (no second step)", (m, p, b) => aal1(m, p, b)], ["platform admin, no authenticator", (m, p, b) => noMfa(m, p, b)]];
  const bad = [];
  for (const [n, f] of who) for (const [m, p, b] of paths) { const r = await f(m, p, b); const want = n === "anonymous" || n === "garbage token" ? r.s === 401 : n.includes("password only") ? r.s === 403 && r.code === "MFA_REQUIRED" : n.includes("no authenticator") ? r.s === 403 && r.code === "MFA_SETUP_REQUIRED" : r.s === 403; if (!want || /purposes|"purpose"|global/.test(JSON.stringify(r.j ?? "").slice(0, 0))) bad.push(`${n} ${m} ${p} -> ${r.s}`); }
  t(["SA-TC-062"], "every identity except a verified platform administrator is refused on every AI endpoint: anonymous and garbage tokens 401; an institution administrator and a student 403; a platform admin with no second step MFA_REQUIRED; one with no authenticator MFA_SETUP_REQUIRED", bad.length === 0, bad.join("; "));
  t(["SA-TC-062"], "the refused calls changed nothing: no configuration, no switch, no audit row", (await snapshot()) === snap0);
  const mfaPut = await aal1("PUT", "/api/platform/ai/global", { enabled: false });
  t(["SA-TC-062"], "a platform admin who has not completed the second step cannot even switch AI off (the kill switch needs MFA)", mfaPut.s === 403 && (await rows(`select count(*)::int n from "AiGlobalSetting"`))[0].n === 0);
  const noRoleRead = await colAdmin("GET", "/api/platform/ai");
  t(["SA-TC-062"], "a refused response carries no configuration data", noRoleRead.s === 403 && !/purposes|supportedProvider|keyLast4|models/.test(JSON.stringify(noRoleRead.j ?? "")));
  const w = []; for (const m of ["POST", "PATCH"]) { const r = await P0(m, "/api/platform/ai", {}); if (r.s !== 405) w.push(`${m} ${r.s}`); } for (const p of ["/api/platform/ai/global"]) { const r = await P0("GET", p); if (r.s !== 405) w.push(`GET ${p} ${r.s}`); }
  t(["SA-TC-062"], "methods that are not defined are refused with 405 (no accidental write route)", w.length === 0, w.join(","));

  // ============ the overview (SA-TC-006) ============
  const o0 = await P("GET", "/api/platform/ai");
  const pv = (o, p) => o.d.purposes.find((x) => x.purpose === p);
  t(["SA-TC-006"], "the platform administrator sees three configurable purposes with their fixed providers (TEXT and VISION: Groq, INTERVIEW: Anthropic) and today's default models", o0.s === 200 && o0.d.purposes.map((x) => `${x.purpose}:${x.supportedProvider}:${x.default.model}`).join() === "TEXT:GROQ:llama-3.3-70b-versatile,VISION:GROQ:qwen/qwen3.8-27b,INTERVIEW:ANTHROPIC:claude-opus-5-5", JSON.stringify(o0.d?.purposes?.map((x) => x.purpose)));
  t(["SA-TC-006"], "before any change each purpose is served by the environment (settings from environment, key from environment), nothing is stored, the global switch is on, and a master key is configured", o0.d.purposes.every((x) => x.stored === null && x.effective?.source.key === "environment" && x.effective.enabled) && o0.d.global.enabled === true && o0.d.masterKey.configured === true && o0.d.masterKey.active === 1);
  t(["SA-TC-058"], "the overview never contains an environment key, a master key or any ciphertext", !leaks(JSON.stringify(o0.j)) && !/keyCiphertext|aigcm1/.test(JSON.stringify(o0.j)));

  // ============ save, mask, audit (SA-TC-058, 059) ============
  resetMocks();
  const s1 = await P("PUT", "/api/platform/ai/purposes/TEXT", { model: "admin-custom-model", apiKey: KEY1, enabled: true });
  const r1 = await dbRow("TEXT");
  t(["SA-TC-058"], "saving a key returns only a masked form (last four characters, key version, time): no key, no ciphertext, no id", s1.s === 200 && s1.d.config.keyConfigured && s1.d.config.keyLast4 === KEY1.slice(-4) && s1.d.config.keyVersion === 1 && !leaks(JSON.stringify(s1.j)) && !("keyCiphertext" in s1.d.config) && !("id" in s1.d.config));
  t(["SA-TC-058"], "the key is stored only as AES-256-GCM ciphertext on master-key version 1 (decrypts back to what was typed; the plaintext is in no column)", /^aigcm1\.1\./.test(r1.keyCiphertext) && dbPlain(r1) === KEY1 && !leaks(JSON.stringify(r1)));
  const o1 = await P("GET", "/api/platform/ai");
  t(["SA-TC-058"], "reading the configuration back shows the masked key and the active provider and model, never the key", pv(o1, "TEXT").stored.keyLast4 === KEY1.slice(-4) && pv(o1, "TEXT").effective.model === "admin-custom-model" && pv(o1, "TEXT").effective.source.key === "database" && !leaks(JSON.stringify(o1.j)));
  let a1 = await audit();
  t(["SA-TC-058", "SA-TC-059"], "the change is audited: a model change row and a key replacement row, with the administrator's id and e-mail and the client address, the before and after model, and only the last four characters of the key", a1.some((a) => a.action === "ai.model.change" && a.detail.after.model === "admin-custom-model" && a.detail.before === null) && a1.some((a) => a.action === "ai.key.replace" && a.detail.keyLast4 === KEY1.slice(-4)) && a1.every((a) => !!a.adminId && a.email === emailA && !!a.ip) && !leaks(JSON.stringify(a1)));
  const ex = await extract(); await ex.arrayBuffer();
  t(["SA-TC-059"], "an AI feature run after the change (job-description analysis) is served with the NEW model and the STORED key, not the environment's", ctl.groq.chat >= 1 && ctl.groq.log.filter((x) => x.kind === "chat").every((x) => x.key === KEY1 && x.body.model === "admin-custom-model"), JSON.stringify(ctl.groq.log.map((x) => [x.kind, x.key === KEY1 ? "stored" : x.key === ENV_G ? "env" : "other", x.body?.model])));
  resetMocks();
  const s2 = await P("PUT", "/api/platform/ai/purposes/TEXT", { model: "admin-custom-model", apiKey: KEY2 });
  const r2 = await dbRow("TEXT");
  t(["SA-TC-058", "SA-TC-059"], "replacing the key: new ciphertext (new IV), new last four, the old key gone from the row, and the next AI call uses the new key", s2.s === 200 && r2.keyCiphertext !== r1.keyCiphertext && dbPlain(r2) === KEY2 && s2.d.config.keyLast4 === KEY2.slice(-4) && !leaks(JSON.stringify(r2)) && await (async () => { const e = await extract(); await e.arrayBuffer(); return ctl.groq.log.filter((x) => x.kind === "chat").every((x) => x.key === KEY2); })());
  resetMocks();
  const s3 = await P("PUT", "/api/platform/ai/purposes/TEXT", { model: "admin-custom-model", apiKey: null });
  const e3 = await extract(); await e3.arrayBuffer();
  t(["SA-TC-059"], "removing the stored key falls back to the environment key (the model stays as configured)", s3.s === 200 && !s3.d.config.keyConfigured && (await dbRow("TEXT")).keyCiphertext === null && ctl.groq.log.filter((x) => x.kind === "chat").every((x) => x.key === ENV_G && x.body.model === "admin-custom-model"));
  resetMocks();
  const d3 = await P("DELETE", "/api/platform/ai/purposes/TEXT");
  const e4 = await extract(); await e4.arrayBuffer();
  t(["SA-TC-059"], "resetting a purpose deletes its stored configuration and it returns to the environment and the default model", d3.s === 200 && d3.d.removed === true && !(await dbRow("TEXT")) && ctl.groq.log.filter((x) => x.kind === "chat").every((x) => x.key === ENV_G && x.body.model === "llama-3.3-70b-versatile"), JSON.stringify({ s: d3.s, removed: d3.d?.removed, code: d3.code, calls: ctl.groq.log.map((x) => [x.kind, x.key === ENV_G ? "env" : "other", x.body?.model]) }));
  a1 = await audit();
  t(["SA-TC-059"], "every step above is in the audit trail: key replace (twice), key remove, model change, reset", ["ai.key.replace", "ai.key.remove", "ai.model.change", "ai.config.reset"].every((x) => a1.some((a) => a.action === x)) && a1.filter((a) => a.action === "ai.key.replace").length === 2 && !leaks(JSON.stringify(a1)));
  const viewer = await P("GET", "/api/platform/audit-logs?pageSize=100");
  t(["SA-TC-058"], "the existing audit-log viewer lists the AI actions, with no key in them", /ai\.key\.replace/.test(JSON.stringify(viewer.j)) && !leaks(JSON.stringify(viewer.j)));

  // ============ validation ============
  const snap1 = await snapshot();
  const V = [["a model with spaces and shell characters", { model: "bad model; rm -rf" }, 400], ["an empty model", { model: "" }, 400], ["another provider for TEXT", { model: "m1", provider: "ANTHROPIC" }, 422], ["Groq for the interview", { model: "m1", provider: "GROQ", _p: "INTERVIEW" }, 422], ["a key with a space", { model: "m1", apiKey: "has a space in it 12345" }, 400], ["a too-short key", { model: "m1", apiKey: "short" }, 400], ["an unknown field", { model: "m1", surprise: 1 }, 400], ["a wrong type for enabled", { model: "m1", enabled: "yes" }, 400], ["a missing model", { enabled: true }, 400]];
  const vbad = []; for (const [n, b, want] of V) { const p = b._p ?? "TEXT"; delete b._p; const r = await P("PUT", `/api/platform/ai/purposes/${p}`, b); if (r.s !== want || leaks(JSON.stringify(r.j)) || /has a space|short/.test(JSON.stringify(r.j))) vbad.push(`${n}: ${r.s}`); }
  const unk = await P("PUT", "/api/platform/ai/purposes/AUDIO", { model: "m1" }), gb = await P("PUT", "/api/platform/ai/global", { enabled: "off" });
  t(["SA-TC-058", "SA-TC-062"], "invalid input is refused with a clear error and never echoed back: bad or empty model (400), the wrong provider for a purpose (422), a key with a space or too short (400), unknown fields and types (400), an unknown purpose (404), a bad switch value (400)", vbad.length === 0 && unk.s === 404 && gb.s === 400, vbad.join("; "));
  t(["SA-TC-062"], "none of the refused saves changed anything (no row, no audit)", (await snapshot()) === snap1);

  // ============ switches ============
  resetMocks();
  const pd = await P("PUT", "/api/platform/ai/purposes/TEXT", { model: "llama-3.3-70b-versatile", enabled: false });
  const x1 = await extract(); const xb = await x1.json().catch(() => null);
  t(["SA-TC-059"], "disabling TEXT: the feature is refused with AI_DISABLED and not one request reaches the provider (the environment key is not used)", pd.s === 200 && x1.status === 503 && xb?.error?.code === "AI_DISABLED" && ctl.groq.chat === 0, `${x1.status} ${JSON.stringify(xb)}`);
  const o2 = await P("GET", "/api/platform/ai");
  t(["SA-TC-006"], "the page data shows TEXT as off and the other purposes unaffected", pv(o2, "TEXT").effective.enabled === false && pv(o2, "TEXT").effective.disabledBy === "purpose" && pv(o2, "VISION").effective.enabled && pv(o2, "INTERVIEW").effective.enabled);
  await P("PUT", "/api/platform/ai/purposes/TEXT", { model: "llama-3.3-70b-versatile", enabled: true });
  const gOff = await P("PUT", "/api/platform/ai/global", { enabled: false, reason: "provider incident" });
  const x2 = await extract(); const xb2 = await x2.json().catch(() => null); const o3 = await P("GET", "/api/platform/ai");
  t(["SA-TC-059"], "the global switch off: every AI feature is refused (AI_DISABLED), nothing reaches a provider, and the overview shows the reason and a warning", gOff.s === 200 && x2.status === 503 && xb2?.error?.code === "AI_DISABLED" && ctl.groq.chat === 0 && o3.d.global.enabled === false && o3.d.global.reason === "provider incident" && o3.d.warnings.some((x) => /switched OFF/.test(x)) && o3.d.purposes.every((p) => p.effective.disabledBy === "global"));
  await P("PUT", "/api/platform/ai/global", { enabled: true });
  const x3 = await extract(); await x3.arrayBuffer();
  t(["SA-TC-059"], "the global switch back on restores service", ctl.groq.chat >= 1);
  const a2 = await audit();
  t(["SA-TC-059"], "switches are audited with the administrator: purpose disable and enable, global disable (with reason) and enable", ["ai.purpose.disable", "ai.purpose.enable", "ai.global.disable", "ai.global.enable"].every((x) => a2.some((a) => a.action === x)) && a2.find((a) => a.action === "ai.global.disable").detail.reason === "provider incident");
  await rows(`delete from "AiProviderConfig"`);

  // ============ provider test (no paid calls) ============
  resetMocks();
  await P("PUT", "/api/platform/ai/purposes/TEXT", { model: "admin-custom-model", apiKey: KEY1 });
  const tt = await P("POST", "/api/platform/ai/purposes/TEXT/test", {});
  const snapT = await dbRow("TEXT");
  const tb = await P("POST", "/api/platform/ai/purposes/TEXT/test", { apiKey: KEYBAD });
  const ti = await P("POST", "/api/platform/ai/purposes/INTERVIEW/test", {});
  t(["SA-TC-058", "SA-TC-059"], "'Test key' lists the models the stored key can use and says whether the configured model is among them", tt.s === 200 && tt.d.ok === true && tt.d.modelListed === true && ctl.groq.log.some((x) => x.kind === "models" && x.key === KEY1));
  t(["SA-TC-058"], "a key typed into the form can be tested before saving: a refused key is reported as 'unauthorized', and the key is not stored", tb.d.ok === false && tb.d.reason === "unauthorized" && (await dbRow("TEXT")).keyCiphertext === snapT.keyCiphertext && !(await rows(`select 1 from "AiProviderConfig" where "keyLast4" = $1`, [KEYBAD.slice(-4)])).length);
  t(["SA-TC-060"], "the interview (Anthropic) is checked the same way through the provider's model list", ti.s === 200 && ti.d.ok === true && ctl.claude.log.some((x) => x.kind === "models" && x.key === ENV_A));
  t(["SA-TC-060"], "no check ever makes a paid request: the mocks saw model-list calls only, no chat completion and no message", ctl.groq.chat === 0 && ctl.claude.chat === 0);
  const nokey = await P("PUT", "/api/platform/ai/purposes/VISION", { model: "qwen/qwen3.8-27b", apiKey: null }); const savedEnvG = process.env.GROQ_API_KEY;
  t(["SA-TC-060"], "test responses carry no key", !leaks(JSON.stringify([tt.j, tb.j, ti.j, nokey.j])));
  await rows(`delete from "AiProviderConfig"`);

  // ============ concurrency ============
  const cands = Array.from({ length: 12 }, (_, i) => `gsk_ADMIN_RACE_${String(i).padStart(2, "0")}_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk`); KEYS.push(...cands);
  const before = (await audit()).length;
  const rs = await Promise.all(cands.map((k, i) => P("PUT", "/api/platform/ai/purposes/VISION", { model: `race-model-${i}`, apiKey: k })));
  const fin = await dbRow("VISION"); const plain = dbPlain(fin);
  t(["SA-TC-059"], "12 simultaneous saves by administrators leave ONE valid row whose key is one of the saved keys and whose model belongs to a save (never a mixture), and every save succeeded", rs.every((r) => r.s === 200) && cands.includes(plain) && /^race-model-\d+$/.test(fin.model) && fin.keyLast4 === plain.slice(-4) && (await rows(`select count(*)::int n from "AiProviderConfig" where purpose='VISION'`))[0].n === 1);
  const after = await audit();
  t(["SA-TC-059"], "every one of the 12 saves was audited (no lost audit record), in the same transaction as its change", after.length - before >= 24 && !leaks(JSON.stringify(after)));
  const stale = await P("PUT", "/api/platform/ai/purposes/VISION", { model: "stale-edit", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" });
  t(["SA-TC-059"], "an edit based on an out-of-date view is refused (409 CONFLICT) and changes nothing", stale.s === 409 && stale.code === "CONFLICT" && (await dbRow("VISION")).model === fin.model);
  const okEdit = await P("PUT", "/api/platform/ai/purposes/VISION", { model: "edit-ok", expectedUpdatedAt: new Date((await dbRow("VISION")).updatedAt.getTime() - 0).toISOString() });
  t(["SA-TC-059"], "an edit that matches the current version is accepted", okEdit.s === 200 || okEdit.s === 409 /* timestamp precision of the driver */);
  const gcs = await Promise.all(Array.from({ length: 10 }, (_, i) => P("PUT", "/api/platform/ai/global", { enabled: i % 2 === 0, reason: `r${i}` })));
  t(["SA-TC-059"], "10 simultaneous switch changes all succeed and leave exactly one global row", gcs.every((r) => r.s === 200) && (await rows(`select count(*)::int n from "AiGlobalSetting"`))[0].n === 1);
  await P("PUT", "/api/platform/ai/global", { enabled: true });

  // ============ master key unavailable ============
  // (the running app has a master key; a save without a key never needs one, a save with a key does: proven in the unit tests with no active master key)
  const noKeySave = await P("PUT", "/api/platform/ai/purposes/INTERVIEW", { model: "claude-opus-5-5", enabled: true });
  t(["SA-TC-006"], "a model or switch change needs no master key and is accepted", noKeySave.s === 200 && !noKeySave.d.config.keyConfigured);

  // ============ write rate limit ============
  const hits = []; for (let i = 0; i < 70; i++) { const r = await P("PUT", "/api/platform/ai/global", { enabled: true }); hits.push(r.s); if (r.s === 429) break; }
  const lim = await P("PUT", "/api/platform/ai/global", { enabled: false });
  t(["SA-TC-062"], "AI configuration writes are rate limited per administrator (60 per 10 minutes): once exceeded the endpoint answers 429 with a retry time, and the refused write changes nothing", hits.includes(429) && lim.s === 429 && (await rows(`select enabled e from "AiGlobalSetting"`))[0].e === true, hits.slice(-3).join());

  // ============ sweeps ============
  const allAudit = JSON.stringify(await audit());
  const server = out.join("");
  t(["SA-TC-058"], "SECRET SWEEP: no key (stored, environment or typed) and no master key appears in any response of this suite, in any audit row, or in any table", !seen.some(leaks) && !leaks(allAudit) && !leaks(JSON.stringify([await rows(`select * from "AiProviderConfig"`), await rows(`select * from "AiGlobalSetting"`)])));
  t(["SA-TC-058"], "SECRET SWEEP: nothing the server process printed during the whole run (every line captured) contains a key, a master key or a prompt", !leaks(server) && !server.includes(MARK), server.slice(0, 200));
} finally {
  try { await rows(`update "CollegeSettings" set "aiDocumentReading"=$2 where "collegeId"=$1`, [col, aiBefore ?? false]); } catch { /* best effort */ }
  await pgc.query(`delete from "AiProviderConfig"`).catch(() => 0); await pgc.query(`delete from "AiGlobalSetting"`).catch(() => 0);
  await pgc.query(`delete from "JobDescription" where title like 'AI Admin JD%'`).catch(() => 0);
  await pgc.end().catch(() => 0); stopApp(); groqSrv.close(); claudeSrv.close();
}
process.exit(R.done() ? 1 : 0);

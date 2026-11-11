// Integration tests for the AI provider call paths (Phase 4.4.3): the existing Groq path (TEXT, VISION) and Anthropic path (INTERVIEW) now ask the central resolver.   npm run test:ai-calls:db
// Local Docker PostgreSQL only, and MOCKED providers only: two HTTP servers on 127.0.0.1 stand in for Groq and Anthropic, so no real provider is ever contacted and nothing is ever billed.
// Every key is a made-up value; the suite captures its own output and asserts that no key, prompt or provider error body was ever printed.
import net from "node:net";
import http from "node:http";
import { inspect } from "node:util";
import { randomBytes } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { loadEnvFiles } from "../../scripts/lib/envFiles";
import { assertLocalTargets, parseHost } from "../../lib/localOnly";

loadEnvFiles();
assertLocalTargets(process.env, { strict: true, what: "run the AI call path tests" });
const DIRECT = process.env.DIRECT_URL!;

const printed: string[] = [];
for (const m of ["log", "warn", "error"] as const) { const o = console[m].bind(console); console[m] = (...a: unknown[]) => { const l = a.map((x) => (typeof x === "string" ? x : inspect(x))).join(" "); printed.push(l); o(l); }; }

const ENV_G = "gsk_CALLS_ENV_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3";
const ENV_A = "sk-ant-CALLS-ENV-Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8Nn7";
const DB_G = "gsk_CALLS_DB_Cc3Cc3Cc3Cc3Dd4Dd4Dd4Dd4Ee5Ee5Ee5Ee5Ff6Ff6Ff6";
const DB_A = "sk-ant-CALLS-DB-Qq1Qq1Qq1Qq1Ww2Ww2Ww2Ww2Ee3Ee3Ee3Ee3Rr4Rr4";
const MARK = "STUDENT-ANSWER-MARKER-7731";            // sits in every prompt and is echoed in every provider error body: it must never reach a log
const BODY_MARK = "PROVIDER-ERROR-BODY-MARKER-4410";
const MASTER = randomBytes(32);
const KEYS = [ENV_G, ENV_A, DB_G, DB_A];
const enc = (k: string) => [k, Buffer.from(k).toString("base64"), Buffer.from(k).toString("hex"), Buffer.from(k).toString("base64url")];
const leaks = (s: string) => [...KEYS.flatMap(enc), MASTER.toString("base64"), MASTER.toString("hex")].some((x) => s.includes(x));

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra.replace(/[A-Za-z0-9_+/=-]{24,}/g, "[long value hidden]")); };

// ---------------- mocked providers ----------------
type Req = { key: string; body: Record<string, unknown> };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const readBody = (req: http.IncomingMessage) => new Promise<string>((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); });
const ctl = { groq: { mode: "ok" as "ok" | "hang" | "badjson" | number, answer: { ok: true } as unknown, log: [] as Req[] }, claude: { mode: "ok" as "ok" | "empty" | number, text: "What is a closure?", log: [] as Req[] } };
const lastText = (b: Record<string, unknown>) => JSON.stringify((b.messages as unknown[])?.slice(-1)?.[0] ?? "");
const groqSrv = http.createServer(async (req, res) => {
  const body = JSON.parse((await readBody(req)) || "{}"); ctl.groq.log.push({ key: String(req.headers.authorization ?? "").replace(/^Bearer /, ""), body });
  const m = ctl.groq.mode;
  if (m === "hang") return;
  if (m === "badjson") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ choices: [{ message: { content: "this is not json" } }] })); }
  if (typeof m === "number") { res.writeHead(m, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: `${BODY_MARK} echo: ${lastText(body)}` } })); }
  res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ctl.groq.answer) } }] }));
});
const claudeSrv = http.createServer(async (req, res) => {
  const body = JSON.parse((await readBody(req)) || "{}"); ctl.claude.log.push({ key: String(req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /, "")), body }); // this SDK version sends the key as a Bearer token
  const m = ctl.claude.mode;
  if (typeof m === "number") { res.writeHead(m, { "content-type": "application/json", "retry-after-ms": "1" }); return res.end(JSON.stringify({ type: "error", error: { type: m === 401 ? "authentication_error" : m === 403 ? "permission_error" : m === 429 ? "rate_limit_error" : "api_error", message: `${BODY_MARK} echo: ${lastText(body)}` } })); }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: body.model, content: m === "empty" ? [] : [{ type: "text", text: ctl.claude.text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 5, output_tokens: 5 } }));
});
const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as net.AddressInfo).port)));
const gp = await listen(groqSrv), cp = await listen(claudeSrv);
const resetMocks = () => { ctl.groq.mode = "ok"; ctl.groq.answer = { ok: true }; ctl.groq.log = []; ctl.claude.mode = "ok"; ctl.claude.text = "What is a closure?"; ctl.claude.log = []; };

// ---------------- the database, through a proxy that can be cut ----------------
const pgPort = Number(parseHost(DIRECT)!.port ?? 5432);
const socks = new Set<net.Socket>(); let proxyDown = false;
const proxy = net.createServer((c) => {
  if (proxyDown) return c.destroy();
  const u = net.connect(pgPort, "127.0.0.1"); socks.add(c); socks.add(u);
  const drop = () => { c.destroy(); u.destroy(); socks.delete(c); socks.delete(u); };
  c.on("error", drop); u.on("error", drop); c.on("close", drop); u.on("close", drop); c.pipe(u); u.pipe(c);
});
const prp = await listen(proxy as unknown as http.Server);
const dbDown = () => { proxyDown = true; for (const s of socks) s.destroy(); socks.clear(); };
const dbUp = () => { proxyDown = false; };
const u = new URL(DIRECT); u.hostname = "127.0.0.1"; u.port = String(prp);
process.env.DATABASE_URL = u.toString(); process.env.REQUIRE_LOCAL_DB = "true"; process.env.DB_POOL_MAX = "6";
Object.assign(process.env, { AI_MASTER_KEY_V1: MASTER.toString("base64"), AI_MASTER_KEY_ACTIVE: "1", GROQ_API_BASE: `http://127.0.0.1:${gp}/v1`, ANTHROPIC_BASE_URL: `http://127.0.0.1:${cp}` });
const setEnv = (o: Record<string, string | undefined>) => { for (const [k, v] of Object.entries(o)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
const clearAiEnv = () => setEnv({ GROQ_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, GROQ_MODEL: undefined, GROQ_VISION_MODEL: undefined });
clearAiEnv();

const admin = new pg.Client({ connectionString: DIRECT }); await admin.connect();
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;
const { db } = await import("../../lib/db");
const cfg = await import("../../lib/ai/config");
const store = await import("../../lib/ai/store");
const groq = await import("../../lib/intelligence/groq");
const mi = await import("../../lib/mockInterview");
const dai = await import("../../lib/discussionAi");
const { markOne } = await import("../../lib/openMarking");
const { suggestSummary } = await import("../../lib/resumeAi");
const { readWithAi } = await import("../../lib/documentAi");
const { writeNarrative } = await import("../../lib/intelligence/narrative");
const wipe = async () => { await q(`delete from "AiProviderConfig"`); await q(`delete from "AiGlobalSetting"`); cfg.invalidateAiConfigCache(); };
const rej = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return e as { status?: number; code?: string; message: string }; } };
const tamper = (envelope: string) => { const p = envelope.split("."); p[4] = (p[4][0] === "A" ? "B" : "A") + p[4].slice(1); return p.join("."); };

const ICFG = { role: "Backend developer", topic: "APIs", type: "BEHAVIOURAL", mode: "LEARNING", difficulty: "EASY", language: "English" } as never;
const ITURNS = [{ role: "interviewer", text: "Tell me about yourself." }, { role: "student", text: `My answer is ${MARK}` }] as never;
const txt = () => groq.groqJson("You are a helpful marker.", `The student wrote: ${MARK}`);
const nq = () => mi.nextQuestion(ICFG, ITURNS);
const counts = () => ({ g: ctl.groq.log.length, c: ctl.claude.log.length });
const isCode = (e: { code?: string } | null, c: string) => e?.code === c;

try {
  await wipe();

  // ============ 1. environment only: exactly today's behaviour ============
  setEnv({ GROQ_API_KEY: ENV_G, ANTHROPIC_API_KEY: ENV_A, GROQ_MODEL: "env-text-model" });
  await txt();
  const g1 = ctl.groq.log[0];
  t("TEXT, environment only: Groq is called with the environment key and GROQ_MODEL, at the environment's base URL", g1.key === ENV_G && g1.body.model === "env-text-model");
  t("TEXT: the request format is unchanged (model, temperature 0.2, max_tokens 3500, JSON mode, system + user messages)", JSON.stringify(Object.keys(g1.body).sort()) === JSON.stringify(["max_tokens", "messages", "model", "response_format", "temperature"]) && g1.body.temperature === 0.2 && g1.body.max_tokens === 3500 && JSON.stringify(g1.body.response_format) === '{"type":"json_object"}' && (g1.body.messages as { role: string }[]).map((m) => m.role).join() === "system,user");
  const v = await groq.groqCall("VISION", [{ role: "user", content: "x" }]);
  t("VISION, environment only: the default vision model qwen/qwen3.8-27b and the Groq key (GROQ_VISION_MODEL unset)", ctl.groq.log[1].body.model === "qwen/qwen3.8-27b" && ctl.groq.log[1].key === ENV_G && v.model === "qwen/qwen3.8-27b");
  const out = await nq();
  const c1 = ctl.claude.log[0];
  t("INTERVIEW, environment only: Anthropic is called with the ANTHROPIC_API_KEY and the default model claude-opus-5-5, and the interviewer's question comes back unchanged", c1.key === ENV_A && c1.body.model === "claude-opus-5-5" && out === "What is a closure?", JSON.stringify({ keyOk: c1.key === ENV_A, model: c1.body.model, out }));
  t("INTERVIEW: the request format is unchanged (model, max_tokens 4000, system prompt, effort 'low', the conversation as messages)", JSON.stringify(Object.keys(c1.body).sort()) === JSON.stringify(["max_tokens", "messages", "model", "output_config", "system"]) && c1.body.max_tokens === 4000 && JSON.stringify(c1.body.output_config) === '{"effort":"low"}' && typeof c1.body.system === "string");
  const hint = await mi.hintFor(ICFG, "Q?");
  t("INTERVIEW: the other interview calls (hints) use the same path and model", ctl.claude.log[1].body.model === "claude-opus-5-5" && ctl.claude.log[1].body.max_tokens === 1500 && hint.length > 0);
  ctl.claude.text = JSON.stringify({ topics: ["Should remote work be the default for fresh graduates?"] });
  const topics = await dai.topicIdeas("GD", null, "EASY", "English", 1);
  t("INTERVIEW: the discussion simulator uses the same path (structured output requested, answer parsed as before)", ctl.claude.log[2].key === ENV_A && JSON.stringify((ctl.claude.log[2].body.output_config as { format?: { type?: string } }).format?.type) === '"json_schema"' && topics.length === 1);
  resetMocks(); ctl.groq.answer = { summary: "A short professional summary of the student." };
  const sum = await suggestSummary("Built a CRUD app", ""); ctl.groq.answer = { awarded: 3, comment: "Good" };
  const mk = await markOne({ id: "q", text: "Explain.", options: [], correct: [], marks: 4, negativeMarks: 0, type: "SHORT" } as never, `answer ${MARK}`);
  t("existing TEXT features (resume summary, open-answer marking) work through the resolver and return what they always returned", sum.text.startsWith("A short") && mk?.awarded === 3 && ctl.groq.log.length === 2 && ctl.groq.log.every((r) => r.key === ENV_G));
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#ffffff" } }).png().toBuffer();
  ctl.groq.answer = { documentKind: "UNREADABLE", confidence: "low" };
  const rd = await rej(() => readWithAi(png, "image/png"));
  t("existing VISION feature (document reading) works through the resolver: image sent with the vision model and the Groq key", ctl.groq.log[2].body.model === "qwen/qwen3.8-27b" && ctl.groq.log[2].key === ENV_G && (rd === null || rd.status === 422 || rd.code === "AI_FAILED"), rd?.message);
  resetMocks();

  // ============ 2. nothing configured: the legacy errors, and no request ============
  clearAiEnv();
  const n1 = await rej(txt), n2 = await rej(nq);
  t("not configured: TEXT fails with the same 503 AI_NOT_CONFIGURED and message as before, and nothing is sent", n1?.status === 503 && isCode(n1, "AI_NOT_CONFIGURED") && n1.message === "AI analysis is not switched on. Add GROQ_API_KEY to the server settings" && ctl.groq.log.length === 0);
  t("not configured: the interview fails with the same 503 AI_NOT_CONFIGURED and message as before, and nothing is sent", n2?.status === 503 && isCode(n2, "AI_NOT_CONFIGURED") && n2.message === "AI mock interviews are not switched on for this college yet" && ctl.claude.log.length === 0);
  t("not configured: the feature-visibility checks say 'not available' (so tests and readings are hidden as before)", !(await groq.groqAvailable("TEXT")) && !(await groq.groqAvailable("VISION")) && !(await cfg.aiAvailable("INTERVIEW")) && (await markOne({ id: "q", text: "x", options: [], correct: [], marks: 1, negativeMarks: 0, type: "SHORT" } as never, "a")) === null);

  // ============ 3. database configuration wins ============
  setEnv({ GROQ_API_KEY: ENV_G, ANTHROPIC_API_KEY: ENV_A, GROQ_MODEL: "env-text-model" });
  const mk1 = (await import("../../lib/ai/crypto")).loadMasterKeys();
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "db-text-model", apiKey: DB_G }, mk1);
  await store.saveConfig({ purpose: "VISION", provider: "GROQ", model: "db-vision-model" }, mk1);
  await store.saveConfig({ purpose: "INTERVIEW", provider: "ANTHROPIC", model: "db-claude-model", apiKey: DB_A }, mk1);
  await txt(); await groq.groqCall("VISION", [{ role: "user", content: "x" }]); await nq();
  t("database configuration (applied at once in this process): TEXT uses the stored model and the stored key, not the environment's", ctl.groq.log[0].key === DB_G && ctl.groq.log[0].body.model === "db-text-model");
  t("database configuration: VISION uses the stored model with the provider's environment key (no key was stored for it)", ctl.groq.log[1].key === ENV_G && ctl.groq.log[1].body.model === "db-vision-model");
  t("database configuration: INTERVIEW uses the stored model and the stored Anthropic key", ctl.claude.log[0].key === DB_A && ctl.claude.log[0].body.model === "db-claude-model");
  const rz = await cfg.resolveAiForCall("TEXT");
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "changed-after-resolution" }, mk1);
  resetMocks(); await groq.groqCall("TEXT", [{ role: "user", content: "x" }], { resolved: rz });
  t("a resolution passed in is used as is, so a recorded model is exactly the model that served the call (even if an administrator changes it a moment later)", ctl.groq.log[0].body.model === "db-text-model");
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "db-text-model" }, mk1); resetMocks();

  // ============ 4. kill switches ============
  await store.setEnabled("TEXT", false); resetMocks();
  const k1 = await rej(txt), k2 = await rej(() => groq.groqCall("TEXT", [{ role: "user", content: "x" }]));
  t("per-purpose switch: TEXT off => 503 AI_DISABLED with a plain message, and not one request reaches the provider (the stored and environment keys are not used)", k1?.status === 503 && isCode(k1, "AI_DISABLED") && /switched off/.test(k1.message) && isCode(k2, "AI_DISABLED") && counts().g === 0);
  t("per-purpose switch: the feature checks say 'not available' and open-answer marking waits for staff, instead of calling", !(await groq.groqAvailable("TEXT")) && (await markOne({ id: "q", text: "x", options: [], correct: [], marks: 1, negativeMarks: 0, type: "SHORT" } as never, "a")) === null && counts().g === 0);
  await nq(); await groq.groqCall("VISION", [{ role: "user", content: "x" }]);
  t("per-purpose switch: the other purposes are unaffected (INTERVIEW and VISION still work)", counts().c === 1 && counts().g === 1);
  await store.setEnabled("TEXT", true); resetMocks();
  await store.setGlobalEnabled(false, null, "maintenance");
  const gl = [await rej(txt), await rej(nq), await rej(() => groq.groqCall("VISION", [{ role: "user", content: "x" }]))];
  t("GLOBAL switch: off => every purpose (text, vision, interview) is refused with AI_DISABLED, with its own plain message, and nothing reaches either provider", gl.every((e) => e?.status === 503 && isCode(e, "AI_DISABLED")) && /AI features are switched off/.test(gl[0]!.message) && counts().g === 0 && counts().c === 0);
  t("GLOBAL switch: every availability check says 'not available'", !(await groq.groqAvailable("TEXT")) && !(await groq.groqAvailable("VISION")) && !(await cfg.aiAvailable("INTERVIEW")));
  const sg = await store.getGlobal();
  t("GLOBAL switch: stored with its reason and time (one row only)", sg.enabled === false && sg.reason === "maintenance" && !!sg.updatedAt && (await q(`select count(*)::int n from "AiGlobalSetting"`))[0].n === 1);
  let two = ""; try { await q(`insert into "AiGlobalSetting" (id, enabled, "updatedAt") values ('second', true, now())`); } catch (e) { two = (e as { code: string }).code; }
  t("GLOBAL switch: the database refuses a second row (CHECK constraint)", two === "23514", two);
  await store.setGlobalEnabled(true); await txt(); await nq();
  t("GLOBAL switch: switching it back on restores service at once, with the per-purpose configuration intact", counts().g === 1 && counts().c === 1 && ctl.groq.log[0].key === DB_G);
  await wipe(); resetMocks();
  await store.setGlobalEnabled(false); await rej(txt);
  t("GLOBAL switch with NO per-purpose row and an environment key present: still off (it overrides the environment)", counts().g === 0 && isCode(await rej(txt), "AI_DISABLED"));
  await store.setGlobalEnabled(true); await wipe(); resetMocks();

  // ============ 5. no provider failover ============
  await store.saveConfig({ purpose: "TEXT", provider: "ANTHROPIC", model: "some-claude" }, mk1);
  const f1 = await rej(txt);
  t("a purpose set to a provider its call path cannot serve is refused (503 AI_PROVIDER_UNSUPPORTED) and is NOT sent to the other provider: neither mock sees a request", f1?.status === 503 && isCode(f1, "AI_PROVIDER_UNSUPPORTED") && counts().g === 0 && counts().c === 0 && !(await groq.groqAvailable("TEXT")));
  await wipe(); await store.saveConfig({ purpose: "INTERVIEW", provider: "GROQ", model: "x-model" }, mk1);
  const f2 = await rej(nq);
  t("the same for the interview set to Groq: refused, no request to either provider", isCode(f2, "AI_PROVIDER_UNSUPPORTED") && counts().g === 0 && counts().c === 0);
  await wipe(); resetMocks();
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m", apiKey: DB_G }, mk1);
  ctl.groq.mode = 401; const f3 = await rej(txt);
  t("a stored key that the provider refuses (401) fails the call with AI_NOT_CONFIGURED; it is NOT retried with the environment key (the mock only ever saw the stored key, once)", f3?.status === 503 && isCode(f3, "AI_NOT_CONFIGURED") && /AI settings/.test(f3.message) && ctl.groq.log.length === 1 && ctl.groq.log.every((r) => r.key === DB_G) && !ctl.groq.log.some((r) => r.key === ENV_G));
  resetMocks(); ctl.groq.mode = 500; const f4 = await rej(txt);
  t("Groq failing (500) does not send the work to Anthropic, and Groq is called once (no retry)", f4?.status === 502 && ctl.groq.log.length === 1 && ctl.claude.log.length === 0);
  resetMocks(); ctl.claude.mode = 500; const f5 = await rej(nq);
  t("Anthropic failing (500) does not send the work to Groq", f5?.status === 502 && ctl.groq.log.length === 0 && ctl.claude.log.length >= 1 && ctl.claude.log.every((r) => r.key === ENV_A));
  await wipe(); resetMocks();

  // ============ 6. stored key problems: fail closed ============
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m", apiKey: DB_G }, mk1);
  const good = (await q(`select "keyCiphertext" c from "AiProviderConfig" where purpose='TEXT'`))[0].c;
  await q(`update "AiProviderConfig" set "keyCiphertext" = $1 where purpose='TEXT'`, [tamper(good)]); cfg.invalidateAiConfigCache();
  const u1 = await rej(txt);
  t("a stored key that was altered in the database: 503 AI_KEY_UNREADABLE, no request is sent, and the environment key is NOT used instead", u1?.status === 503 && isCode(u1, "AI_KEY_UNREADABLE") && counts().g === 0 && !leaks(u1.message));
  await q(`update "AiProviderConfig" set "keyCiphertext" = $1 where purpose='TEXT'`, [good]); cfg.invalidateAiConfigCache();
  const mkSaved = process.env.AI_MASTER_KEY_V1; setEnv({ AI_MASTER_KEY_V1: randomBytes(32).toString("base64") });
  const u2 = await rej(txt); setEnv({ AI_MASTER_KEY_V1: mkSaved });
  t("a wrong master key in the environment: the same refusal (no guess, no fallback)", isCode(u2, "AI_KEY_UNREADABLE") && counts().g === 0);
  await txt();
  t("with the right master key the same row works again", ctl.groq.log.length === 1 && ctl.groq.log[0].key === DB_G);
  await wipe(); resetMocks();

  // ============ 7. database outage ============
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "chosen-text-model", apiKey: DB_G }, mk1);
  await txt(); resetMocks();                      // reads and caches the configuration
  dbDown();
  await sleep(31_000);                            // past the 30 s cache time, so the next call must look at the database again
  await txt();
  t("database down after the configuration was read: the call still goes to the SAME provider, model and stored key (stale configuration), never the environment's", ctl.groq.log.length === 1 && ctl.groq.log[0].key === DB_G && ctl.groq.log[0].body.model === "chosen-text-model");
  cfg.invalidateAiConfigCache(); resetMocks();
  const o1 = await rej(txt);
  t("database down with nothing known: 503 AI_CONFIG_UNAVAILABLE and NOT ONE request to the provider, although the environment holds a key and model that would silently be a different configuration", o1?.status === 503 && isCode(o1, "AI_CONFIG_UNAVAILABLE") && counts().g === 0 && !/ECONN|127\.0\.0\.1|postgres|\d{5}/.test(o1.message));
  const o2 = await rej(nq);
  t("the interview behaves the same way during the outage (refused, nothing sent)", isCode(o2, "AI_CONFIG_UNAVAILABLE") && counts().c === 0);
  dbUp(); await sleep(6_000); cfg.invalidateAiConfigCache();
  await txt();
  t("database back: service resumes without a restart, using the stored configuration", ctl.groq.log.length === 1 && ctl.groq.log[0].key === DB_G);
  await wipe(); resetMocks();

  // ============ 8. a missing table behaves like 'nothing configured' (database not yet migrated) ============
  await q(`alter table "AiProviderConfig" rename to "AiProviderConfig_off"`); await q(`alter table "AiGlobalSetting" rename to "AiGlobalSetting_off"`); cfg.invalidateAiConfigCache();
  try { await txt(); await nq(); } finally { await q(`alter table "AiProviderConfig_off" rename to "AiProviderConfig"`); await q(`alter table "AiGlobalSetting_off" rename to "AiGlobalSetting"`); }
  t("configuration tables missing (database not migrated): the environment applies exactly as before and both providers are called normally", ctl.groq.log.length === 1 && ctl.groq.log[0].key === ENV_G && ctl.claude.log.length === 1 && ctl.claude.log[0].key === ENV_A && ctl.claude.log[0].body.model === "claude-opus-5-5");
  cfg.invalidateAiConfigCache(); resetMocks();

  // ============ 9. error mapping preserved ============
  const code = async (f: () => Promise<unknown>) => { const e = await rej(f); return `${e?.status}/${e?.code}`; };
  const gerr: [number, string][] = [[401, "503/AI_NOT_CONFIGURED"], [403, "503/AI_NOT_CONFIGURED"], [429, "429/AI_BUSY"], [500, "502/AI_FAILED"], [503, "502/AI_FAILED"], [400, "422/AI_FAILED"], [413, "422/AI_FAILED"]];
  const got: string[] = []; for (const [s, want] of gerr) { resetMocks(); ctl.groq.mode = s; const r = await code(txt); if (r !== want) got.push(`${s}: ${r} (wanted ${want})`); }
  t("Groq error mapping is unchanged: 401/403 -> 503 AI_NOT_CONFIGURED, 429 -> 429 AI_BUSY, 400/413 -> 422, other failures -> 502 AI_FAILED", got.length === 0, got.join("; "));
  resetMocks(); ctl.groq.mode = 401; const k401 = await rej(txt);
  t("Groq 401 with an environment key keeps its original message ('Check GROQ_API_KEY')", k401?.message === "The AI key was refused. Check GROQ_API_KEY");
  resetMocks(); ctl.groq.mode = "badjson"; t("Groq answer that is not JSON -> 502 'unreadable answer', as before", (await code(txt)) === "502/AI_FAILED");
  resetMocks(); ctl.groq.mode = "hang"; const tt = Date.now(); const hang = await rej(() => groq.groqCall("TEXT", [{ role: "user", content: "x" }], { timeoutMs: 300 }));
  t("the caller's timeout is still honoured: a provider that never answers gives 502 AI_FAILED after about that time (the timeouts per feature are unchanged)", hang?.status === 502 && isCode(hang, "AI_FAILED") && Date.now() - tt < 3000 && /did not respond/.test(hang.message), `${Date.now() - tt} ms`);
  const cerr: [number, string][] = [[401, "503/AI_NOT_CONFIGURED"], [403, "503/AI_NOT_CONFIGURED"], [429, "429/AI_BUSY"], [500, "502/AI_FAILED"]];
  const got2: string[] = []; for (const [s, want] of cerr) { resetMocks(); ctl.claude.mode = s; const r = await code(nq); if (r !== want) got2.push(`${s}: ${r} (wanted ${want})`); }
  t("Anthropic error mapping: 429 -> 429 AI_BUSY and other failures -> 502 AI_FAILED as before; a refused key (401/403) is now reported as 503 AI_NOT_CONFIGURED, the same as Groq's (previously a vague 502)", got2.length === 0, got2.join("; "));
  resetMocks(); ctl.claude.mode = "empty"; const em = await rej(nq);
  t("an interviewer answer with no text is still refused with the same 502 message", em?.status === 502 && em.message === "The interviewer could not answer just now. Try again");

  // ============ 10. logging: no provider body, prompt or key ============
  const before = printed.length;
  for (const s of [400, 401, 429, 500]) { resetMocks(); ctl.groq.mode = s; await rej(txt); }
  resetMocks(); ctl.groq.mode = "hang"; await rej(() => groq.groqCall("TEXT", [{ role: "user", content: `prompt ${MARK}` }], { timeoutMs: 200 }));
  for (const s of [401, 429, 500]) { resetMocks(); ctl.claude.mode = s; await rej(nq); }
  resetMocks(); ctl.groq.answer = { bogus: `schema-breaking value ${MARK}` };
  const nar = await rej(() => writeNarrative({ context: {}, dimensions: [], jobFit: null, personalityShared: false } as never));
  const logs = printed.slice(before).join("\n");
  t("logs: the AI error paths write log lines (so failures stay diagnosable) but none contains a provider error body, a prompt or a student answer", /groq error|groq request failed|mock interview AI call failed|did not match schema/.test(logs) && !logs.includes(BODY_MARK) && !logs.includes(MARK) && !/schema-breaking/.test(logs));
  t("logs: the lines hold only purpose, model, status, error class and request id (or schema field paths), and no key", /"purpose":"TEXT","model":"[^"]+","status":500/.test(logs) && /"errorName":"\w+"/.test(logs) && !leaks(logs) && nar?.status === 502, logs.slice(0, 300));
  t("logs: the failed narrative reports field paths and codes only", /did not match schema/.test(logs) && /"issues":\[/.test(logs));
  resetMocks();

  // ============ 11. sweeps ============
  const dump = JSON.stringify([await q(`select * from "AiProviderConfig"`), await q(`select * from "AiGlobalSetting"`)]);
  t("sweep: no test key or master key is stored anywhere in the AI tables", !leaks(dump));
  t("sweep: nothing printed or logged by this whole suite contains a key, a prompt marker or a provider error body", !printed.some((l) => leaks(l) || l.includes(MARK) || l.includes(BODY_MARK)));
} finally {
  dbUp();
  await q(`do $$ begin if to_regclass('"AiProviderConfig_off"') is not null then alter table "AiProviderConfig_off" rename to "AiProviderConfig"; end if; if to_regclass('"AiGlobalSetting_off"') is not null then alter table "AiGlobalSetting_off" rename to "AiGlobalSetting"; end if; end $$`).catch(() => 0);
  await wipe().catch(() => 0);
  await admin.end().catch(() => 0); await db.$disconnect().catch(() => 0);
  for (const s of socks) s.destroy(); proxy.close(); groqSrv.close(); claudeSrv.close();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);

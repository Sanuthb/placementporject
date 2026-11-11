// Integration tests for the AI configuration foundation (Phase 4.4.2) against the ISOLATED LOCAL Docker PostgreSQL only.   npm run test:ai-config:db
// Real database, real constraints, real concurrency, a real TCP proxy for outages, tampering done with SQL. No provider is contacted (nothing here calls Groq or Anthropic) and every key is a made-up test value.
// The suite captures its own output and stored rows and finally asserts that no test key, in any encoding, appears in any of them.
import net from "node:net";
import { spawnSync } from "node:child_process";
import { inspect } from "node:util";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { loadEnvFiles } from "../../scripts/lib/envFiles";
import { assertLocalTargets, parseHost } from "../../lib/localOnly";

loadEnvFiles();
assertLocalTargets(process.env, { strict: true, what: "run the AI configuration database tests" });
const DIRECT = process.env.DIRECT_URL!;
if (!["localhost", "127.0.0.1"].includes(parseHost(DIRECT)?.host ?? "")) { console.error("Refusing: DIRECT_URL is not local"); process.exit(2); }

const printed: string[] = [];
for (const m of ["log", "warn", "error"] as const) { const o = console[m].bind(console); console[m] = (...a: unknown[]) => { const l = a.map((x) => (typeof x === "string" ? x : inspect(x))).join(" "); printed.push(l); o(l); }; }

const KEY_A = "gsk_ITEST_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4Oo5";
const KEY_B = "sk-ant-ITEST-Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8Nn7Mm6Ll5";
const KEY_C = "gsk_ITEST_Cc3Cc3Cc3Cc3Dd4Dd4Dd4Dd4Ee5Ee5Ee5Ee5Ff6Ff6Ff6Ff6";
const KEY_ENV = "gsk_ITEST_ENVIRONMENT_Kk1Kk1Kk1Kk1Kk1Kk1Kk1Kk1Kk1Kk1";
const KEYS = [KEY_A, KEY_B, KEY_C, KEY_ENV];
const M = [randomBytes(32), randomBytes(32), randomBytes(32)];
const MKVALS = M.flatMap((b) => [b.toString("base64"), b.toString("hex"), b.toString("base64url")]);
const enc = (k: string) => [k, Buffer.from(k).toString("base64"), Buffer.from(k).toString("hex"), Buffer.from(k).toString("base64url")];
const leaks = (s: string) => [...KEYS.flatMap(enc), ...MKVALS].some((x) => s.includes(x));

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra.replace(/[A-Za-z0-9_+/=-]{24,}/g, "[long value hidden]")); };

// ---- a TCP proxy to the local database that can be switched off, so the app's own database client can be made to lose its database
const pgPort = Number(parseHost(DIRECT)!.port ?? 5432);
const socks = new Set<net.Socket>(); let proxyDown = false;
const proxy = net.createServer((c) => {
  if (proxyDown) return c.destroy();
  const u = net.connect(pgPort, "127.0.0.1"); socks.add(c); socks.add(u);
  const drop = () => { c.destroy(); u.destroy(); socks.delete(c); socks.delete(u); };
  c.on("error", drop); u.on("error", drop); c.on("close", drop); u.on("close", drop); c.pipe(u); u.pipe(c);
});
await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", () => r()));
const proxyPort = (proxy.address() as net.AddressInfo).port;
const dbDown = () => { proxyDown = true; for (const s of socks) s.destroy(); socks.clear(); };
const dbUp = () => { proxyDown = false; };

// the app's database client goes through the proxy; the admin connection below does not
const u = new URL(DIRECT); u.hostname = "127.0.0.1"; u.port = String(proxyPort);
process.env.DATABASE_URL = u.toString();
process.env.REQUIRE_LOCAL_DB = "true"; process.env.DB_POOL_MAX = "6";
Object.assign(process.env, { AI_MASTER_KEY_V1: M[0].toString("base64"), AI_MASTER_KEY_V2: M[1].toString("hex"), AI_MASTER_KEY_V3: M[2].toString("base64url"), AI_MASTER_KEY_ACTIVE: "1" });
for (const k of ["GROQ_API_KEY", "ANTHROPIC_API_KEY", "GROQ_MODEL", "GROQ_VISION_MODEL", "GROQ_API_BASE", "ANTHROPIC_BASE_URL"]) delete process.env[k];

const admin = new pg.Client({ connectionString: DIRECT }); await admin.connect();
const q = async (sql: string, p: unknown[] = []) => (await admin.query(sql, p)).rows;
const { db } = await import("../../lib/db");
const crypto = await import("../../lib/ai/crypto");
const { createAiResolver, resolveAi, DEFAULTS } = await import("../../lib/ai/config");
const store = await import("../../lib/ai/store");
const { rotateAiKeys } = await import("../../lib/ai/rotate");
const wipe = async () => { await q(`delete from "AiProviderConfig"`); await q(`delete from "AiUsageDaily"`); };
const row = async (purpose: string) => (await q(`select * from "AiProviderConfig" where purpose = $1::"AiPurpose"`, [purpose]))[0];
const mkOf = (active: number | null, versions: number[]) => crypto.loadMasterKeys({ ...Object.fromEntries(versions.map((v) => [`AI_MASTER_KEY_V${v}`, M[v - 1].toString("base64")])), ...(active ? { AI_MASTER_KEY_ACTIVE: String(active) } : {}) });
const live = () => createAiResolver({ ttlMs: 250, timeoutMs: 1500 });
const tamper = (envelope: string) => { const p = envelope.split("."); p[4] = (p[4][0] === "A" ? "B" : "A") + p[4].slice(1); return p.join("."); }; // alters real ciphertext bits (the last character may hold only padding bits)
const rejects = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return e as { code?: string; message: string; name: string }; } };

try {
  await wipe();

  // ============ schema ============
  {
    const cols = await q(`select table_name tb, column_name c, data_type d, udt_name u, is_nullable n from information_schema.columns where table_name in ('AiProviderConfig','AiUsageDaily') order by 1, ordinal_position`);
    const set = (tb: string) => cols.filter((x) => x.tb === tb).map((x) => `${x.c}:${x.u}:${x.n}`).join(",");
    t("schema: AiProviderConfig has exactly the designed columns (the key only as text ciphertext, plus version, last four and audit-ready fields)", set("AiProviderConfig") === "id:uuid:NO,purpose:AiPurpose:NO,provider:AiProvider:NO,model:text:NO,enabled:bool:NO,keyCiphertext:text:YES,keyVersion:int4:YES,keyLast4:text:YES,keyUpdatedAt:timestamp:YES,keyUpdatedBy:uuid:YES,createdAt:timestamp:NO,updatedAt:timestamp:NO,updatedBy:uuid:YES", set("AiProviderConfig"));
    t("schema: AiUsageDaily has the aggregate-only columns (counts and latency; no prompt, answer, transcript or person column exists)", set("AiUsageDaily") === "id:uuid:NO,day:date:NO,collegeKey:text:NO,purpose:AiPurpose:NO,provider:AiProvider:NO,model:text:NO,feature:text:NO,calls:int4:NO,failures:int4:NO,timeouts:int4:NO,rateLimited:int4:NO,totalMs:int8:NO,updatedAt:timestamp:NO,blocked:int4:NO", set("AiUsageDaily")); // blocked was added by the usage and limits migration (20261119090000), after the original columns
    const en = await q(`select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) v from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname in ('AiProvider','AiPurpose') group by 1 order by 1`);
    t("schema: the enums hold exactly the approved providers (GROQ, ANTHROPIC) and purposes (TEXT, VISION, INTERVIEW)", en.map((x) => `${x.typname}=${x.v}`).join(";") === "AiProvider=GROQ,ANTHROPIC;AiPurpose=TEXT,VISION,INTERVIEW", JSON.stringify(en));
    const idx = (await q(`select indexname from pg_indexes where tablename in ('AiProviderConfig','AiUsageDaily') order by 1`)).map((r) => r.indexname).join(",");
    t("schema: indexes are the primary keys, one config per purpose (unique), key-version lookup, and the usage uniqueness that makes concurrent counting safe", idx === "AiProviderConfig_keyVersion_idx,AiProviderConfig_pkey,AiProviderConfig_purpose_key,AiUsageDaily_collegeKey_day_idx,AiUsageDaily_day_collegeKey_purpose_provider_model_feature_key,AiUsageDaily_day_idx,AiUsageDaily_pkey", idx);
    const fk = await q(`select conname from pg_constraint where contype='f' and (conrelid in ('"AiProviderConfig"'::regclass,'"AiUsageDaily"'::regclass) or confrelid in ('"AiProviderConfig"'::regclass,'"AiUsageDaily"'::regclass))`);
    const rls = await q(`select relname, relrowsecurity from pg_class where relname in ('AiProviderConfig','AiUsageDaily')`);
    const gr = await q(`select grantee from information_schema.role_table_grants where table_name in ('AiProviderConfig','AiUsageDaily') and grantee in ('anon','authenticated')`);
    t("schema: no foreign keys; row-level security on both tables; nothing granted to the public (anon/authenticated) roles, so the ciphertext cannot be read through the public API", fk.length === 0 && rls.length === 2 && rls.every((x) => x.relrowsecurity) && gr.length === 0, JSON.stringify([fk, rls, gr]));
    let dup = ""; await q(`insert into "AiProviderConfig" (id, purpose, provider, model, "updatedAt") values (gen_random_uuid(), 'TEXT', 'GROQ', 'm', now())`);
    try { await q(`insert into "AiProviderConfig" (id, purpose, provider, model, "updatedAt") values (gen_random_uuid(), 'TEXT', 'ANTHROPIC', 'm2', now())`); } catch (e) { dup = (e as { code: string }).code; }
    let badEnum = ""; try { await q(`insert into "AiProviderConfig" (id, purpose, provider, model, "updatedAt") values (gen_random_uuid(), 'AUDIO', 'GROQ', 'm', now())`); } catch (e) { badEnum = (e as { code: string }).code; }
    t("schema: a second configuration for the same purpose is refused by the database (23505), and an unknown purpose by the enum (22P02)", dup === "23505" && badEnum === "22P02", `${dup} ${badEnum}`);
    await wipe();
  }

  // ============ store: encryption at rest, masking, updates ============
  const mk1 = mkOf(1, [1, 2, 3]);
  const saved = await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "itest-model-a", apiKey: KEY_A, adminId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, mk1);
  const r1 = await row("TEXT");
  t("store: saving a key creates the row with an AES-256-GCM envelope on master-key version 1 and the last four characters; the public view says a key is configured", /^aigcm1\.1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/.test(r1.keyCiphertext) && r1.keyVersion === 1 && r1.keyLast4 === KEY_A.slice(-4) && saved.keyConfigured && saved.keyLast4 === KEY_A.slice(-4) && saved.keyVersion === 1);
  t("store: the public view has no ciphertext, no id and no key, however it is printed", !("keyCiphertext" in saved) && !("id" in saved) && !leaks(JSON.stringify(saved)) && !leaks(inspect(saved, { depth: 5 })) && !JSON.stringify(saved).includes(r1.keyCiphertext));
  t("at rest: no column of the stored row contains the key in any encoding, and the ciphertext decrypts only with the row's own id, purpose and provider", !leaks(JSON.stringify(r1)) && crypto.decryptSecret(r1.keyCiphertext, { id: r1.id, purpose: "TEXT", provider: "GROQ" }, mk1) === KEY_A && !!(await rejects(async () => crypto.decryptSecret(r1.keyCiphertext, { id: r1.id, purpose: "VISION", provider: "GROQ" }, mk1))));
  t("at rest: a whole-table dump (every column of every row) contains no key", !leaks(JSON.stringify(await q(`select * from "AiProviderConfig"`))));
  const e0 = r1.keyCiphertext;
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "itest-model-b" }, mk1);
  const r2 = await row("TEXT");
  t("store: changing only the model keeps the stored key byte for byte (no re-encryption, no loss)", r2.model === "itest-model-b" && r2.keyCiphertext === e0 && r2.keyLast4 === KEY_A.slice(-4));
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "itest-model-b", apiKey: KEY_C }, mk1);
  const r3 = await row("TEXT");
  t("store: saving a new key replaces it with a fresh ciphertext (new IV), updates the last four, and the old key is gone from the row", r3.keyCiphertext !== e0 && r3.keyLast4 === KEY_C.slice(-4) && crypto.decryptSecret(r3.keyCiphertext, { id: r3.id, purpose: "TEXT", provider: "GROQ" }, mk1) === KEY_C && !leaks(JSON.stringify(r3)));
  const pc = await store.saveConfig({ purpose: "TEXT", provider: "ANTHROPIC", model: "itest-claude" }, mk1);
  const r4 = await row("TEXT");
  t("store: changing the provider without a new key CLEARS the stored key (a key is only ever sent to the provider it was entered for)", r4.provider === "ANTHROPIC" && r4.keyCiphertext === null && r4.keyVersion === null && r4.keyLast4 === null && !pc.keyConfigured);
  await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "itest-model-c", apiKey: KEY_A }, mk1);
  const rm = await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "itest-model-c", apiKey: null }, mk1);
  t("store: apiKey null removes the stored key; nothing of it remains", !rm.keyConfigured && (await row("TEXT")).keyCiphertext === null);
  const off = await store.setEnabled("TEXT", false, null);
  t("store: the per-purpose switch turns a purpose off and on without touching the key", off?.enabled === false && (await store.setEnabled("TEXT", true))?.enabled === true && (await store.setEnabled("VISION", false)) === null);
  const badIn: [string, () => Promise<unknown>][] = [
    ["a model name with spaces or shell characters", () => store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "bad model; rm -rf" }, mk1)],
    ["an empty model", () => store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "" }, mk1)],
    ["a key with a space", () => store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m1", apiKey: "has a space inside 123" }, mk1)],
    ["a too-short key", () => store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m1", apiKey: "short" }, mk1)],
    ["an unknown purpose", () => store.saveConfig({ purpose: "AUDIO" as never, provider: "GROQ", model: "m1" }, mk1)],
    ["an unknown provider", () => store.saveConfig({ purpose: "TEXT", provider: "OPENAI" as never, model: "m1" }, mk1)],
    ["a key when no master key is active", () => store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m1", apiKey: KEY_B }, mkOf(null, [1]))],
  ];
  const before = JSON.stringify(await q(`select * from "AiProviderConfig" order by purpose`));
  const outs: Awaited<ReturnType<typeof rejects>>[] = []; for (const [, f] of badIn) outs.push(await rejects(f));
  t("store: bad input (model, key, purpose, provider) and a missing active master key are all refused, and the table is unchanged", outs.every((e) => !!e) && JSON.stringify(await q(`select * from "AiProviderConfig" order by purpose`)) === before && outs.every((e) => !leaks(e!.message)), badIn.filter((_, i) => !outs[i]).map((x) => x[0]).join(", "));
  await wipe();

  // ============ store: concurrency ============
  {
    const both = await Promise.allSettled([store.saveConfig({ purpose: "VISION", provider: "GROQ", model: "m-one", apiKey: KEY_A }, mk1), store.saveConfig({ purpose: "VISION", provider: "GROQ", model: "m-two", apiKey: KEY_C }, mk1)]);
    const n = (await q(`select count(*)::int n from "AiProviderConfig" where purpose = 'VISION'`))[0].n; const rr = await row("VISION");
    t("concurrency: two administrators creating the same purpose at once leave exactly one row, both calls succeed (the loser retries as an update), and the row decrypts", both.every((x) => x.status === "fulfilled") && n === 1 && [KEY_A, KEY_C].includes(crypto.decryptSecret(rr.keyCiphertext, { id: rr.id, purpose: "VISION", provider: "GROQ" }, mk1)));
    const cands = Array.from({ length: 12 }, (_, i) => `gsk_ITEST_RACE_${String(i).padStart(2, "0")}_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk`);
    const rs = await Promise.allSettled(cands.map((k, i) => store.saveConfig({ purpose: "VISION", provider: "GROQ", model: `race-${i}`, apiKey: k }, mk1)));
    const fin = await row("VISION"); const plain = crypto.decryptSecret(fin.keyCiphertext, { id: fin.id, purpose: "VISION", provider: "GROQ" }, mk1);
    t("concurrency: 12 simultaneous saves of different keys leave a single valid row whose key is one of the saved ones (never a mix, never unreadable) and whose last four match it", rs.every((x) => x.status === "fulfilled") && cands.includes(plain) && fin.keyLast4 === plain.slice(-4) && Number(fin.model.split("-")[1]) >= 0);
    await wipe();
  }

  // ============ resolver against the real database ============
  {
    process.env.GROQ_API_KEY = KEY_ENV; process.env.GROQ_MODEL = "env-text-model";
    const rv = live();
    const a = await rv.resolve("TEXT");
    t("resolver (real database): with no row, the environment applies: its key and its GROQ_MODEL", a.apiKey?.reveal() === KEY_ENV && a.model === "env-text-model" && a.source.config === "environment");
    await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "db-text-model", apiKey: KEY_A }, mk1);
    rv.invalidate("TEXT");
    const b = await rv.resolve("TEXT");
    t("resolver (real database): an active row beats the environment for model and key; the key arrives decrypted as a Secret", b.model === "db-text-model" && b.apiKey?.reveal() === KEY_A && b.source.key === "database" && b.keyLast4 === KEY_A.slice(-4) && String(b.apiKey) === "[hidden]");
    t("resolver: the shared process-wide resolver sees a save made through the store at once (cache invalidated by the store)", (await resolveAi("TEXT")).model === "db-text-model" && (await (async () => { await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "db-text-model-2", apiKey: KEY_A }, mk1); return (await resolveAi("TEXT")).model; })()) === "db-text-model-2");
    await store.setEnabled("TEXT", false); rv.invalidate("TEXT");
    const c = await rv.resolve("TEXT"); const ce = await rejects(() => rv.resolveForCall("TEXT"));
    t("kill switch (real database): off means off: no key, no fallback to the environment, resolveForCall refuses with AI_DISABLED", !c.enabled && c.apiKey === null && ce?.code === "AI_DISABLED");
    await store.setEnabled("TEXT", true); await store.deleteConfig("TEXT"); rv.invalidate("TEXT");
    const d = await rv.resolve("TEXT");
    t("resolver (real database): deleting the row returns the purpose to the environment", d.source.config === "environment" && d.apiKey?.reveal() === KEY_ENV && d.model === "env-text-model");
    delete process.env.GROQ_API_KEY; delete process.env.GROQ_MODEL;
    const e = await rv.resolve("INTERVIEW");
    t("resolver (real database): an unconfigured purpose resolves to today's default provider and model", e.provider === DEFAULTS.INTERVIEW.provider && e.model === DEFAULTS.INTERVIEW.model && !e.configured);
    await wipe();
  }

  // ============ tampering in the database ============
  {
    await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m-text", apiKey: KEY_A }, mk1);
    await store.saveConfig({ purpose: "INTERVIEW", provider: "ANTHROPIC", model: "m-int", apiKey: KEY_B }, mk1);
    const good = (await row("TEXT")).keyCiphertext;
    const probe = async () => { const rv = live(); return (await rejects(() => rv.resolve("TEXT")))?.code ?? "resolved"; };
    t("baseline: before any tampering the row resolves", (await probe()) === "resolved");
    await q(`update "AiProviderConfig" set "keyCiphertext" = $1 where purpose = 'TEXT'`, [tamper(good)]);
    t("tamper (SQL): a changed ciphertext is refused with AI_KEY_UNREADABLE, not decrypted and not replaced by an environment key", (await probe()) === "AI_KEY_UNREADABLE");
    await q(`update "AiProviderConfig" set "keyCiphertext" = $1 where purpose = 'TEXT'`, [good]);
    await q(`update "AiProviderConfig" set provider = 'ANTHROPIC' where purpose = 'TEXT'`);
    t("tamper (SQL): changing the provider column (to redirect the key to another provider) makes the key unreadable", (await probe()) === "AI_KEY_UNREADABLE");
    await q(`update "AiProviderConfig" set provider = 'GROQ' where purpose = 'TEXT'`);
    const other = (await row("INTERVIEW")).keyCiphertext;
    await q(`update "AiProviderConfig" set "keyCiphertext" = $1 where purpose = 'TEXT'`, [other]);
    t("tamper (SQL): copying another row's ciphertext into this row is refused (the ciphertext is bound to its own row)", (await probe()) === "AI_KEY_UNREADABLE");
    await q(`update "AiProviderConfig" set "keyCiphertext" = $1 where purpose = 'TEXT'`, [good.replace("aigcm1.1.", "aigcm1.2.")]);
    t("tamper (SQL): relabelling the master-key version is refused", (await probe()) === "AI_KEY_UNREADABLE");
    await q(`update "AiProviderConfig" set "keyCiphertext" = $1 where purpose = 'TEXT'`, [good]);
    t("restored: the untouched ciphertext resolves again (the refusals were about the changes, not about the row)", (await probe()) === "resolved");
    await wipe();
  }

  // ============ database outage and a missing table ============
  {
    await store.saveConfig({ purpose: "TEXT", provider: "ANTHROPIC", model: "chosen-model", apiKey: KEY_B }, mk1);
    process.env.GROQ_API_KEY = KEY_ENV; process.env.GROQ_MODEL = "env-model-that-must-not-be-used";
    const warm = live(); const w0 = await warm.resolve("TEXT");
    const cold = live();
    dbDown();
    await new Promise((r) => setTimeout(r, 400));   // past the 250 ms cache time
    const t0 = Date.now(); const st = await warm.resolve("TEXT"); const ms = Date.now() - t0;
    t("outage (real database, proxy cut): a resolver that had read the configuration keeps using it, marked stale, with the SAME provider, model and key", w0.provider === "ANTHROPIC" && st.stale && st.provider === "ANTHROPIC" && st.model === "chosen-model" && st.apiKey?.reveal() === KEY_B && st.source.config === "database", `${st.provider} ${st.model} stale=${st.stale}`);
    const ce = await rejects(() => cold.resolve("TEXT"));
    t("outage (real database, proxy cut): a resolver with nothing known FAILS with AI_CONFIG_UNAVAILABLE even though the environment holds a Groq key and model, which would silently be a different provider and model", ce?.code === "AI_CONFIG_UNAVAILABLE" && !/ECONN|127\.0\.0\.1|postgres|54330|\d{5}/.test(ce.message) && !leaks(ce.message), ce?.message);
    t("outage: the answer comes back quickly (bounded by the read time limit), so an AI call is not held up", ms < 2500, `${ms} ms`);
    dbUp(); await new Promise((r) => setTimeout(r, 5600));
    const back = await warm.resolve("TEXT");
    t("recovery: once the database is back the resolver returns to live (not stale) without a restart", !back.stale && back.model === "chosen-model" && back.apiKey?.reveal() === KEY_B, `stale=${back.stale}`);
    const cold2 = await live().resolve("TEXT");
    t("recovery: a fresh resolver resolves normally again", cold2.model === "chosen-model" && !cold2.stale);
    delete process.env.GROQ_API_KEY; delete process.env.GROQ_MODEL;

    await q(`alter table "AiProviderConfig" rename to "AiProviderConfig_off"`);
    try {
      process.env.GROQ_API_KEY = KEY_ENV;
      const mt = await live().resolve("TEXT");
      t("table missing (migration not applied): nothing is configured, so the environment applies exactly as before, with no error", mt.source.config === "environment" && mt.apiKey?.reveal() === KEY_ENV && mt.model === DEFAULTS.TEXT.model && !mt.stale);
      const se = await rejects(() => store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m1" }, mk1));
      t("table missing: saving a configuration fails clearly (nothing is silently dropped)", !!se && !leaks(se.message));
    } finally { await q(`alter table "AiProviderConfig_off" rename to "AiProviderConfig"`); delete process.env.GROQ_API_KEY; }
    await wipe();
  }

  // ============ master-key rotation on the real database ============
  {
    await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m-t", apiKey: KEY_A }, mk1);
    await store.saveConfig({ purpose: "VISION", provider: "GROQ", model: "m-v", apiKey: KEY_C }, mk1);
    await store.saveConfig({ purpose: "INTERVIEW", provider: "ANTHROPIC", model: "m-i", apiKey: KEY_B }, mk1);
    const snap = async () => JSON.stringify(await q(`select purpose, "keyCiphertext", "keyVersion", "updatedAt" from "AiProviderConfig" order by purpose`));
    const s0 = await snap();
    t("rotation (real database): before rotation all three stored keys are on master-key version 1", JSON.stringify(await store.keyVersionCounts()) === JSON.stringify({ "1": 3 }));
    const mk2 = mkOf(2, [1, 2, 3]);
    const dry = await rotateAiKeys({ store: store.dbRotationStore, masterKeys: mk2, dryRun: true });
    t("rotation (real database): a dry run reports three keys it would rotate and changes nothing in the database", dry.wouldRotate === 3 && dry.rotated === 0 && (await snap()) === s0);
    const run = await rotateAiKeys({ store: store.dbRotationStore, masterKeys: mk2 });
    t("rotation (real database): all three keys move to version 2", run.rotated === 3 && run.failed.length === 0 && run.conflicts === 0 && JSON.stringify(await store.keyVersionCounts()) === JSON.stringify({ "2": 3 }));
    const only2 = createAiResolver({ ttlMs: 0, masterKeys: () => crypto.loadMasterKeys({ AI_MASTER_KEY_V2: M[1].toString("hex"), AI_MASTER_KEY_ACTIVE: "2" }) });
    const got = await Promise.all((["TEXT", "VISION", "INTERVIEW"] as const).map(async (p) => (await only2.resolve(p)).apiKey?.reveal()));
    t("rotation: with ONLY the new master key available (the old one retired), every key still resolves to its original value", got.join("|") === [KEY_A, KEY_C, KEY_B].join("|"));
    t("rotation: the old master key alone can no longer read them (so retiring it is only safe after rotation, and the counts show when)", (await rejects(() => createAiResolver({ ttlMs: 0, masterKeys: () => crypto.loadMasterKeys({ AI_MASTER_KEY_V1: M[0].toString("base64") }) }).resolve("TEXT")))?.code === "AI_KEY_UNREADABLE");
    const again = await rotateAiKeys({ store: store.dbRotationStore, masterKeys: mk2 });
    t("rotation: a second run changes nothing (idempotent)", again.alreadyCurrent === 3 && again.rotated === 0);
    t("rotation: the report and the database hold no key or master-key value", !leaks(JSON.stringify([dry, run, again])) && !leaks(JSON.stringify(await q(`select * from "AiProviderConfig"`))));

    // concurrent: two rotations at once, back to version 3
    const mk3 = mkOf(3, [1, 2, 3]);
    const [x, y] = await Promise.all([rotateAiKeys({ store: store.dbRotationStore, masterKeys: mk3, batchSize: 1 }), rotateAiKeys({ store: store.dbRotationStore, masterKeys: mk3, batchSize: 1 })]);
    t("rotation: two rotations running at the same time never corrupt a key: each row is rotated exactly once (the other run sees a conflict or an already-rotated row)", x.rotated + y.rotated === 3 && x.failed.length + y.failed.length === 0 && JSON.stringify(await store.keyVersionCounts()) === JSON.stringify({ "3": 3 }));
    const all3 = createAiResolver({ ttlMs: 0, masterKeys: () => mk3 });
    t("rotation: after the concurrent runs every key is intact on version 3", (await Promise.all((["TEXT", "VISION", "INTERVIEW"] as const).map(async (p) => (await all3.resolve(p)).apiKey?.reveal()))).join("|") === [KEY_A, KEY_C, KEY_B].join("|"));

    // concurrent with administrator saves: back to version 1 while TEXT is saved repeatedly
    const cands = Array.from({ length: 10 }, (_, i) => `gsk_ITEST_ROT_${String(i).padStart(2, "0")}_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk`);
    const mk1b = mkOf(1, [1, 2, 3]);
    const [rot, ...saves] = await Promise.all([rotateAiKeys({ store: store.dbRotationStore, masterKeys: mk1b, batchSize: 1 }), ...cands.map((k) => store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m-t", apiKey: k }, mk3))]);
    const fin = await row("TEXT"); const finKey = crypto.decryptSecret(fin.keyCiphertext, { id: fin.id, purpose: "TEXT", provider: "GROQ" }, mk3);
    const others = await Promise.all((["VISION", "INTERVIEW"] as const).map(async (p) => { const r = await row(p); return crypto.decryptSecret(r.keyCiphertext, { id: r.id, purpose: p, provider: p === "VISION" ? "GROQ" : "ANTHROPIC" }, mk3); }));
    t("rotation racing administrator saves: no saved key is ever lost or overwritten by the rotation (compare-and-set), every row stays readable, and the other purposes are intact", saves.every((s) => s.keyConfigured) && cands.includes(finKey) && others.join("|") === [KEY_C, KEY_B].join("|") && rot.failed.length === 0, JSON.stringify(rot));

    // partial failure: one row tampered
    { const v = await row("VISION"); await q(`update "AiProviderConfig" set "keyCiphertext" = $1 where purpose = 'VISION'`, [tamper(v.keyCiphertext)]); }
    const tampered = (await row("VISION")).keyCiphertext;
    const pf = await rotateAiKeys({ store: store.dbRotationStore, masterKeys: mk3 });
    t("rotation: one corrupted row is reported by purpose-id and code, left exactly as it was, and the healthy rows are still handled", pf.failed.length === 1 && ["MALFORMED", "UNREADABLE"].includes(pf.failed[0].code) && (await row("VISION")).keyCiphertext === tampered && pf.failed.every((f) => !leaks(JSON.stringify(f))));
    await wipe();
  }

  // ============ the rotation command (a real child process) ============
  {
    await store.saveConfig({ purpose: "TEXT", provider: "GROQ", model: "m-t", apiKey: KEY_A }, mk1);
    const env = { ...process.env, DATABASE_URL: DIRECT, DIRECT_URL: DIRECT, AI_MASTER_KEY_V1: M[0].toString("base64"), AI_MASTER_KEY_V2: M[1].toString("hex"), AI_MASTER_KEY_ACTIVE: "2" } as NodeJS.ProcessEnv;
    const run = (args: string[], e = env) => { const r = spawnSync(process.execPath, ["--import", "tsx", "scripts/rotate-ai-keys.ts", ...args], { encoding: "utf8", env: e, timeout: 120_000 }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }; };
    const dry = run(["--dry-run"]);
    t("command: --dry-run reports one key to rotate, exits 0, and changes nothing", dry.code === 0 && /"wouldRotate":1/.test(dry.out) && (await row("TEXT")).keyVersion === 1, dry.out.slice(0, 300));
    const real = run([]);
    t("command: the real run rotates it to version 2 and exits 0; its output lists versions, fingerprints and counts but no key, ciphertext or master-key value", real.code === 0 && (await row("TEXT")).keyVersion === 2 && /"rotated":1/.test(real.out) && !leaks(real.out) && !real.out.includes((await row("TEXT")).keyCiphertext), real.out.slice(0, 300));
    const missing = run(["--to", "9"]);
    t("command: an unavailable target version exits 2 without changing anything", missing.code === 2 && /MASTER_KEY_MISSING/.test(missing.out) && (await row("TEXT")).keyVersion === 2);
    const remote = run([], { ...env, DATABASE_URL: "postgresql://u:S3cr3t@db.guard-test.invalid:6543/x", DIRECT_URL: "postgresql://u:S3cr3t@db.guard-test.invalid:6543/x" } as NodeJS.ProcessEnv);
    t("command: pointed at a non-local database it refuses before connecting (the local-only guard)", remote.code !== 0 && /Refusing to rotate AI keys/.test(remote.out) && !/S3cr3t|ENOTFOUND/.test(remote.out), remote.out.slice(0, 200));
    await wipe();
  }

  // ============ final sweeps ============
  const dump = JSON.stringify([await q(`select * from "AiProviderConfig"`), await q(`select * from "AiUsageDaily"`), await q(`select * from "PlatformAuditLog" order by "createdAt" desc limit 200`)]);
  t("sweep: no test key or master key is stored anywhere I wrote (both AI tables and the platform audit trail)", !leaks(dump));
  t("sweep: nothing printed or logged by this suite (every line captured) contains a test key or a master key in any encoding", !printed.some(leaks));
} finally {
  dbUp();
  await q(`do $$ begin if to_regclass('"AiProviderConfig_off"') is not null then alter table "AiProviderConfig_off" rename to "AiProviderConfig"; end if; end $$`).catch(() => 0);
  await wipe().catch(() => 0);
  await admin.end().catch(() => 0); await db.$disconnect().catch(() => 0);
  for (const s of socks) s.destroy(); proxy.close();
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);

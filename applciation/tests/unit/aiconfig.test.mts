// Unit tests for the AI configuration foundation (Phase 4.4.2): AES-256-GCM key protection, master keys and rotation, and the resolver's precedence and failure rules.
// No network, no database, no provider is contacted. All keys below are made-up test values; this file captures its own output and finally asserts that none of them was ever printed.
import { inspect } from "node:util";
import { randomBytes } from "node:crypto";
import { Secret, decryptSecret, encryptSecret, envelopeVersion, fingerprintOf, last4Of, loadMasterKeys, masterKeyInfo, reencrypt, VALID_SECRET, type MasterKeys } from "../../lib/ai/crypto";
import { rotateAiKeys, type RotationRow, type RotationStore } from "../../lib/ai/rotate";
import { DEFAULTS, createAiResolver, describeResolved, type AiConfigRow, type Purpose } from "../../lib/ai/config";
import { checkEnv } from "../../lib/env";

// ---- capture everything printed, so we can prove no secret reached the output
const printed: string[] = [];
for (const m of ["log", "warn", "error"] as const) { const o = console[m].bind(console); console[m] = (...a: unknown[]) => { const line = a.map((x) => (typeof x === "string" ? x : inspect(x))).join(" "); printed.push(line); o(line); }; }

const KEY_A = "gsk_TESTKEY_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4";
const KEY_B = "sk-ant-TESTKEY-Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8Nn7Mm6";
const KEY_C = "gsk_TESTKEY_Cc3Cc3Cc3Cc3Dd4Dd4Dd4Dd4Ee5Ee5Ee5Ee5Ff6Ff6";
const M1 = randomBytes(32), M2 = randomBytes(32), M3 = randomBytes(32);
const MK_VALUES = [M1, M2, M3].flatMap((b) => [b.toString("base64"), b.toString("hex"), b.toString("base64url")]);
const SECRETS = [KEY_A, KEY_B, KEY_C, ...MK_VALUES];

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra.replace(/[A-Za-z0-9_+/=-]{24,}/g, "[long value hidden]")); };
const throws = (f: () => unknown): { code?: string; message: string } | null => { try { f(); return null; } catch (e) { return { code: (e as { code?: string }).code, message: (e as Error).message }; } };
const rejects = async (f: () => Promise<unknown>) => { try { await f(); return null; } catch (e) { return { code: (e as { code?: string }).code, message: (e as Error).message }; } };
const hasSecret = (s: string) => SECRETS.some((x) => s.includes(x)) || [KEY_A, KEY_B, KEY_C].some((k) => s.includes(Buffer.from(k).toString("base64")) || s.includes(Buffer.from(k).toString("hex")) || s.includes(Buffer.from(k).toString("base64url")));

const env = (o: Record<string, string> = {}) => ({ AI_MASTER_KEY_V1: M1.toString("base64"), AI_MASTER_KEY_V2: M2.toString("hex"), AI_MASTER_KEY_V3: M3.toString("base64url"), ...o });
const MK = (active: number | null, versions: number[] = [1, 2, 3]): MasterKeys => loadMasterKeys({ ...Object.fromEntries(versions.map((v) => [`AI_MASTER_KEY_V${v}`, ({ 1: M1, 2: M2, 3: M3 } as Record<number, Buffer>)[v].toString("base64")])), ...(active === null ? {} : { AI_MASTER_KEY_ACTIVE: String(active) }) });
const tamper = (envelope: string) => { const p = envelope.split("."); p[4] = (p[4][0] === "A" ? "B" : "A") + p[4].slice(1); return p.join("."); }; // alters real ciphertext bits (the last character may hold only padding bits, so it is NOT used)
const ctx = { id: "11111111-1111-4111-8111-111111111111", purpose: "TEXT", provider: "GROQ" };

// ================= master keys =================
{
  const m = loadMasterKeys({ ...env(), AI_MASTER_KEY_ACTIVE: "2" });
  t("master keys: base64, hex and base64url forms of 32 random bytes are all accepted, versions read, active selected", m.keys.size === 3 && m.active === 2 && m.keys.get(1)!.equals(M1) && m.keys.get(2)!.equals(M2) && m.keys.get(3)!.equals(M3));
  t("master keys: no master key configured is allowed (nothing can be stored), with no active version", (() => { const x = loadMasterKeys({}); return x.keys.size === 0 && x.active === null; })());
  t("master keys: blank variables are ignored", loadMasterKeys({ AI_MASTER_KEY_V1: "   ", AI_MASTER_KEY_ACTIVE: "" }).keys.size === 0);
  const bad: [string, Record<string, string>][] = [
    ["too short", { AI_MASTER_KEY_V1: Buffer.alloc(16, 7).toString("base64") }], ["too long", { AI_MASTER_KEY_V1: randomBytes(48).toString("base64") }], ["not base64 or hex", { AI_MASTER_KEY_V1: "this is not a key at all!!" }],
    ["all zero bytes", { AI_MASTER_KEY_V1: Buffer.alloc(32, 0).toString("base64") }], ["all 0xff bytes", { AI_MASTER_KEY_V1: Buffer.alloc(32, 255).toString("hex") }], ["version 0", { AI_MASTER_KEY_V0: M1.toString("base64") }],
    ["active names a missing version", { AI_MASTER_KEY_V1: M1.toString("base64"), AI_MASTER_KEY_ACTIVE: "2" }], ["active not a number", { AI_MASTER_KEY_V1: M1.toString("base64"), AI_MASTER_KEY_ACTIVE: "latest" }],
    ["two versions with the same key", { AI_MASTER_KEY_V1: M1.toString("base64"), AI_MASTER_KEY_V2: M1.toString("hex") }],
  ];
  for (const [name, e] of bad) { const r = throws(() => loadMasterKeys(e)); t(`master keys: invalid (${name}) is refused with MASTER_KEY_INVALID`, r?.code === "MASTER_KEY_INVALID", r?.message ?? "no error"); }
  t("master keys: error messages name the variable or version, never a key value", bad.every(([, e]) => { const r = throws(() => loadMasterKeys(e)); return !!r && !hasSecret(r.message) && !Object.values(e).some((v) => v.length >= 20 && r.message.includes(v)); }));
  const f1 = fingerprintOf(M1), f2 = fingerprintOf(M2);
  t("master keys: the fingerprint is a stable 12-hex-character one-way identifier that differs per key and contains no key material", f1 === fingerprintOf(Buffer.from(M1)) && f1 !== f2 && /^[0-9a-f]{12}$/.test(f1) && !M1.toString("hex").includes(f1));
  const info = masterKeyInfo(m);
  t("master keys: the info that may be shown has versions, the active version and fingerprints only", JSON.stringify(Object.keys(info).sort()) === JSON.stringify(["active", "fingerprints", "versions"]) && !hasSecret(JSON.stringify(info)) && info.versions.join() === "1,2,3");
}

// ================= encryption =================
{
  const mk = MK(1);
  const { envelope, version } = encryptSecret(KEY_A, ctx, mk);
  const parts = envelope.split(".");
  t("encrypt: the envelope is aigcm1.<version>.<iv>.<tag>.<ciphertext> with a 12-byte IV and a 16-byte tag, and records the master-key version", parts.length === 5 && parts[0] === "aigcm1" && parts[1] === "1" && Buffer.from(parts[2], "base64url").length === 12 && Buffer.from(parts[3], "base64url").length === 16 && version === 1 && envelopeVersion(envelope) === 1);
  t("decrypt: round trip returns the exact key", decryptSecret(envelope, ctx, mk) === KEY_A);
  t("at rest: the stored text contains the key in no form (plain, base64, hex, base64url), nor any part of it", !hasSecret(envelope) && !envelope.includes(KEY_A.slice(0, 12)) && !envelope.includes(KEY_A.slice(-12)));
  const many = new Set(Array.from({ length: 300 }, () => encryptSecret(KEY_A, ctx, mk).envelope));
  const ivs = new Set([...many].map((e) => e.split(".")[2]));
  t("IV: 300 encryptions of the same key under the same context give 300 different IVs and 300 different ciphertexts", many.size === 300 && ivs.size === 300);
  const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
  const swap = (i: number) => { const p = envelope.split("."); p[i] = flip(p[i]); return p.join("."); };
  for (const [name, i] of [["IV", 2], ["authentication tag", 3], ["ciphertext", 4]] as const) { const r = throws(() => decryptSecret(swap(i), ctx, mk)); t(`tamper: changing the ${name} fails authentication (UNREADABLE)`, r?.code === "UNREADABLE", r?.message ?? "decrypted"); }
  for (const [name, other] of [["id", { ...ctx, id: "22222222-2222-4222-8222-222222222222" }], ["purpose", { ...ctx, purpose: "VISION" }], ["provider", { ...ctx, provider: "ANTHROPIC" }]] as const) { const r = throws(() => decryptSecret(envelope, other, mk)); t(`binding: the same ciphertext presented for another ${name} is refused (copied row, or changed provider/purpose, fails closed)`, r?.code === "UNREADABLE"); }
  t("version: relabelling the envelope with another existing master-key version fails, a missing version is reported as MASTER_KEY_MISSING (naming the version only)", throws(() => decryptSecret(envelope.replace("aigcm1.1.", "aigcm1.2."), ctx, mk))?.code === "UNREADABLE" && (() => { const r = throws(() => decryptSecret(envelope.replace("aigcm1.1.", "aigcm1.9."), ctx, mk)); return r?.code === "MASTER_KEY_MISSING" && /version 9/.test(r.message) && !hasSecret(r.message); })());
  t("wrong master key: the right version number but a different key is UNREADABLE", throws(() => decryptSecret(envelope, ctx, loadMasterKeys({ AI_MASTER_KEY_V1: M3.toString("base64") })))?.code === "UNREADABLE");
  const malformed = ["", "garbage", "aigcm1.1", "aigcm2.1.a.b.c", "aigcm1.x.AAAA.BBBB.CCCC", `${envelope}.extra`, envelope.split(".").slice(0, 4).join("."), envelope.replace(/\.[^.]*\.[^.]*\.[^.]*$/, ".!!!.!!!.!!!"), `aigcm1.1.${"A".repeat(8)}.${"A".repeat(22)}.AAAA`];
  t("malformed: every wrongly shaped value is MALFORMED (or UNREADABLE), never a crash and never a partial decrypt", malformed.every((m) => { const r = throws(() => decryptSecret(m, ctx, mk)); return !!r && ["MALFORMED", "UNREADABLE"].includes(r.code ?? ""); }) && envelopeVersion("garbage") === null && envelopeVersion(null) === null);
  const badKeys = ["", "short", "has space in it 12345", "tab\tinside12345", "ünïcode-key-1234567", "x".repeat(513), "new\nline12345678"];
  t("input: keys that are empty, short, contain spaces, control or non-ASCII characters, or are over 512 characters are refused before encryption (INVALID_SECRET)", badKeys.every((k) => throws(() => encryptSecret(k, ctx, mk))?.code === "INVALID_SECRET") && VALID_SECRET.test("a".repeat(512)) && VALID_SECRET.test("12345678"));
  t("no active master key: storing a key is refused (NO_ACTIVE_KEY), nothing is encrypted", throws(() => encryptSecret(KEY_A, ctx, MK(null)))?.code === "NO_ACTIVE_KEY");
  t("errors never contain the plaintext key or any master key", [() => decryptSecret(swap(4), ctx, mk), () => encryptSecret("bad key", ctx, mk), () => decryptSecret("aigcm1.9.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA", ctx, mk)].every((f) => { const r = throws(f); return !!r && !hasSecret(r.message) && !r.message.includes(KEY_A); }));
  t("last4: shows the last four characters of a long key and nothing of a short one", last4Of(KEY_A) === KEY_A.slice(-4) && last4Of("short-key-123") === null && last4Of("a".repeat(15)) === null && last4Of("a".repeat(16)) === "aaaa");
}

// ================= Secret wrapper =================
{
  const s = new Secret(KEY_A);
  const all = [String(s), `${s}`, JSON.stringify(s), JSON.stringify({ apiKey: s, nested: { k: s } }), inspect(s), inspect({ s }, { depth: 5 }), s + "", JSON.stringify({ ...s }), Object.keys(s).join(), JSON.stringify(Object.getOwnPropertyNames(s)), `${[s]}`];
  t("Secret: String, template literal, JSON.stringify, util.inspect, spread, keys and arrays never show the value", all.every((x) => !x.includes(KEY_A) && !hasSecret(x)), all.join(" | "));
  t("Secret: they show a clear '[hidden]' marker, and .reveal() is the only way to the value", String(s) === "[hidden]" && JSON.stringify(s) === '"[hidden]"' && /hidden/.test(inspect(s)) && s.reveal() === KEY_A);
  console.log("a secret passed to console.log:", s, { key: s });
  t("Secret: console.log of a secret (captured) prints no value", !printed.some((l) => l.includes(KEY_A)));
}

// ================= re-encryption =================
{
  const mk = MK(1);
  const e1 = encryptSecret(KEY_A, ctx, mk).envelope;
  const e2 = reencrypt(e1, ctx, MK(2), 2);
  t("re-encrypt: moves a key to another master-key version, same plaintext, new IV, still bound to the same row", envelopeVersion(e2) === 2 && decryptSecret(e2, ctx, MK(2)) === KEY_A && e2.split(".")[2] !== e1.split(".")[2] && throws(() => decryptSecret(e2, { ...ctx, id: "x" }, MK(2)))?.code === "UNREADABLE");
  t("re-encrypt: refuses an unavailable target version, and a ciphertext that cannot be read, without producing output", throws(() => reencrypt(e1, ctx, MK(1, [1]), 2))?.code === "MASTER_KEY_MISSING" && throws(() => reencrypt(tamper(e1), ctx, MK(1), 2)) !== null);
  t("re-encrypt: the result contains no plaintext", !hasSecret(e2));
}

// ================= rotation engine (in-memory store) =================
type MemRow = RotationRow;
const memStore = (rows: MemRow[], hook?: (id: string) => void): RotationStore & { rows: MemRow[]; writes: number } => {
  const st = { rows, writes: 0,
    async listBatch(after: string | null, limit: number) { return st.rows.filter((r) => !after || r.id > after).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit).map((r) => ({ ...r })); },
    async compareAndSet(id: string, oldC: string, newC: string) { hook?.(id); const r = st.rows.find((x) => x.id === id); if (!r || r.keyCiphertext !== oldC) return false; r.keyCiphertext = newC; st.writes++; return true; },
  };
  return st;
};
const mkRows = (n: number, mk: MasterKeys): MemRow[] => Array.from({ length: n }, (_, i) => { const c = { id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, purpose: ["TEXT", "VISION", "INTERVIEW"][i % 3], provider: i % 3 === 2 ? "ANTHROPIC" : "GROQ" }; return { ...c, keyCiphertext: encryptSecret([KEY_A, KEY_B, KEY_C][i % 3] + String(i), c, mk).envelope }; });
{
  const mk1 = MK(1), mk2 = MK(2);
  const rows = mkRows(7, mk1); const store = memStore(rows);
  const before = rows.map((r) => r.keyCiphertext);
  const dry = await rotateAiKeys({ store, masterKeys: mk2, dryRun: true, batchSize: 2 });
  t("rotation: a dry run decrypts and re-encrypts in memory, reports what it would do, and changes nothing", dry.dryRun && dry.scanned === 7 && dry.wouldRotate === 7 && dry.rotated === 0 && store.writes === 0 && rows.every((r, i) => r.keyCiphertext === before[i]));
  const run = await rotateAiKeys({ store, masterKeys: mk2, batchSize: 2 });
  t("rotation: every stored key moves to the new master-key version (paged in batches of 2)", run.rotated === 7 && run.failed.length === 0 && run.conflicts === 0 && rows.every((r) => envelopeVersion(r.keyCiphertext) === 2));
  t("rotation: every key still decrypts to its own original value under the new master key, bound to its own row", rows.every((r, i) => decryptSecret(r.keyCiphertext, r, mk2) === [KEY_A, KEY_B, KEY_C][i % 3] + String(i)));
  t("rotation: fresh IVs, so no ciphertext was reused", rows.every((r, i) => r.keyCiphertext.split(".")[2] !== before[i].split(".")[2]));
  const again = await rotateAiKeys({ store, masterKeys: mk2 });
  t("rotation: running it again is a no-op (idempotent, resumable): all rows already current, nothing written", again.alreadyCurrent === 7 && again.rotated === 0 && store.writes === 7);
  t("rotation: the report holds counts, ids, purposes and codes only, never keys or ciphertext", !hasSecret(JSON.stringify([dry, run, again])) && !rows.some((r) => JSON.stringify([dry, run, again]).includes(r.keyCiphertext)));
}
{
  const mk1 = MK(1), mk2 = MK(2);
  const rows = mkRows(5, mk1);
  rows[1].keyCiphertext = tamper(rows[1].keyCiphertext);          // tampered
  rows[3].keyCiphertext = encryptSecret(KEY_C, { id: rows[3].id, purpose: rows[3].purpose, provider: rows[3].provider }, loadMasterKeys({ AI_MASTER_KEY_V7: M3.toString("base64"), AI_MASTER_KEY_ACTIVE: "7" })).envelope; // a master key we do not have
  const store = memStore(rows); const keep = [rows[1].keyCiphertext, rows[3].keyCiphertext];
  const r = await rotateAiKeys({ store, masterKeys: mk2 });
  t("partial failure: the tampered row and the row under an unavailable master key are reported by id, purpose and code, and the other three are still rotated", r.rotated === 3 && r.failed.length === 2 && r.failed.some((f) => f.id === rows[1].id && f.code === "UNREADABLE") && r.failed.some((f) => f.id === rows[3].id && f.code === "MASTER_KEY_MISSING"));
  t("partial failure: the failed rows are left exactly as they were (nothing half-written)", rows[1].keyCiphertext === keep[0] && rows[3].keyCiphertext === keep[1]);
}
{
  const mk1 = MK(1), mk2 = MK(2, [1, 2]); const rows = mkRows(3, mk1); const store = memStore(rows); const before = rows.map((r) => r.keyCiphertext);
  const miss = await rejects(() => rotateAiKeys({ store, masterKeys: loadMasterKeys({ AI_MASTER_KEY_V1: M1.toString("base64") }), target: 2 }));
  const none = await rejects(() => rotateAiKeys({ store, masterKeys: MK(null) }));
  t("rotation: an unavailable target version, or no target at all, is refused before touching any row", miss?.code === "MASTER_KEY_MISSING" && none?.code === "NO_ACTIVE_KEY" && store.writes === 0 && rows.every((r, i) => r.keyCiphertext === before[i]));
  void mk2;
}
{
  const mk1 = MK(1), mk2 = MK(2); const rows = mkRows(4, mk1);
  const newer = encryptSecret(KEY_B, { id: rows[2].id, purpose: rows[2].purpose, provider: rows[2].provider }, mk2).envelope; // an administrator saves a new key under the new master key mid-run
  const store = memStore(rows, (id) => { if (id === rows[2].id) rows[2].keyCiphertext = newer; });
  const r = await rotateAiKeys({ store, masterKeys: mk2 });
  t("concurrent change: a key saved by an administrator during the run is never overwritten (compare-and-set), it is counted as a conflict", r.conflicts === 1 && r.rotated === 3 && rows[2].keyCiphertext === newer && decryptSecret(rows[2].keyCiphertext, rows[2], mk2) === KEY_B);
  const r2 = await rotateAiKeys({ store, masterKeys: mk2 });
  t("concurrent change: a second run finds everything current", r2.alreadyCurrent === 4 && r2.conflicts === 0);
  t("rotation with nothing stored is a clean no-op", (await rotateAiKeys({ store: memStore([]), masterKeys: mk2 })).scanned === 0);
}
{
  const mk1 = MK(1), mk3 = MK(3); const rows = mkRows(6, mk1); const store = memStore(rows);
  await rotateAiKeys({ store, masterKeys: MK(2) }); await rotateAiKeys({ store, masterKeys: mk3 });
  t("rotation: two successive rotations (1 to 2 to 3) leave every key readable on version 3 only, so versions 1 and 2 could be retired", rows.every((r, i) => envelopeVersion(r.keyCiphertext) === 3 && decryptSecret(r.keyCiphertext, r, loadMasterKeys({ AI_MASTER_KEY_V3: M3.toString("base64") })) === [KEY_A, KEY_B, KEY_C][i % 3] + String(i)));
}

// ================= resolver =================
const row = (o: Partial<AiConfigRow> = {}): AiConfigRow => ({ id: ctx.id, purpose: "TEXT", provider: "GROQ", model: "db-model-1", enabled: true, keyCiphertext: null, keyVersion: null, keyLast4: null, ...o });
const withKey = (key: string, o: Partial<AiConfigRow> = {}, mk = MK(1)): AiConfigRow => { const r = row(o); const e = encryptSecret(key, { id: r.id, purpose: r.purpose, provider: r.provider }, mk); return { ...r, keyCiphertext: e.envelope, keyVersion: e.version, keyLast4: last4Of(key) }; };
const mkResolver = (rows: Partial<Record<Purpose, AiConfigRow | null>>, e: Record<string, string> = {}, extra: { now?: () => number; load?: (p: Purpose) => Promise<AiConfigRow | null>; loadGlobal?: () => Promise<{ enabled: boolean } | null>; ttlMs?: number; timeoutMs?: number; mk?: MasterKeys } = {}) => {
  const calls = { n: 0 }; const logs: Record<string, unknown>[] = [];
  const r = createAiResolver({ load: extra.load ?? (async (p) => { calls.n++; return rows[p] ?? null; }), loadGlobal: extra.loadGlobal, env: () => e, masterKeys: () => extra.mk ?? MK(1), now: extra.now, ttlMs: extra.ttlMs, timeoutMs: extra.timeoutMs, log: (l) => logs.push(l) });
  return { ...r, calls, logs };
};
{
  t("defaults are exactly today's (nothing changes silently): text Groq llama-3.3-70b-versatile, vision Groq qwen/qwen3.8-27b, interview Anthropic claude-opus-5-5", JSON.stringify(DEFAULTS) === JSON.stringify({ TEXT: { provider: "GROQ", model: "llama-3.3-70b-versatile" }, VISION: { provider: "GROQ", model: "qwen/qwen3.8-27b" }, INTERVIEW: { provider: "ANTHROPIC", model: "claude-opus-5-5" } }));
  const r = mkResolver({});
  const a = await r.resolve("TEXT"), v = await r.resolve("VISION"), i = await r.resolve("INTERVIEW");
  t("precedence 3: with nothing stored and no environment, every purpose resolves to its existing default, unconfigured, with source 'default'", [a, v, i].every((x, k) => x.provider === Object.values(DEFAULTS)[k].provider && x.model === Object.values(DEFAULTS)[k].model && x.enabled && !x.configured && x.apiKey === null && x.source.config === "default" && x.source.key === "none" && !x.stale));
}
{
  const e = { GROQ_API_KEY: KEY_A, GROQ_MODEL: " env-text-model ", GROQ_VISION_MODEL: "env-vision-model", ANTHROPIC_API_KEY: KEY_B, GROQ_API_BASE: "http://127.0.0.1:9/v1" };
  const r = mkResolver({}, e);
  const a = await r.resolve("TEXT"), v = await r.resolve("VISION"), i = await r.resolve("INTERVIEW");
  t("precedence 2: the environment supplies keys and the existing model variables (GROQ_MODEL for text, GROQ_VISION_MODEL for vision), trimmed", a.model === "env-text-model" && v.model === "env-vision-model" && a.apiKey?.reveal() === KEY_A && v.apiKey?.reveal() === KEY_A && a.source.model === "environment" && a.source.key === "environment" && a.configured);
  t("precedence 2: the interview purpose uses ANTHROPIC_API_KEY and its default model (there is no interview model variable, and GROQ_MODEL does not apply to it)", i.provider === "ANTHROPIC" && i.apiKey?.reveal() === KEY_B && i.model === "claude-opus-5-5" && i.source.model === "default");
  t("precedence 2: the Groq base URL variable (used by mocks) is carried through for Groq purposes only", a.baseUrl === "http://127.0.0.1:9/v1" && i.baseUrl === null);
  t("environment with only a key keeps the default model; a blank key means not configured", (await mkResolver({}, { GROQ_API_KEY: KEY_A }).resolve("TEXT")).model === DEFAULTS.TEXT.model && !(await mkResolver({}, { GROQ_API_KEY: "   " }).resolve("TEXT")).configured);
}
{
  const e = { GROQ_API_KEY: KEY_A, GROQ_MODEL: "env-model", ANTHROPIC_API_KEY: KEY_B };
  const noKey = await mkResolver({ TEXT: row({ model: "db-model-1" }) }, e).resolve("TEXT");
  t("precedence 1: an active database row decides provider and model; with no stored key the provider's environment key is used", noKey.model === "db-model-1" && noKey.source.model === "database" && noKey.source.config === "database" && noKey.source.key === "environment" && noKey.apiKey?.reveal() === KEY_A && noKey.configured);
  const stored = await mkResolver({ TEXT: withKey(KEY_C, { model: "db-model-2" }) }, e).resolve("TEXT");
  t("precedence 1: a stored (encrypted) key beats the environment key; its last four characters are available for display", stored.apiKey?.reveal() === KEY_C && stored.source.key === "database" && stored.keyLast4 === KEY_C.slice(-4) && stored.model === "db-model-2");
  const other = await mkResolver({ TEXT: row({ provider: "ANTHROPIC", model: "some-claude" }) }, e).resolve("TEXT");
  t("precedence 1: a purpose moved to the other provider uses THAT provider's environment key, never the previous provider's", other.provider === "ANTHROPIC" && other.apiKey?.reveal() === KEY_B && other.model === "some-claude");
  const none = await mkResolver({ TEXT: row({ provider: "ANTHROPIC" }) }, { GROQ_API_KEY: KEY_A }).resolve("TEXT");
  t("precedence 1: a row for a provider with no key anywhere is unconfigured (the other provider's key is not borrowed)", !none.configured && none.apiKey === null && none.source.key === "none");
  const vision = await mkResolver({ TEXT: row({ model: "db-text" }) }, e).resolve("VISION");
  t("purposes are independent: a row for TEXT does not change VISION", vision.model === DEFAULTS.VISION.model && vision.source.config === "environment");
  const dis = mkResolver({ TEXT: withKey(KEY_C, { enabled: false }) }, e);
  const d = await dis.resolve("TEXT");
  t("kill switch: a disabled row resolves as disabled with no key, and does NOT fall back to the environment or defaults", !d.enabled && d.apiKey === null && !d.configured && d.model === "db-model-1");
  const ce = await rejects(() => dis.resolveForCall("TEXT"));
  t("kill switch: resolveForCall refuses with AI_DISABLED (503) and a plain message", ce?.code === "AI_DISABLED" && !hasSecret(ce.message) && (await mkResolver({}, e).resolveForCall("TEXT")).enabled);
  t("removing the row returns the purpose to the environment (after the cache time)", await (async () => { let t0 = 0; const rows: Partial<Record<Purpose, AiConfigRow | null>> = { TEXT: withKey(KEY_C) }; const rr = mkResolver(rows, e, { now: () => t0, ttlMs: 1000 }); const a = await rr.resolve("TEXT"); rows.TEXT = null; t0 = 1500; const b = await rr.resolve("TEXT"); return a.source.key === "database" && b.source.key === "environment" && b.apiKey?.reveal() === KEY_A; })());
}
{
  const load = async () => { throw Object.assign(new Error('relation "AiProviderConfig" does not exist'), { code: "P2021" }); };
  const rr = mkResolver({}, { GROQ_API_KEY: KEY_A }, { load });
  const x = await rr.resolve("TEXT");
  t("table missing (migration not applied, as on a database that has not been migrated): treated as 'nothing configured', so the environment and defaults apply exactly as before", x.source.config === "environment" && x.model === DEFAULTS.TEXT.model && x.apiKey?.reveal() === KEY_A && !x.stale);
}
{
  // database unavailable
  let t0 = 0; let down = false; const stored = withKey(KEY_C, { provider: "ANTHROPIC", model: "chosen-claude" });
  const load = async () => { if (down) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); return stored; };
  const rr = mkResolver({}, { GROQ_API_KEY: KEY_A, ANTHROPIC_API_KEY: KEY_B }, { load, now: () => t0, ttlMs: 10_000 });
  const first = await rr.resolve("TEXT");
  down = true; t0 = 11_000;
  const during = await rr.resolve("TEXT");
  t("database down after a successful read: the last known configuration is used, marked stale, with the SAME provider, model and key (never the environment or defaults)", first.provider === "ANTHROPIC" && during.stale && during.provider === "ANTHROPIC" && during.model === "chosen-claude" && during.apiKey?.reveal() === KEY_C && during.source.config === "database");
  t("database down: the problem is logged once per look, with the purpose and a reason only (no key)", rr.logs.some((l) => /last known/.test(String(l.msg)) && l.purpose === "TEXT") && !hasSecret(JSON.stringify(rr.logs)));
  down = false; t0 = 11_000 + 6_000;
  const back = await rr.resolve("TEXT");
  t("database back: the next look after the short retry interval returns to live, not stale", !back.stale && back.model === "chosen-claude");
  const cold = mkResolver({}, { GROQ_API_KEY: KEY_A, GROQ_MODEL: "env-model" }, { load: async () => { throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); } });
  const err = await rejects(() => cold.resolve("TEXT"));
  t("database down with no known configuration (cold start): the call FAILS with AI_CONFIG_UNAVAILABLE (503); it does not quietly use the environment, which could be a different provider or model than the one chosen", err?.code === "AI_CONFIG_UNAVAILABLE" && !/ECONN|127|localhost|postgres/i.test(err.message));
  const n0 = cold.calls.n; await rejects(() => cold.resolve("TEXT")); await rejects(() => cold.resolve("TEXT"));
  t("database down: repeated calls fail fast without hammering the database (a short negative cache)", cold.calls.n === n0);
  const hang = mkResolver({}, {}, { load: () => new Promise<AiConfigRow | null>(() => undefined), timeoutMs: 40 });
  const t1 = Date.now(); const he = await rejects(() => hang.resolve("TEXT"));
  t("database that never answers: the read is cut off at the time limit and treated as unavailable", he?.code === "AI_CONFIG_UNAVAILABLE" && Date.now() - t1 < 1000);
}
{
  // caching and single flight
  let t0 = 0; const rr = mkResolver({ TEXT: row() }, {}, { now: () => t0, ttlMs: 1000 });
  await rr.resolve("TEXT"); await rr.resolve("TEXT"); await rr.resolve("TEXT");
  t("cache: repeated resolutions within the cache time read the database once", rr.calls.n === 1);
  t0 = 1001; await rr.resolve("TEXT");
  t("cache: after the cache time it reads again (another server instance sees a change within that time)", rr.calls.n === 2);
  rr.invalidate("TEXT"); await rr.resolve("TEXT"); const n = rr.calls.n; rr.invalidate(); await rr.resolve("TEXT");
  t("cache: invalidate (used after a save) forces the next resolution to read", n === 3 && rr.calls.n === 4);
  const rr2 = mkResolver({ TEXT: row() }, {});
  await Promise.all(Array.from({ length: 80 }, () => rr2.resolve("TEXT")));
  t("single flight: 80 simultaneous first resolutions cause exactly one database read", rr2.calls.n === 1);
}
{
  // key failures never fall back
  const e = { GROQ_API_KEY: KEY_A };
  const good = withKey(KEY_C); const tampered = { ...good, keyCiphertext: tamper(good.keyCiphertext!) };
  const r1 = await rejects(() => mkResolver({ TEXT: tampered }, e).resolve("TEXT"));
  t("unreadable stored key (altered data): the call FAILS with AI_KEY_UNREADABLE (503); it does not fall back to the environment key", r1?.code === "AI_KEY_UNREADABLE" && !hasSecret(r1.message) && !/GCM|tag|decrypt|master/i.test(r1.message));
  const r2 = await rejects(() => mkResolver({ TEXT: good }, e, { mk: MK(2, [2]) }).resolve("TEXT"));
  t("stored key whose master key is no longer available: AI_KEY_UNREADABLE, no fallback", r2?.code === "AI_KEY_UNREADABLE");
  const moved = { ...good, provider: "ANTHROPIC" as const };
  t("a row whose provider was changed behind the application's back no longer decrypts (the key cannot be redirected to another provider)", (await rejects(() => mkResolver({ TEXT: moved }, e).resolve("TEXT")))?.code === "AI_KEY_UNREADABLE");
  const lg = mkResolver({ TEXT: tampered }, e); await rejects(() => lg.resolve("TEXT"));
  t("the failure is logged with the purpose and an error code only", lg.logs.some((l) => l.purpose === "TEXT" && typeof l.code === "string") && !hasSecret(JSON.stringify(lg.logs)));
  const still = await mkResolver({ TEXT: withKey(KEY_C, {}, MK(2)) }, e, { mk: MK(2, [1, 2]) }).resolve("TEXT");
  t("a key encrypted under master version 2 resolves when version 2 is available (rotation in progress: both versions work)", still.apiKey?.reveal() === KEY_C);
}
{
  const r = await mkResolver({ TEXT: withKey(KEY_C, { model: "m" }) }, { GROQ_API_KEY: KEY_A }).resolve("TEXT");
  const shown = [JSON.stringify(r), JSON.stringify(describeResolved(r)), inspect(r, { depth: 6 }), String(r.apiKey), `${r.apiKey}`];
  t("a resolved configuration prints, serializes and inspects with the key hidden; describeResolved carries no key at all", shown.every((s) => !hasSecret(s)) && JSON.stringify(r).includes("[hidden]") && !("apiKey" in describeResolved(r)));
}

// ================= global switch, supported providers, ApiError compatibility (Phase 4.4.3) =================
{
  const e = { GROQ_API_KEY: KEY_A, ANTHROPIC_API_KEY: KEY_B };
  const off = mkResolver({}, e, { loadGlobal: async () => ({ enabled: false }) });
  const rs = await Promise.all((["TEXT", "VISION", "INTERVIEW"] as const).map((p) => off.resolve(p)));
  t("global switch: off disables every purpose, even with environment keys and no database row (it overrides the environment), and says it was the global switch", rs.every((r) => !r.enabled && r.disabledBy === "global" && r.apiKey === null && !r.configured && r.source.key === "none"));
  const withRow = await mkResolver({ TEXT: withKey(KEY_C) }, e, { loadGlobal: async () => ({ enabled: false }) }).resolve("TEXT");
  t("global switch: off also overrides a purpose that has its own enabled row and stored key", !withRow.enabled && withRow.disabledBy === "global" && withRow.apiKey === null);
  const per = await mkResolver({ TEXT: withKey(KEY_C, { enabled: false }) }, e, { loadGlobal: async () => ({ enabled: true }) }).resolve("TEXT");
  t("per-purpose switch: a disabled row reports disabledBy 'purpose'", !per.enabled && per.disabledBy === "purpose");
  const on = await mkResolver({}, e, { loadGlobal: async () => ({ enabled: true }) }).resolve("TEXT"), none = await mkResolver({}, e, { loadGlobal: async () => null }).resolve("TEXT");
  t("global switch: an explicit 'on' row and no row at all both mean on", on.enabled && on.disabledBy === null && none.enabled && none.apiKey?.reveal() === KEY_A);
  const g1 = await rejects(() => off.resolveForCall("TEXT")), g2 = await rejects(() => mkResolver({ TEXT: withKey(KEY_C, { enabled: false }) }, e).resolveForCall("TEXT"));
  t("resolveForCall refuses with AI_DISABLED (503) and a message that says which switch: 'AI features are switched off' (global) or 'This AI feature is switched off' (purpose)", g1?.code === "AI_DISABLED" && /^AI features are switched off/.test(g1.message) && g2?.code === "AI_DISABLED" && /^This AI feature is switched off/.test(g2.message));
  t("availability: false when either switch is off, true when configured and on", !(await off.available("TEXT")) && (await mkResolver({}, e).available("TEXT")) && !(await mkResolver({}, {}).available("TEXT")));
  const gc = await rejects(() => mkResolver({}, e, { loadGlobal: async () => { throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); } }).resolve("TEXT"));
  t("global switch unreadable with nothing known: the call fails closed (AI_CONFIG_UNAVAILABLE) rather than assuming 'on'", gc?.code === "AI_CONFIG_UNAVAILABLE");
  let down = false, t0 = 0;
  const gr = mkResolver({}, e, { ttlMs: 1000, now: () => t0, loadGlobal: async () => { if (down) throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }); return { enabled: false }; } });
  await gr.resolve("TEXT"); down = true; t0 = 2000; const stale = await gr.resolve("TEXT");
  t("global switch unreadable after it was read as OFF: the last known OFF state is kept (stale), so an outage cannot switch AI back on", !stale.enabled && stale.stale && stale.disabledBy === "global");
  const missing = await mkResolver({}, e, { loadGlobal: async () => { throw Object.assign(new Error('relation "AiGlobalSetting" does not exist'), { code: "P2021" }); } }).resolve("TEXT");
  t("global switch table missing (not migrated): treated as on, exactly as before the switch existed", missing.enabled && missing.apiKey?.reveal() === KEY_A);
  const { SUPPORTED_PROVIDER } = await import("../../lib/ai/config");
  t("supported providers per purpose are fixed: TEXT and VISION use Groq, INTERVIEW uses Anthropic", JSON.stringify(SUPPORTED_PROVIDER) === JSON.stringify({ TEXT: "GROQ", VISION: "GROQ", INTERVIEW: "ANTHROPIC" }));
  const un = mkResolver({ TEXT: row({ provider: "ANTHROPIC", model: "m" }), INTERVIEW: row({ purpose: "INTERVIEW", provider: "GROQ", model: "m" }) }, e);
  const u1 = await rejects(() => un.resolveForCall("TEXT")), u2 = await rejects(() => un.resolveForCall("INTERVIEW"));
  t("a purpose configured for a provider its call path cannot serve is refused (AI_PROVIDER_UNSUPPORTED, 503): never silently sent to another provider", u1?.code === "AI_PROVIDER_UNSUPPORTED" && u2?.code === "AI_PROVIDER_UNSUPPORTED" && !(await un.available("TEXT")) && !(await un.available("INTERVIEW")));
  const { AiConfigError } = await import("../../lib/ai/config"), { ApiError } = await import("../../lib/api/errors");
  const ae = new AiConfigError("AI_DISABLED", 503, "plain message");
  t("AiConfigError is an ApiError (status, code and message), so the existing route and feature error handling applies to it unchanged", ae instanceof ApiError && ae.status === 503 && ae.code === "AI_DISABLED" && ae.message === "plain message" && ae.name === "AiConfigError");
  t("describeResolved includes which switch disabled a purpose and still carries no key", JSON.stringify(Object.keys(describeResolved(rs[0])).sort()) === JSON.stringify(["configured", "disabledBy", "enabled", "keyLast4", "model", "provider", "purpose", "source", "stale"]) && !hasSecret(JSON.stringify(describeResolved(rs[0]))));
}

// ================= startup validation =================
{
  const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/x", SUPABASE_URL: "http://localhost:54321", SUPABASE_ANON_KEY: "a".repeat(30), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(30) } as Record<string, string>;
  t("startup: a valid AI master key setup raises no configuration error", checkEnv({ ...base, ...env(), AI_MASTER_KEY_ACTIVE: "2" } as unknown as NodeJS.ProcessEnv).errors.length === 0 && checkEnv(base as unknown as NodeJS.ProcessEnv).errors.length === 0);
  const bad = checkEnv({ ...base, AI_MASTER_KEY_V1: "not-a-key", AI_MASTER_KEY_ACTIVE: "1" } as unknown as NodeJS.ProcessEnv);
  t("startup: a malformed master key is a configuration error that names the variable and never shows its value", bad.errors.some((e) => /AI_MASTER_KEY_V1 is not a valid 256-bit key/.test(e)) && !bad.errors.join(" ").includes("not-a-key"));
  t("startup: an active version with no key is a configuration error", checkEnv({ ...base, AI_MASTER_KEY_ACTIVE: "4" } as unknown as NodeJS.ProcessEnv).errors.some((e) => /AI_MASTER_KEY_V4 is not set/.test(e)));
}

// ================= nothing secret was ever printed =================
t("OUTPUT: none of the test API keys or master keys (in any encoding) appears anywhere in this suite's captured output", !printed.some(hasSecret));
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);

import { ApiError } from "@/lib/api/errors";
import { isDatabaseUnavailable } from "@/lib/dbErrors";
import { AiKeyError, Secret, decryptSecret, loadMasterKeys, type MasterKeys } from "@/lib/ai/crypto";

/**
 * The one place that decides which provider, model and key an AI call uses. Since Phase 4.4.3 the Groq call path (lib/intelligence/groq.ts) and the Anthropic call path
 * (lib/mockInterview.ts, used by the interview engine and the discussion simulator) both ask this module; their request and response formats, timeouts and error mapping are unchanged.
 *
 * Precedence for each purpose (TEXT, VISION, INTERVIEW):
 *   0. the GLOBAL kill switch (AiGlobalSetting): off means every purpose is off, no matter what follows;
 *   1. an active row in AiProviderConfig (provider, model, optionally an encrypted key); a row with enabled = false is the per-purpose kill switch: the purpose is OFF and does not fall through;
 *   2. environment variables (GROQ_API_KEY / GROQ_MODEL / GROQ_VISION_MODEL / GROQ_API_BASE, ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL);
 *   3. the built-in defaults, which are exactly today's: Groq llama-3.3-70b-versatile for text, Groq qwen/qwen3.8-27b for vision, Anthropic claude-opus-5-5 for interviews.
 * A row without a key uses the provider's environment key. Nothing here ever changes a provider or model silently, and there is NO automatic provider failover:
 *   - database unavailable: the last known configuration is kept (marked stale); with none, the call FAILS (503 AI_CONFIG_UNAVAILABLE). It never quietly drops to the environment/defaults,
 *     which could be a different provider or model than the one an administrator chose;
 *   - a table does not exist yet (migration not applied): that is "nothing configured", so the environment and defaults apply exactly as before;
 *   - a stored key that cannot be decrypted: the call FAILS (503 AI_KEY_UNREADABLE); it does not fall back to a different key;
 *   - a provider that the purpose's call path cannot serve (SUPPORTED_PROVIDER): the call FAILS (503 AI_PROVIDER_UNSUPPORTED); it is never sent to a different provider.
 */
export type Purpose = "TEXT" | "VISION" | "INTERVIEW";
export type Provider = "GROQ" | "ANTHROPIC";
export const PURPOSES: readonly Purpose[] = ["TEXT", "VISION", "INTERVIEW"];
export const PROVIDERS: readonly Provider[] = ["GROQ", "ANTHROPIC"];

/** Today's behaviour, unchanged: these must only change by an explicit, approved decision. */
export const DEFAULTS: Readonly<Record<Purpose, { provider: Provider; model: string }>> = {
  TEXT: { provider: "GROQ", model: "llama-3.3-70b-versatile" },
  VISION: { provider: "GROQ", model: "qwen/qwen3.8-27b" },
  INTERVIEW: { provider: "ANTHROPIC", model: "claude-opus-5-5" },
};
/**
 * The provider each purpose's existing call path can actually talk to: the text and vision features use Groq's JSON-mode chat API, the interview engine uses the Anthropic Messages API
 * with its structured-output options. Serving a purpose from the other provider needs an adapter that does not exist (and is not approved), so a configuration that asks for it is
 * refused at call time rather than silently sent somewhere else. Administrators may change MODEL and KEY per purpose; the provider is fixed per purpose in this version.
 */
export const SUPPORTED_PROVIDER: Readonly<Record<Purpose, Provider>> = { TEXT: "GROQ", VISION: "GROQ", INTERVIEW: "ANTHROPIC" };

const ENV = {
  keyVar: { GROQ: "GROQ_API_KEY", ANTHROPIC: "ANTHROPIC_API_KEY" } as Record<Provider, string>,
  baseVar: { GROQ: "GROQ_API_BASE", ANTHROPIC: "ANTHROPIC_BASE_URL" } as Record<Provider, string>,
  /** Existing model variables (only where one exists today: there is none for the interview model). */
  modelVar: { TEXT: "GROQ_MODEL", VISION: "GROQ_VISION_MODEL", INTERVIEW: null } as Record<Purpose, string | null>,
};

/** The stored row, as far as resolution needs it (never exposed outside the server). */
export type AiConfigRow = { id: string; purpose: Purpose; provider: Provider; model: string; enabled: boolean; keyCiphertext: string | null; keyVersion: number | null; keyLast4: string | null };
export type AiGlobalRow = { enabled: boolean };

export type Resolved = {
  purpose: Purpose;
  provider: Provider;
  model: string;
  /** False when the purpose is switched off (per-purpose or global kill switch). */
  enabled: boolean;
  /** Which switch turned it off, when it is off. */
  disabledBy: "global" | "purpose" | null;
  /** True when a usable key exists. */
  configured: boolean;
  /** The key, only as a Secret (prints as "[hidden]"). Null when none is configured or the purpose is disabled. */
  apiKey: Secret | null;
  baseUrl: string | null;
  source: { config: "database" | "environment" | "default"; model: "database" | "environment" | "default"; key: "database" | "environment" | "none" };
  keyLast4: string | null;
  /** True when the database could not be read and the last known configuration is being used. */
  stale: boolean;
};

/** An ApiError, so the existing route and feature error handling (status, code, message) applies unchanged. */
export class AiConfigError extends ApiError {
  constructor(public code: "AI_CONFIG_UNAVAILABLE" | "AI_KEY_UNREADABLE" | "AI_DISABLED" | "AI_PROVIDER_UNSUPPORTED", public status: 503, message: string) { super(status, code, message); this.name = "AiConfigError"; }
}

/** What is safe to log or return about a resolution. No key, no ciphertext. */
export const describeResolved = (r: Resolved) => ({ purpose: r.purpose, provider: r.provider, model: r.model, enabled: r.enabled, disabledBy: r.disabledBy, configured: r.configured, source: r.source, keyLast4: r.keyLast4, stale: r.stale });

type Deps = {
  /** Reads the row for a purpose. Default: the database. Throws if the database cannot be read. */
  load?: (purpose: Purpose) => Promise<AiConfigRow | null>;
  /** Reads the global switch. Default: the database, or "no row" when a custom `load` is given (so an isolated resolver never touches a database). */
  loadGlobal?: () => Promise<AiGlobalRow | null>;
  env?: () => Record<string, string | undefined>;
  masterKeys?: () => MasterKeys;
  now?: () => number;
  /** How long a read row is reused. Other server instances see a change within this time. */
  ttlMs?: number;
  /** Longest a database read may take before it counts as unavailable. */
  timeoutMs?: number;
  log?: (line: Record<string, unknown>) => void;
};

const isMissingTable = (e: unknown) => {
  const x = e as { code?: unknown; message?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } } | null;
  return x?.code === "P2021" || x?.code === "42P01" || x?.meta?.driverAdapterError?.cause?.originalCode === "42P01" || (typeof x?.message === "string" && /relation "?(public\.)?"?Ai(ProviderConfig|GlobalSetting)"? does not exist|table .*Ai(ProviderConfig|GlobalSetting).* does not exist/i.test(x.message));
};

const trimmed = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

type Key = Purpose | "GLOBAL";
type Entry = { at: number; row: AiConfigRow | AiGlobalRow | null; stale?: boolean };

export function createAiResolver(deps: Deps = {}) {
  const env = deps.env ?? (() => process.env);
  const now = deps.now ?? Date.now;
  const ttl = deps.ttlMs ?? 30_000, timeoutMs = deps.timeoutMs ?? 1500;
  const keys = deps.masterKeys ?? (() => loadMasterKeys(env()));
  const log = deps.log ?? ((l) => console.warn(JSON.stringify({ level: "warn", ...l })));
  const cache = new Map<Key, Entry>();
  const inflight = new Map<Key, Promise<Entry>>();
  const loadPurpose = deps.load ?? (async (purpose: Purpose) => {
    const { db } = await import("@/lib/db");
    return (await db.aiProviderConfig.findUnique({ where: { purpose } })) as AiConfigRow | null;
  });
  const loadGlobal = deps.loadGlobal ?? (deps.load ? async () => null : async () => {
    const { db } = await import("@/lib/db");
    return (await db.aiGlobalSetting.findUnique({ where: { id: "global" } })) as AiGlobalRow | null;
  });
  const loader = (k: Key) => (k === "GLOBAL" ? loadGlobal() : loadPurpose(k));

  const RETRY_MS = 5_000, FAIL_MS = 2_000;
  const failedAt = new Map<Key, number>();
  const unavailable = () => new AiConfigError("AI_CONFIG_UNAVAILABLE", 503, "AI settings cannot be read right now. Try again in a moment");

  async function read<T extends AiConfigRow | AiGlobalRow>(k: Key): Promise<{ row: T | null; stale: boolean }> {
    const hit = cache.get(k);
    if (hit && now() - hit.at < ttl) return { row: hit.row as T | null, stale: !!hit.stale };
    const f = failedAt.get(k);
    if (!hit && f !== undefined && now() - f < FAIL_MS) throw unavailable(); // do not hammer a failing database
    // One read at a time per key, however many calls arrive together.
    let p = inflight.get(k);
    if (!p) {
      p = (async (): Promise<Entry> => {
        let timer: NodeJS.Timeout;
        try {
          const row = await Promise.race([loader(k), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), timeoutMs); })]);
          const e = { at: now(), row };
          cache.set(k, e);
          return e;
        } catch (err) {
          if (isMissingTable(err)) { const e = { at: now(), row: null }; cache.set(k, e); return e; } // migration not applied: nothing configured
          throw err;
        } finally { clearTimeout(timer!); }
      })().finally(() => { inflight.delete(k); });
      inflight.set(k, p);
    }
    try { return { row: (await p).row as T | null, stale: false }; }
    catch (err) {
      // Could not read the configuration. Keep the last known one (never a silent switch to other settings); with none, fail.
      if (hit) {
        cache.set(k, { at: now() - ttl + RETRY_MS, row: hit.row, stale: true }); // look again in RETRY_MS, not on every call
        log({ msg: "AI configuration unreadable; using the last known configuration", purpose: k, reason: isDatabaseUnavailable(err) ? "database unavailable" : (err as Error)?.message === "timeout" ? "timeout" : "error" });
        return { row: hit.row as T | null, stale: true };
      }
      failedAt.set(k, now());
      throw unavailable();
    }
  }

  async function resolve(purpose: Purpose): Promise<Resolved> {
    const e = env();
    const [{ row, stale: s1 }, g] = await Promise.all([read<AiConfigRow>(purpose), read<AiGlobalRow>("GLOBAL")]);
    const stale = s1 || g.stale;
    const globalOff = !!g.row && g.row.enabled === false;
    if (row) {
      const provider = row.provider;
      const base = trimmed(e[ENV.baseVar[provider]]);
      const common = { purpose, provider, model: row.model, baseUrl: base, stale, source: { config: "database" as const, model: "database" as const } };
      if (globalOff || !row.enabled) return { ...common, enabled: false, disabledBy: globalOff ? "global" : "purpose", configured: false, apiKey: null, keyLast4: null, source: { ...common.source, key: "none" } };
      if (row.keyCiphertext) {
        let plain: string;
        try { plain = decryptSecret(row.keyCiphertext, { id: row.id, purpose: row.purpose, provider: row.provider }, keys()); }
        catch (err) {
          log({ msg: "stored AI key could not be decrypted; the call is refused (no fallback to another key)", purpose, code: err instanceof AiKeyError ? err.code : "error" });
          throw new AiConfigError("AI_KEY_UNREADABLE", 503, "The AI key for this feature cannot be read. An administrator must check the AI settings");
        }
        return { ...common, enabled: true, disabledBy: null, configured: true, apiKey: new Secret(plain), keyLast4: row.keyLast4, source: { ...common.source, key: "database" } };
      }
      const envKey = trimmed(e[ENV.keyVar[provider]]);
      return { ...common, enabled: true, disabledBy: null, configured: !!envKey, apiKey: envKey ? new Secret(envKey) : null, keyLast4: null, source: { ...common.source, key: envKey ? "environment" : "none" } };
    }
    // No active database configuration: environment, then the defaults.
    const d = DEFAULTS[purpose];
    const mv = ENV.modelVar[purpose];
    const envModel = mv ? trimmed(e[mv]) : null;
    const envKey = trimmed(e[ENV.keyVar[d.provider]]);
    return {
      purpose, provider: d.provider, model: envModel ?? d.model, enabled: !globalOff, disabledBy: globalOff ? "global" : null, configured: !globalOff && !!envKey, apiKey: !globalOff && envKey ? new Secret(envKey) : null,
      baseUrl: trimmed(e[ENV.baseVar[d.provider]]), stale,
      source: { config: envKey || envModel ? "environment" : "default", model: envModel ? "environment" : "default", key: !globalOff && envKey ? "environment" : "none" }, keyLast4: null,
    };
  }

  /** The resolution an AI call must use. Throws AI_DISABLED when either kill switch is on, and AI_PROVIDER_UNSUPPORTED when the configured provider cannot serve this purpose. */
  async function resolveForCall(purpose: Purpose): Promise<Resolved> {
    const r = await resolve(purpose);
    if (!r.enabled) throw new AiConfigError("AI_DISABLED", 503, r.disabledBy === "global" ? "AI features are switched off by an administrator" : "This AI feature is switched off by an administrator");
    if (r.provider !== SUPPORTED_PROVIDER[purpose]) throw new AiConfigError("AI_PROVIDER_UNSUPPORTED", 503, "This AI feature is set to a provider it cannot use. An administrator must check the AI settings");
    return r;
  }

  /** Can an AI feature for this purpose run now? (on, a key present, a provider the feature can use). Never throws: an unreadable configuration counts as "not available". */
  async function available(purpose: Purpose): Promise<boolean> {
    try { const r = await resolve(purpose); return r.enabled && r.configured && r.provider === SUPPORTED_PROVIDER[purpose]; } catch { return false; }
  }

  const invalidate = (purpose?: Purpose | "GLOBAL") => { if (purpose) cache.delete(purpose); else cache.clear(); };
  return { resolve, resolveForCall, available, invalidate };
}

let current = createAiResolver();
/** Resolves a purpose with the process-wide resolver (30 s cache, single read in flight). */
export const resolveAi = (purpose: Purpose) => current.resolve(purpose);
export const resolveAiForCall = (purpose: Purpose) => current.resolveForCall(purpose);
export const aiAvailable = (purpose: Purpose) => current.available(purpose);
/** Call after any change to the AI configuration made by this process so it sees the change at once (other instances see it within the cache time). */
export const invalidateAiConfigCache = (purpose?: Purpose | "GLOBAL") => current.invalidate(purpose);
/** Tests only: replace the process-wide resolver, for example with one that never reads a database. Pass null to restore the default. */
export function setAiResolverForTests(r: ReturnType<typeof createAiResolver> | null) { current = r ?? createAiResolver(); }

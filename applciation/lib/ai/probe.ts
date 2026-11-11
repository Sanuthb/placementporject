import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "@/lib/ai/config";

/**
 * Provider checks that never spend money: they only LIST the models a key can use (Groq: GET /models; Anthropic: models.list). No completion, no tokens, no prompt, no student data.
 * Used by the administrator's "Test" button and by the platform health check. The key goes only into the request's authorization header; it is never returned, logged or put in an error.
 */
export type ProbeReason = "ok" | "unauthorized" | "rate_limited" | "unavailable" | "timeout" | "error";
export type ProbeResult = { ok: boolean; reason: ProbeReason; status: number | null; models: string[]; ms: number };

const GROQ_BASE = "https://api.groq.com/openai/v1";
const reasonOf = (status: number | null): ProbeReason => (status === 401 || status === 403 ? "unauthorized" : status === 429 ? "rate_limited" : status !== null && status >= 500 ? "unavailable" : status !== null && status >= 400 ? "error" : "ok");

export async function listProviderModels(provider: Provider, key: string, baseUrl: string | null, timeoutMs = 4000): Promise<ProbeResult> {
  const t0 = performance.now();
  const done = (r: Omit<ProbeResult, "ms">): ProbeResult => ({ ...r, ms: Math.round(performance.now() - t0) });
  try {
    if (provider === "GROQ") {
      const res = await fetch(`${baseUrl ?? GROQ_BASE}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
      const body = res.ok ? ((await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null) : (await res.body?.cancel().catch(() => undefined), null);
      const models = (body?.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === "string").slice(0, 500);
      return done({ ok: res.ok, reason: reasonOf(res.status), status: res.status, models });
    }
    const client = new Anthropic({ apiKey: key, ...(baseUrl ? { baseURL: baseUrl } : {}), maxRetries: 0, timeout: timeoutMs });
    const page = await client.models.list({ limit: 1000 });
    const models = ((page as unknown as { data?: { id?: unknown }[] }).data ?? []).map((m) => m.id).filter((x): x is string => typeof x === "string").slice(0, 500);
    return done({ ok: true, reason: "ok", status: 200, models });
  } catch (e) {
    const x = e as { name?: string; status?: number };
    if (x?.name === "TimeoutError" || x?.name === "AbortError" || x?.name === "APIConnectionTimeoutError") return done({ ok: false, reason: "timeout", status: null, models: [] });
    if (typeof x?.status === "number") return done({ ok: false, reason: reasonOf(x.status), status: x.status, models: [] });
    return done({ ok: false, reason: "unavailable", status: null, models: [] });
  }
}

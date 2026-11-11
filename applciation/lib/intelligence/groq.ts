import { ApiError } from "@/lib/api/errors";
import { recordAiCall } from "@/lib/monitorStore";
import { aiAvailable, resolveAiForCall, type Resolved } from "@/lib/ai/config";
import { withAiCall } from "@/lib/ai/gate";

/**
 * The Groq call path (JSON-mode chat completions) for the TEXT and VISION purposes. Provider, model, key and base URL come from the central resolver (lib/ai/config.ts): an active
 * database configuration, else the environment (GROQ_API_KEY, GROQ_MODEL, GROQ_VISION_MODEL, GROQ_API_BASE, read at call time), else today's defaults. Request format, timeouts, error
 * mapping and messages are unchanged. Both kill switches are enforced before anything is sent, and there is no failover: a failing call is never retried with another key or provider.
 * Nothing the provider sends back (error bodies can echo a prompt) and no prompt or answer is ever written to a log: only the purpose, model, status and an error class.
 */
const DEFAULT_BASE = "https://api.groq.com/openai/v1";

export type GroqPurpose = "TEXT" | "VISION";
export type GroqPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type GroqMessage = { role: "system" | "user"; content: string | GroqPart[] };

/** Can this purpose's AI features run now (not switched off, a key is available)? Used to hide or skip features, never to call. */
export const groqAvailable = (purpose: GroqPurpose = "TEXT") => aiAvailable(purpose);

/**
 * One JSON-mode chat completion. Failures become clear API errors; the cause stays in the server log (without any provider body). Returns the parsed answer and the model that was used,
 * so callers that record the model record the real one. Pass `resolved` to reuse a resolution already obtained for this call (so the recorded model is exactly the one used).
 */
export async function groqCall(purpose: GroqPurpose, messages: GroqMessage[], o: { temperature?: number; maxTokens?: number; timeoutMs?: number; resolved?: Resolved; feature?: string } = {}): Promise<{ data: unknown; model: string }> {
  const r = o.resolved ?? (await resolveAiForCall(purpose));
  if (!r.apiKey) throw new ApiError(503, "AI_NOT_CONFIGURED", "AI analysis is not switched on. Add GROQ_API_KEY to the server settings");
  const key = r.apiKey.reveal(), model = r.model;
  // Daily limits are checked and the outcome recorded around the provider call (lib/ai/gate.ts). A refused call never reaches the provider.
  return withAiCall({ purpose, provider: "GROQ", model, feature: o.feature ?? "other" }, async (note) => {
  let res: Response;
  const t0 = performance.now();
  try {
    res = await fetch(`${r.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: o.temperature ?? 0.2, max_tokens: o.maxTokens ?? 3500, response_format: { type: "json_object" }, messages }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 50_000),
    });
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
    if (timedOut) note("timeout");
    recordAiCall({ ok: false, timeout: timedOut, ms: performance.now() - t0 }); // outcome and time only
    console.error(JSON.stringify({ level: "error", msg: "groq request failed", purpose, model, errorName: (e as Error)?.name })); // not the message: it can carry a URL
    throw new ApiError(502, "AI_FAILED", "The AI service did not respond. Try again in a moment");
  }
  recordAiCall({ ok: res.ok, ms: performance.now() - t0, status: res.status });
  if (res.status === 429) { note("rate_limited"); throw new ApiError(429, "AI_BUSY", "The AI service is busy. Try again in a minute"); }
  if (res.status === 401 || res.status === 403) throw new ApiError(503, "AI_NOT_CONFIGURED", r.source.key === "database" ? "The AI key was refused. Check the AI key in the platform AI settings" : "The AI key was refused. Check GROQ_API_KEY");
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined); // the provider's error body is never read or logged: it can echo the prompt
    console.error(JSON.stringify({ level: "error", msg: "groq error", purpose, model, status: res.status }));
    if (res.status === 400 || res.status === 413) throw new ApiError(422, "AI_FAILED", "The AI service could not accept this file. Staff will check it by hand");
    throw new ApiError(502, "AI_FAILED", "The AI service could not complete the analysis. Try again");
  }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  try { return { data: JSON.parse(content ?? ""), model }; } catch { throw new ApiError(502, "AI_FAILED", "The AI returned an unreadable answer. Try again"); }
  });
}

/** The same, returning only the parsed answer. */
export async function groqJsonMessages(purpose: GroqPurpose, messages: GroqMessage[], o: { temperature?: number; maxTokens?: number; timeoutMs?: number; resolved?: Resolved; feature?: string } = {}): Promise<unknown> {
  return (await groqCall(purpose, messages, o)).data;
}

/** One JSON-mode chat completion for text work (the TEXT purpose). */
export async function groqJson(system: string, user: string, o: { resolved?: Resolved; feature?: string } = {}): Promise<unknown> {
  return groqJsonMessages("TEXT", [{ role: "system", content: system }, { role: "user", content: user }], { temperature: 0.2, maxTokens: 3500, resolved: o.resolved, feature: o.feature });
}

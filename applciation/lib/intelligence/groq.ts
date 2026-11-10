import { ApiError } from "@/lib/api/errors";
import { recordAiCall } from "@/lib/monitorStore";

/** GROQ_API_BASE lets a test point this at a local mock provider; unset, it is the real Groq endpoint. */
const ENDPOINT = `${process.env.GROQ_API_BASE?.trim() || "https://api.groq.com/openai/v1"}/chat/completions`;
export const groqModel = () => process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
export const groqConfigured = () => !!process.env.GROQ_API_KEY?.trim();

export const groqVisionModel = () => process.env.GROQ_VISION_MODEL?.trim() || "qwen/qwen3.8-27b";

export type GroqPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type GroqMessage = { role: "system" | "user"; content: string | GroqPart[] };

/** One JSON-mode chat completion on Groq. Failures become clear API errors; the cause stays in the server log. */
export async function groqJson(system: string, user: string): Promise<unknown> {
  return groqJsonMessages(groqModel(), [{ role: "system", content: system }, { role: "user", content: user }], { temperature: 0.2, maxTokens: 3500 });
}

/** The same, with any messages (including image parts for a vision model). */
export async function groqJsonMessages(model: string, messages: GroqMessage[], o: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {}): Promise<unknown> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new ApiError(503, "AI_NOT_CONFIGURED", "AI analysis is not switched on. Add GROQ_API_KEY to the server settings");
  let res: Response;
  const t0 = performance.now();
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: o.temperature ?? 0.2, max_tokens: o.maxTokens ?? 3500, response_format: { type: "json_object" }, messages }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 50_000),
    });
  } catch (e) {
    recordAiCall({ ok: false, timeout: (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError", ms: performance.now() - t0 }); // outcome and time only
    console.error(JSON.stringify({ level: "error", msg: "groq request failed", error: (e as Error).message }));
    throw new ApiError(502, "AI_FAILED", "The AI service did not respond. Try again in a moment");
  }
  recordAiCall({ ok: res.ok, ms: performance.now() - t0, status: res.status });
  if (res.status === 429) throw new ApiError(429, "AI_BUSY", "The AI service is busy. Try again in a minute");
  if (res.status === 401 || res.status === 403) throw new ApiError(503, "AI_NOT_CONFIGURED", "The AI key was refused. Check GROQ_API_KEY");
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    console.error(JSON.stringify({ level: "error", msg: "groq error", status: res.status, model, body }));
    if (res.status === 400 || res.status === 413) throw new ApiError(422, "AI_FAILED", "The AI service could not accept this file. Staff will check it by hand");
    throw new ApiError(502, "AI_FAILED", "The AI service could not complete the analysis. Try again");
  }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  try { return JSON.parse(content ?? ""); } catch { throw new ApiError(502, "AI_FAILED", "The AI returned an unreadable answer. Try again"); }
}

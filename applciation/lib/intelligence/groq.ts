import { ApiError } from "@/lib/api/errors";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const groqModel = () => process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
export const groqConfigured = () => !!process.env.GROQ_API_KEY?.trim();

/** One JSON-mode chat completion on Groq. Failures become clear API errors; the cause stays in the server log. */
export async function groqJson(system: string, user: string): Promise<unknown> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new ApiError(503, "AI_NOT_CONFIGURED", "AI analysis is not switched on. Add GROQ_API_KEY to the server settings");
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: groqModel(), temperature: 0.2, max_tokens: 3500, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      signal: AbortSignal.timeout(50_000),
    });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", msg: "groq request failed", error: (e as Error).message }));
    throw new ApiError(502, "AI_FAILED", "The AI service did not respond. Try again in a moment");
  }
  if (res.status === 429) throw new ApiError(429, "AI_BUSY", "The AI service is busy. Try again in a minute");
  if (res.status === 401 || res.status === 403) throw new ApiError(503, "AI_NOT_CONFIGURED", "The AI key was refused. Check GROQ_API_KEY");
  if (!res.ok) {
    console.error(JSON.stringify({ level: "error", msg: "groq error", status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) }));
    throw new ApiError(502, "AI_FAILED", "The AI service could not complete the analysis. Try again");
  }
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const content = json?.choices?.[0]?.message?.content;
  try { return JSON.parse(content ?? ""); } catch { throw new ApiError(502, "AI_FAILED", "The AI returned an unreadable answer. Try again"); }
}

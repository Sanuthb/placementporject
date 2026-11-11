import { ApiError } from "@/lib/api/errors";
import { currentCollegeKey } from "@/lib/ai/context";
import { reserve } from "@/lib/ai/limits";
import { recordUsage, type Outcome } from "@/lib/ai/usage";
import type { Provider, Purpose } from "@/lib/ai/config";

/**
 * Wraps one provider call: reserves its place under the daily limits (refusing with 429 AI_LIMIT_REACHED when a limit is full, before anything is sent to the provider), runs it, and records
 * the outcome and duration. The limit message says only that a daily limit was reached; it never names which institution used what. Statistics hold no request content (lib/ai/usage.ts).
 * `note` lets the call say what happened when the thrown error no longer shows it (a Groq timeout becomes a generic AI_FAILED).
 */
export type CallMeta = { purpose: Purpose; provider: Provider; model: string; feature: string };
export const LIMIT_MESSAGE = "The daily AI limit has been reached. Try again tomorrow, or ask your administrator to raise the limit";

function classify(e: unknown): Outcome {
  const x = e as { name?: string; code?: string; status?: number };
  if (e instanceof ApiError && (e.code === "AI_BUSY" || e.status === 429)) return "rate_limited";
  if (x?.name === "TimeoutError" || x?.name === "AbortError" || x?.name === "APIConnectionTimeoutError") return "timeout";
  if (x?.name === "RateLimitError") return "rate_limited";
  return "failure";
}

export async function withAiCall<T>(meta: CallMeta, run: (note: (o: Outcome) => void) => Promise<T>): Promise<T> {
  const collegeKey = currentCollegeKey();
  const key = { collegeKey, ...meta };
  const r = await reserve({ collegeKey, provider: meta.provider, purpose: meta.purpose });
  if (!r.ok) {
    await recordUsage(key, "blocked", 0);
    throw new ApiError(429, "AI_LIMIT_REACHED", LIMIT_MESSAGE);
  }
  let noted: Outcome | null = null;
  const t0 = performance.now();
  try {
    const out = await run((o) => { noted = o; });
    await recordUsage(key, noted ?? "success", performance.now() - t0);
    return out;
  } catch (e) {
    await recordUsage(key, noted ?? classify(e), performance.now() - t0);
    throw e;
  }
}

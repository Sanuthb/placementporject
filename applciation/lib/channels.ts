import { ApiError } from "@/lib/api/errors";
import type { Channel } from "@/lib/notifyRules";

/**
 * Sending services for text messages and WhatsApp. The adapter speaks Twilio's REST API (SMS and WhatsApp both go through it). Nothing is sent unless the keys are set,
 * the college has switched the channel on, and the student has opted in. CHANNEL_DRY_RUN=true builds and logs messages without sending (development and tests).
 *
 * Not verified against a live account. WhatsApp only delivers free text inside the 24 hours after the student last wrote to the number, or as a pre-approved template;
 * messages outside that window will fail at the provider until templates are set up, and the delivery log will show the provider's error.
 */
const env = () => process.env;
export const dryRun = () => env().CHANNEL_DRY_RUN === "true";
export function providerConfigured(channel: Channel) {
  if (channel === "EMAIL" || channel === "IN_APP") return true;
  if (dryRun()) return true;
  const e = env();
  return !!e.TWILIO_ACCOUNT_SID && !!e.TWILIO_AUTH_TOKEN && !!(channel === "SMS" ? e.TWILIO_SMS_FROM : e.TWILIO_WHATSAPP_FROM);
}

/** Sends one text or WhatsApp message to an E.164 number. Returns the provider's reference. Throws with a short reason on failure. */
export async function sendText(channel: "SMS" | "WHATSAPP", to: string, body: string): Promise<string> {
  if (dryRun()) return "dry-run";
  const e = env();
  if (!providerConfigured(channel)) throw new ApiError(503, "CHANNEL_NOT_CONFIGURED", "The sending service is not configured");
  const from = channel === "SMS" ? e.TWILIO_SMS_FROM! : e.TWILIO_WHATSAPP_FROM!;
  const wa = (n: string) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: channel === "WHATSAPP" ? wa(to) : to, From: channel === "WHATSAPP" ? wa(from) : from, Body: body }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as { sid?: string; message?: string; code?: number } | null;
  if (!res.ok || !json?.sid) throw new Error(`${json?.message ?? `HTTP ${res.status}`}${json?.code ? ` (code ${json.code})` : ""}`.slice(0, 280));
  return json.sid;
}

import { db } from "@/lib/db";
import type { Component, Status } from "@/lib/health";
import type { AiHealthCfg, AiHealthPurpose } from "@/lib/aiHealth";

/**
 * The read-only integration status dashboard (SA-TC-010, SA-TC-067). Nothing is edited here and no credential is read into the result. It reuses the platform health checks
 * (lib/health.ts: the same authenticated, free, time-limited probes the monitoring page uses, shared for 15 s) and the AI resolver's view of Groq and Anthropic.
 * Integrations without a health check (calendar, GitHub, SMS and WhatsApp) report only what can honestly be known: configured, missing or disabled; they are never shown as "healthy".
 *
 * States: healthy (configured and the check passed), configured (configured; no health check exists for it), missing (not configured), disabled (switched off or on hold),
 * unhealthy (reachable but failing or degraded), unavailable (could not be reached or timed out).
 */
export type IntegrationState = "healthy" | "configured" | "missing" | "disabled" | "unhealthy" | "unavailable";
export type Integration = { key: string; label: string; state: IntegrationState; summary: string; checked: boolean; latencyMs: number | null; onHold?: boolean; details: string[] };

const set = (v?: string) => !!v && v.trim() !== "";
const fromComponent = (s: Status): IntegrationState => (s === "healthy" ? "healthy" : s === "degraded" ? "unhealthy" : s === "unavailable" ? "unavailable" : s === "not_configured" ? "missing" : "configured");

type AiProbe = NonNullable<AiHealthCfg["probes"][keyof AiHealthCfg["probes"]]>;
function aiProvider(provider: "GROQ" | "ANTHROPIC", label: string, cfg: AiHealthCfg | null): Integration {
  const ps: AiHealthPurpose[] = (cfg?.purposes ?? []).filter((p) => p.provider === provider);
  const base = { key: provider.toLowerCase(), label, checked: false, latencyMs: null as number | null, details: [] as string[] };
  if (!cfg) return { ...base, state: "unavailable", summary: "The AI configuration could not be read" };
  const used = ps.map((p) => p.purpose).join(", ") || "none";
  if (ps.some((p) => p.error)) return { ...base, state: "unhealthy", summary: "A stored AI key or setting cannot be read", details: [`Used for: ${used}`, ...ps.filter((p) => p.error).map((p) => `${p.purpose}: ${p.error}`)] };
  if (ps.length && ps.every((p) => !p.enabled)) return { ...base, state: "disabled", summary: ps.every((p) => p.disabledBy === "global") ? "AI is switched off by the global switch" : "Switched off for every purpose that uses it", details: [`Used for: ${used}`] };
  if (!ps.some((p) => p.configured)) return { ...base, state: "missing", summary: "No API key is configured", details: [`Used for: ${used}`] };
  const pr: AiProbe | null | undefined = cfg.probes[provider];
  if (!pr) return { ...base, state: "configured", summary: "A key is configured; it has not been checked in this run", details: [`Used for: ${used}`, ...ps.map((p) => `${p.purpose}: ${p.model} (key from ${p.source})`)] };
  const d = [`Used for: ${used}`, ...ps.filter((p) => p.enabled).map((p) => `${p.purpose}: ${p.model} (key from ${p.source})`), `Model-list check ${pr.ok ? "succeeded" : "failed: " + pr.reason} in ${pr.ms} ms (free, no tokens used)`];
  if (pr.ok) return { ...base, state: "healthy", summary: "The provider accepts the configured key", checked: true, latencyMs: pr.ms, details: d };
  return { ...base, state: pr.reason === "timeout" || pr.reason === "unavailable" ? "unavailable" : "unhealthy", summary: pr.reason === "unauthorized" ? "The provider refused the configured key" : pr.reason === "rate_limited" ? "The provider is rate-limiting requests" : pr.reason === "timeout" ? "The provider did not answer in time" : "The provider could not be reached", checked: true, latencyMs: pr.ms, details: d };
}

export type IntegrationInput = { env: NodeJS.ProcessEnv; components: Component[]; ai: AiHealthCfg | null; checkedAt: string; sms: { collegesOn: number }; whatsapp: { collegesOn: number } };

/** Pure: maps health results and plain settings to the dashboard rows. */
export function buildIntegrations(i: IntegrationInput): Integration[] {
  const byKey = (k: string) => i.components.find((c) => c.key === k);
  const out: Integration[] = [];
  const email = byKey("email");
  if (i.env.SMTP_DRY_RUN === "true") out.push({ key: "smtp", label: "Email (SMTP)", state: "disabled", summary: "Dry-run mode: messages are built but not sent", checked: false, latencyMs: null, details: ["SMTP_DRY_RUN is on"] });
  else out.push({ key: "smtp", label: "Email (SMTP)", state: email ? fromComponent(email.status) : "unavailable", summary: email?.summary ?? "The email check did not run", checked: !!email && email.status !== "not_configured", latencyMs: email?.latencyMs ?? null, details: email?.evidence ?? [] });
  const keys = set(i.env.TWILIO_ACCOUNT_SID) && set(i.env.TWILIO_AUTH_TOKEN);
  for (const [key, label, n, from] of [["sms", "SMS", i.sms.collegesOn, i.env.TWILIO_SMS_FROM], ["whatsapp", "WhatsApp", i.whatsapp.collegesOn, i.env.TWILIO_WHATSAPP_FROM]] as const) {
    out.push({ key, label, state: "disabled", onHold: true, summary: "On hold: enforced by the application, nothing is sent", checked: false, latencyMs: null,
      details: [keys && set(from) ? "Provider keys are present in the environment, but they are not used while the hold is on" : "No provider keys are configured", `${n} institution(s) have switched this channel on; that has no effect while the hold is on`, "The hold is enforced in the server: every send is refused (CHANNEL_ON_HOLD) before any provider is contacted"] });
  }
  out.push({ key: "calendar", label: "Calendar feeds", state: set(i.env.APP_URL) ? "configured" : "missing", summary: set(i.env.APP_URL) ? "Calendar feeds are produced by this application; no external calendar service is used" : "APP_URL is not set, so feed links cannot be built", checked: false, latencyMs: null, details: [] });
  out.push(aiProvider("GROQ", "Groq (AI text and document reading)", i.ai));
  out.push(aiProvider("ANTHROPIC", "Anthropic (AI mock interview)", i.ai));
  out.push({ key: "github", label: "GitHub (project repositories)", state: set(i.env.GITHUB_TOKEN) ? "configured" : "missing", summary: set(i.env.GITHUB_TOKEN) ? "An access token is configured; GitHub is not contacted by this dashboard" : "No access token: repositories are read anonymously at a lower rate limit (optional)", checked: false, latencyMs: null, details: [] });
  const st = byKey("storage");
  out.push({ key: "storage", label: "Supabase Storage (documents)", state: st ? fromComponent(st.status) : "unavailable", summary: st?.summary ?? "The storage check did not run", checked: !!st && st.status !== "not_configured", latencyMs: st?.latencyMs ?? null, details: st?.evidence ?? [] });
  return out;
}

export async function integrationStatus(refresh = false) {
  const { getHealth } = await import("@/lib/health");
  const h = await getHealth({ refresh });
  const [smsOn, whatsappOn] = await Promise.all([db.collegeSettings.count({ where: { smsEnabled: true } }), db.collegeSettings.count({ where: { whatsappEnabled: true } })]);
  const aiCfg = (h.components.find((c) => c.key === "ai")?.details as { ai?: AiHealthCfg } | undefined)?.ai ?? null;
  const items = buildIntegrations({ env: process.env, components: h.components, ai: aiCfg, checkedAt: h.checkedAt, sms: { collegesOn: smsOn }, whatsapp: { collegesOn: whatsappOn } });
  const counts: Record<IntegrationState, number> = { healthy: 0, configured: 0, missing: 0, disabled: 0, unhealthy: 0, unavailable: 0 };
  for (const x of items) counts[x.state]++;
  return { checkedAt: h.checkedAt, cached: h.cached, throttled: h.throttled, readOnly: true, counts, items };
}

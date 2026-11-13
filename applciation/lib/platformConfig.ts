import { db } from "@/lib/db";
import { getPolicy, RETENTION, RETENTION_KEYS } from "@/lib/platformPolicy";
import { overview as aiOverview } from "@/lib/ai/admin";
import { LIMITS, CACHE_MS, FORCE_GAP_MS } from "@/lib/health";

/**
 * The read-only system configuration screen (SA-TC-007, SA-TC-067): the non-secret settings that are in effect and where each one comes from. Nothing here can be edited
 * and nothing secret is ever read into it: the registry below is an ALLOW-LIST. A value is built only from the entries written out here; secrets (keys, passwords, tokens,
 * connection strings, user names, the cron secret) appear only as "configured: yes / no". There is no generic "show the environment" path.
 *
 * Sources: environment (a deployment setting, changed by redeploying), database (changed by a platform administrator in the app), default (the built-in value because nothing is set),
 * code (fixed in the software).
 */
export type Source = "environment" | "database" | "default" | "code";
export type ConfigItem = { key: string; label: string; value: string | number | boolean | null; source: Source; note?: string };
export type ConfigGroup = { key: string; label: string; items: ConfigItem[] };

const host = (u?: string) => { try { return u ? new URL(u).host : null; } catch { return "invalid address"; } };
const set = (v?: string) => !!v && v.trim() !== "";
const fromEnv = (v: string | undefined, dflt: string | number | boolean): { value: string | number | boolean; source: Source } => (set(v) ? { value: v!.trim(), source: "environment" } : { value: dflt, source: "default" });

export type ConfigInput = {
  env: NodeJS.ProcessEnv;
  policy: { requireAdminMfa: boolean; days: Record<string, number>; stored: Record<string, number | null> };
  ai: { globalEnabled: boolean; globalReason: string | null; purposes: { purpose: string; provider: string; model: string | null; enabled: boolean; keyConfigured: boolean; source: string }[] };
  counts: { institutions: number; institutionsRequiringMfa: number; smsOn: number; whatsappOn: number };
};

/** Pure: builds the screen from plain inputs, so it can be tested without a server. */
export function buildConfig(i: ConfigInput): ConfigGroup[] {
  const e = i.env;
  const dry = (v?: string) => v === "true";
  const flood = fromEnv(e.FLOOD_MAX_PER_MINUTE, 600), pool = fromEnv(e.DB_POOL_MAX, "driver default");
  return [
    { key: "deployment", label: "Deployment", items: [
      { key: "mode", label: "Run mode", value: e.NODE_ENV ?? "development", source: "environment" },
      { key: "release", label: "Release (commit)", value: set(e.VERCEL_GIT_COMMIT_SHA) ? e.VERCEL_GIT_COMMIT_SHA!.trim().slice(0, 12) : null, source: set(e.VERCEL_GIT_COMMIT_SHA) ? "environment" : "default", note: set(e.VERCEL_GIT_COMMIT_SHA) ? "The commit this deployment was built from. Release history and deployment controls are in the hosting provider, not here." : "Not set: this is not a hosted deployment, so no release is recorded" },
      { key: "releaseBranch", label: "Release branch", value: set(e.VERCEL_GIT_COMMIT_REF) ? e.VERCEL_GIT_COMMIT_REF!.trim().slice(0, 80) : null, source: set(e.VERCEL_GIT_COMMIT_REF) ? "environment" : "default" },
      { key: "appHost", label: "Application address (host only)", value: host(e.APP_URL), source: set(e.APP_URL) ? "environment" : "default", note: set(e.APP_URL) ? undefined : "Not set: invitation e-mails will not link back to the app" },
      { key: "corsOrigins", label: "Allowed browser origins", value: set(e.CORS_ORIGINS) ? e.CORS_ORIGINS!.split(",").filter((x) => x.trim()).length : 0, source: set(e.CORS_ORIGINS) ? "environment" : "default", note: "Number of origins; the list itself is not shown" },
      { key: "supabaseHost", label: "Authentication and storage service (host only)", value: host(e.SUPABASE_URL), source: "environment" },
      { key: "dbPool", label: "Database connection pool size", value: pool.value, source: pool.source },
    ] },
    { key: "limits", label: "Request limits", items: [
      { key: "rateLimits", label: "Per-user rate limits", value: e.RATE_LIMIT_DISABLED === "true" ? "disabled" : "enabled", source: e.RATE_LIMIT_DISABLED === "true" ? "environment" : "default", note: e.RATE_LIMIT_DISABLED === "true" ? "Disabled by a deployment setting: intended for tests only" : undefined },
      { key: "flood", label: "Requests per minute per address (flood guard)", value: Number(flood.value), source: flood.source },
    ] },
    { key: "security", label: "Security", items: [
      { key: "platformMfa", label: "Two-step sign-in for platform administrators", value: "required", source: "code", note: "Cannot be switched off" },
      { key: "adminMfaMinimum", label: "Two-step sign-in minimum for institution administrators", value: i.policy.requireAdminMfa ? "required for every institution" : "set by each institution", source: "database", note: `${i.counts.institutionsRequiringMfa} of ${i.counts.institutions} active institutions also require it themselves` },
      { key: "cronSecret", label: "Scheduler secret configured", value: set(e.CRON_SECRET), source: "environment" },
    ] },
    { key: "ai", label: "AI services", items: [
      { key: "aiGlobal", label: "AI global switch", value: i.ai.globalEnabled ? "on" : "off", source: "database", note: i.ai.globalReason ?? undefined },
      ...i.ai.purposes.flatMap((p): ConfigItem[] => [
        { key: `ai.${p.purpose}`, label: `${p.purpose}: provider and model`, value: `${p.provider} / ${p.model ?? "default"}${p.enabled ? "" : " (disabled)"}`, source: p.source === "database" ? "database" : p.source === "environment" ? "environment" : "default" },
        { key: `ai.${p.purpose}.key`, label: `${p.purpose}: API key configured`, value: p.keyConfigured, source: p.source === "database" ? "database" : "environment", note: "The key itself is never shown" },
      ]),
    ] },
    { key: "email", label: "Email", items: [
      { key: "smtpConfigured", label: "SMTP server configured", value: set(e.SMTP_HOST) && set(e.SMTP_USER) && set(e.SMTP_PASS), source: "environment" },
      { key: "smtpHost", label: "SMTP server (host and port)", value: set(e.SMTP_HOST) ? `${e.SMTP_HOST}:${e.SMTP_PORT ?? "465"}` : null, source: set(e.SMTP_HOST) ? "environment" : "default" },
      { key: "smtpFrom", label: "Sender address", value: e.SMTP_FROM ?? null, source: set(e.SMTP_FROM) ? "environment" : "default" },
      { key: "smtpDry", label: "Dry-run (messages built but not sent)", value: dry(e.SMTP_DRY_RUN), source: set(e.SMTP_DRY_RUN) ? "environment" : "default" },
    ] },
    { key: "channels", label: "SMS and WhatsApp", items: [
      { key: "channelsStatus", label: "Status", value: "on hold", source: "code", note: "Not part of the current release. Enforced in the server: no message is sent, whatever the keys or an institution's setting, and no provider is contacted." },
      { key: "channelKeys", label: "Provider keys present", value: set(e.TWILIO_ACCOUNT_SID) && set(e.TWILIO_AUTH_TOKEN), source: "environment" },
      { key: "channelDry", label: "Channel dry-run", value: dry(e.CHANNEL_DRY_RUN), source: set(e.CHANNEL_DRY_RUN) ? "environment" : "default" },
      { key: "channelColleges", label: "Institutions that have switched SMS / WhatsApp on", value: `${i.counts.smsOn} / ${i.counts.whatsappOn}`, source: "database" },
    ] },
    { key: "integrations", label: "Other integrations", items: [
      { key: "githubToken", label: "GitHub access token configured", value: set(e.GITHUB_TOKEN), source: "environment", note: "Optional: without it GitHub is read anonymously at a lower rate limit" },
      { key: "calendar", label: "Calendar feed base address", value: host(e.APP_URL), source: set(e.APP_URL) ? "environment" : "default", note: "Calendar feeds are produced by this application; no external calendar service is used" },
    ] },
    { key: "retention", label: "Data retention (operational records)", items: RETENTION_KEYS.map((k) => ({ key: `retention.${k}`, label: RETENTION[k].label, value: `${i.policy.days[k]} days`, source: (i.policy.stored[k] === null ? "default" : "database") as Source, note: `Allowed ${RETENTION[k].min}–${RETENTION[k].max} days (default ${RETENTION[k].defaultDays})` })) },
    { key: "monitoring", label: "Monitoring", items: [
      { key: "healthCache", label: "Health check result sharing", value: `${CACHE_MS / 1000} s (forced refresh at most every ${FORCE_GAP_MS / 1000} s)`, source: "code" },
      { key: "healthLimits", label: "Time allowed per health check (database / storage / AI / mail)", value: `${LIMITS.dbMs} / ${LIMITS.storageMs} / ${LIMITS.aiMs} / ${LIMITS.smtpMs} ms`, source: "code" },
    ] },
  ];
}

export async function systemConfig() {
  const [policy, ai, institutions, institutionsRequiringMfa, smsOn, whatsappOn] = await Promise.all([
    getPolicy(true), aiOverview(),
    db.college.count({ where: { isActive: true } }), db.collegeSettings.count({ where: { requireMfaForAdmins: true, college: { isActive: true } } }),
    db.collegeSettings.count({ where: { smsEnabled: true } }), db.collegeSettings.count({ where: { whatsappEnabled: true } }),
  ]);
  const groups = buildConfig({
    env: process.env, policy,
    ai: { globalEnabled: ai.global.enabled, globalReason: ai.global.reason, purposes: ai.purposes.map((p) => ({ purpose: p.purpose, provider: p.effective?.provider ?? p.supportedProvider, model: p.effective?.model ?? p.default.model, enabled: p.effective?.enabled ?? true, keyConfigured: !!p.effective?.configured, source: p.effective?.source.key ?? "default" })) },
    counts: { institutions, institutionsRequiringMfa, smsOn, whatsappOn },
  });
  return { generatedAt: new Date().toISOString(), readOnly: true, groups };
}

// Unit tests: the read-only system configuration and the integration status mapping. No network, no database, no provider.
import { buildConfig, type ConfigInput } from "../../lib/platformConfig";
import { buildIntegrations } from "../../lib/platformIntegrations";
import type { Component } from "../../lib/health";
import type { AiHealthCfg } from "../../lib/aiHealth";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };

// ---------- system configuration: allow-list, no secret can appear ----------
const SECRETS: Record<string, string> = {
  DATABASE_URL: "postgresql://postgres:SENTINEL-DB-PASS@db.example.com:6543/postgres", DIRECT_URL: "postgresql://postgres:SENTINEL-DIRECT@db.example.com:5432/postgres",
  SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "SENTINEL-SERVICE-ROLE-KEY-0123456789", SUPABASE_ANON_KEY: "SENTINEL-ANON-KEY-0123456789",
  SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_USER: "SENTINEL-SMTP-USER", SMTP_PASS: "SENTINEL-SMTP-PASS", SMTP_FROM: "noreply@example.com",
  TWILIO_ACCOUNT_SID: "SENTINEL-TWILIO-SID", TWILIO_AUTH_TOKEN: "SENTINEL-TWILIO-TOKEN", TWILIO_SMS_FROM: "+10000000000",
  GROQ_API_KEY: "gsk_SENTINEL-GROQ-KEY", ANTHROPIC_API_KEY: "sk-ant-SENTINEL-ANTHROPIC", GITHUB_TOKEN: "ghp_SENTINEL-GITHUB",
  CRON_SECRET: "SENTINEL-CRON-SECRET-0123456789", AI_MASTER_KEY_V1: "SENTINEL-MASTER-KEY", APP_URL: "https://placement.example.com/path?token=SENTINEL-QUERY", CORS_ORIGINS: "https://a.example.com,https://b.example.com",
  NODE_ENV: "production", FLOOD_MAX_PER_MINUTE: "900",
};
const input: ConfigInput = {
  env: SECRETS as unknown as NodeJS.ProcessEnv,
  policy: { requireAdminMfa: true, days: { jobRun: 90, monitorEvent: 7, aiUsage: 120 }, stored: { jobRun: null, monitorEvent: 7, aiUsage: 120 } },
  ai: { globalEnabled: true, globalReason: null, purposes: [{ purpose: "TEXT", provider: "GROQ", model: "m", enabled: true, keyConfigured: true, source: "environment" }, { purpose: "INTERVIEW", provider: "ANTHROPIC", model: "c", enabled: false, keyConfigured: false, source: "database" }] },
  counts: { institutions: 4, institutionsRequiringMfa: 1, smsOn: 0, whatsappOn: 2 },
};
const groups = buildConfig(input); const out = JSON.stringify(groups);
t("SECRETS: no secret value from the environment appears anywhere in the screen", !/SENTINEL/.test(out), out.match(/.{20}SENTINEL.{20}/)?.[0] ?? "");
t("SECRETS: no connection string, user name or query string leaks (host only for addresses)", !out.includes("postgres") && !out.includes("SENTINEL-QUERY") && !out.includes("?token") && out.includes("placement.example.com") && !out.includes("/path"));
t("secrets are shown only as configured yes / no", groups.flatMap((g) => g.items).filter((i) => /configured|keys present|token/i.test(i.label)).every((i) => typeof i.value === "boolean"));
t("every item has a source of environment, database, default or code", groups.flatMap((g) => g.items).every((i) => ["environment", "database", "default", "code"].includes(i.source)));
t("retention shows the effective days and whether each is a platform setting or the default", (() => { const r = groups.find((g) => g.key === "retention")!.items; return r.find((x) => x.key === "retention.jobRun")!.source === "default" && r.find((x) => x.key === "retention.monitorEvent")!.source === "database" && r.find((x) => x.key === "retention.aiUsage")!.value === "120 days"; })());
t("the minimum MFA rule and the platform admin MFA are described, with the institution count", (() => { const s = groups.find((g) => g.key === "security")!.items; return s.find((x) => x.key === "platformMfa")!.value === "required" && String(s.find((x) => x.key === "adminMfaMinimum")!.value).includes("required") && String(s.find((x) => x.key === "adminMfaMinimum")!.note).includes("1 of 4"); })());
t("SMS and WhatsApp are shown as on hold", groups.find((g) => g.key === "channels")!.items.find((x) => x.key === "channelsStatus")!.value === "on hold");
t("the flood guard value and its source come from the environment when set, otherwise the default", groups.flatMap((g) => g.items).find((i) => i.key === "flood")!.value === 900 && buildConfig({ ...input, env: {} as NodeJS.ProcessEnv }).flatMap((g) => g.items).find((i) => i.key === "flood")!.source === "default");
t("an empty environment produces a screen without errors and without invented values", buildConfig({ ...input, env: {} as NodeJS.ProcessEnv }).flatMap((g) => g.items).find((i) => i.key === "appHost")!.value === null);
t("every group has at least one item and keys are unique", groups.every((g) => g.items.length > 0) && new Set(groups.flatMap((g) => g.items.map((i) => i.key))).size === groups.flatMap((g) => g.items).length);

// ---------- integration states ----------
const comp = (key: string, status: Component["status"], summary = "x", latencyMs: number | null = 10): Component => ({ key, label: key, status, checkedAt: "now", summary, evidence: ["e"], latencyMs });
const cfg = (over: Partial<AiHealthCfg> = {}): AiHealthCfg => ({
  purposes: [
    { purpose: "TEXT", provider: "GROQ", model: "m1", enabled: true, disabledBy: null, configured: true, source: "environment", keyLast4: "ABCD", stale: false, error: null },
    { purpose: "VISION", provider: "GROQ", model: "m2", enabled: true, disabledBy: null, configured: true, source: "environment", keyLast4: "ABCD", stale: false, error: null },
    { purpose: "INTERVIEW", provider: "ANTHROPIC", model: "c1", enabled: true, disabledBy: null, configured: true, source: "database", keyLast4: "WXYZ", stale: false, error: null },
  ],
  probes: { GROQ: { provider: "GROQ", ok: true, reason: "ok", ms: 90 }, ANTHROPIC: { provider: "ANTHROPIC", ok: true, reason: "ok", ms: 120 } },
  usage: { available: true, callsToday: 0, failuresToday: 0, blockedToday: 0, nearLimit: [] }, ...over,
});
const base = { env: { APP_URL: "https://x.example.com" } as unknown as NodeJS.ProcessEnv, components: [comp("email", "healthy"), comp("storage", "healthy")], ai: cfg(), checkedAt: "now", sms: { collegesOn: 0 }, whatsapp: { collegesOn: 0 } };
const get = (r: ReturnType<typeof buildIntegrations>, k: string) => r.find((x) => x.key === k)!;
const all = buildIntegrations(base);
t("the dashboard lists exactly the approved integrations: SMTP, SMS, WhatsApp, calendar, Groq, Anthropic, GitHub, Supabase Storage", all.map((x) => x.key).join() === "smtp,sms,whatsapp,calendar,groq,anthropic,github,storage");
t("healthy checks show healthy for email, storage, Groq and Anthropic", ["smtp", "storage", "groq", "anthropic"].every((k) => get(all, k).state === "healthy" && get(all, k).checked));
t("component statuses map: degraded is unhealthy, unavailable stays unavailable, not_configured is missing", get(buildIntegrations({ ...base, components: [comp("email", "degraded"), comp("storage", "unavailable")] }), "smtp").state === "unhealthy" && get(buildIntegrations({ ...base, components: [comp("email", "degraded"), comp("storage", "unavailable")] }), "storage").state === "unavailable" && get(buildIntegrations({ ...base, components: [comp("email", "not_configured"), comp("storage", "not_configured")] }), "smtp").state === "missing");
t("SMTP dry-run is shown as disabled, not healthy", get(buildIntegrations({ ...base, env: { ...base.env, SMTP_DRY_RUN: "true" } as unknown as NodeJS.ProcessEnv }), "smtp").state === "disabled");
t("a missing health component is shown as unavailable, never as healthy", get(buildIntegrations({ ...base, components: [] }), "smtp").state === "unavailable" && get(buildIntegrations({ ...base, components: [] }), "storage").state === "unavailable");
t("SMS and WhatsApp are always disabled and on hold, with no health claim", ["sms", "whatsapp"].every((k) => get(all, k).state === "disabled" && get(all, k).onHold === true && !get(all, k).checked));
t("with provider keys present and an institution switched on, the dashboard states the hold is enforced by the server (no warning that sending is possible)", (() => { const r = buildIntegrations({ ...base, env: { TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b", TWILIO_SMS_FROM: "+1" } as unknown as NodeJS.ProcessEnv, sms: { collegesOn: 2 } }); return get(r, "sms").state === "disabled" && get(r, "sms").details.some((d) => /enforced in the server/.test(d)) && !get(r, "sms").details.some((d) => d.startsWith("WARNING")) && !get(r, "whatsapp").details.some((d) => d.startsWith("WARNING")); })());
t("Groq: a refused key is unhealthy, a timeout or outage is unavailable, a rate limit is unhealthy", (() => { const g = (reason: "unauthorized" | "timeout" | "unavailable" | "rate_limited") => get(buildIntegrations({ ...base, ai: cfg({ probes: { GROQ: { provider: "GROQ", ok: false, reason, ms: 5 } } }) }), "groq").state; return g("unauthorized") === "unhealthy" && g("timeout") === "unavailable" && g("unavailable") === "unavailable" && g("rate_limited") === "unhealthy"; })());
t("Groq and Anthropic: no key is missing; all purposes off is disabled; a key that cannot be read is unhealthy", (() => {
  const noKey = cfg({ purposes: cfg().purposes.map((p) => ({ ...p, configured: false })) });
  const off = cfg({ purposes: cfg().purposes.map((p) => ({ ...p, enabled: false, disabledBy: "global" as const })) });
  const bad = cfg({ purposes: cfg().purposes.map((p) => (p.provider === "GROQ" ? { ...p, error: "AI_KEY_UNREADABLE" } : p)) });
  return get(buildIntegrations({ ...base, ai: noKey }), "groq").state === "missing" && get(buildIntegrations({ ...base, ai: noKey }), "anthropic").state === "missing" && get(buildIntegrations({ ...base, ai: off }), "groq").state === "disabled" && get(buildIntegrations({ ...base, ai: bad }), "groq").state === "unhealthy" && get(buildIntegrations({ ...base, ai: bad }), "anthropic").state === "healthy";
})());
t("a configured provider that was not probed is 'configured', not healthy; an unreadable AI configuration is unavailable", get(buildIntegrations({ ...base, ai: cfg({ probes: {} }) }), "groq").state === "configured" && get(buildIntegrations({ ...base, ai: null }), "groq").state === "unavailable");
t("calendar and GitHub have no health check and are never shown as healthy: configured or missing only", get(all, "calendar").state === "configured" && get(buildIntegrations({ ...base, env: {} as NodeJS.ProcessEnv }), "calendar").state === "missing" && get(all, "github").state === "missing" && get(buildIntegrations({ ...base, env: { GITHUB_TOKEN: "ghp_SENTINEL" } as unknown as NodeJS.ProcessEnv }), "github").state === "configured");
t("SECRETS: the dashboard never contains a key, a token or the last characters of a key", (() => { const o = JSON.stringify(buildIntegrations({ ...base, env: { GITHUB_TOKEN: "ghp_SENTINEL", TWILIO_ACCOUNT_SID: "SENTINEL-SID", TWILIO_AUTH_TOKEN: "SENTINEL-TOK", SMTP_DRY_RUN: "false" } as unknown as NodeJS.ProcessEnv })); return !/SENTINEL|ABCD|WXYZ/.test(o); })());
process.exit(fails ? 1 : 0);

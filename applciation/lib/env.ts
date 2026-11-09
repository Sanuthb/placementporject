import { z } from "zod";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const opt = <T extends z.ZodType>(s: T) => z.preprocess(blank, s.optional());

const schema = z.object({
  DATABASE_URL: z.string().min(10, "DATABASE_URL is required"),
  DIRECT_URL: opt(z.string()),
  SUPABASE_URL: z.url("SUPABASE_URL must be a URL"),
  SUPABASE_ANON_KEY: z.string().min(20, "SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "SUPABASE_SERVICE_ROLE_KEY is required"),
  APP_URL: opt(z.url()),
  CORS_ORIGINS: opt(z.string()),
  CRON_SECRET: opt(z.string().min(24, "CRON_SECRET must be at least 24 characters")),
  SMTP_HOST: opt(z.string()), SMTP_PORT: opt(z.string()), SMTP_USER: opt(z.string()), SMTP_PASS: opt(z.string()), SMTP_FROM: opt(z.string()),
  SMTP_DRY_RUN: opt(z.enum(["true", "false"])),
  ANTHROPIC_API_KEY: opt(z.string()),
  GROQ_API_KEY: opt(z.string()),
  GROQ_MODEL: opt(z.string()),
  DB_POOL_MAX: opt(z.string().regex(/^\d+$/)),
});

/** Checks configuration once at startup. Returns hard errors (the server should not start) and warnings (it can, but something is probably wrong). */
export function checkEnv(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  const errors = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const warnings: string[] = [];
  const prod = env.NODE_ENV === "production";
  if (env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY === env.SUPABASE_ANON_KEY) errors.push("SUPABASE_SERVICE_ROLE_KEY is the same as SUPABASE_ANON_KEY; use the service role key");
  if (prod) {
    if (!env.CRON_SECRET) warnings.push("CRON_SECRET is not set: scheduled jobs (block evaluation, reports, CRM reminders) cannot be triggered by a scheduler");
    if (env.SMTP_DRY_RUN === "true") warnings.push("SMTP_DRY_RUN=true: emails are built but NOT sent");
    else if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) warnings.push("SMTP is not configured: email features will return 503");
    if (!env.CORS_ORIGINS) warnings.push("CORS_ORIGINS is not set: browsers on other origins (your frontend) will be blocked");
    if (!env.APP_URL) warnings.push("APP_URL is not set: invitation emails will not link back to your app");
    if (!/pgbouncer=true|:6543/.test(env.DATABASE_URL ?? "")) warnings.push("DATABASE_URL does not look like a pooled connection; serverless deployments should use the pooler (port 6543, pgbouncer=true)");
  }
  return { errors, warnings };
}

# Production checklist

Work top to bottom. Items marked **(blocking)** should not be skipped.

## Before the first deploy
- [ ] **(blocking)** A *separate* Supabase project for production. Never reuse the one the end-to-end tests run against.
- [ ] **(blocking)** Environment variables set on the host (see `.env.example`). The server refuses to start in production if any required one is missing; read its startup warnings too.
  - `DATABASE_URL` is the **pooled** connection (port 6543, `pgbouncer=true`); `DIRECT_URL` is the session connection (5432) used only for migrations.
  - `CRON_SECRET` is a long random string. `CORS_ORIGINS` lists your frontend origin(s). `APP_URL` is the frontend URL.
  - `SMTP_DRY_RUN` is `false`. Do **not** set `RATE_LIMIT_DISABLED`.
- [ ] **(blocking)** `npx prisma migrate deploy` run against the production database.
- [ ] **(blocking)** `npm run check:exposure` prints OK against production.
- [ ] Create the real first admin with `npm run db:seed` using your own college name and a strong password; then delete `.env.seed` and any demo data.
- [ ] Supabase *Authentication → SMTP Settings* configured with the same sender as `SMTP_*` (invites depend on it).
- [ ] Supabase *Authentication → URL configuration*: site URL and redirect URLs point at the frontend (`/auth/accept-invite`).
- [ ] Supabase Auth: require email confirmation, set a minimum password length, enable leaked-password protection, and review the JWT expiry.
- [ ] Storage buckets exist and are **private**: `student-documents`, `drive-documents`, `offer-letters` (the seed creates them).

## Deploy
- [ ] Release step runs migrations **before** the new code receives traffic.
- [ ] Smoke test: `GET /api/health` is 200; sign in as the admin; `GET /api/me` lists the modules.
- [ ] Scheduler configured for the five job endpoints listed in the README (`vercel.json` does this on Vercel). Trigger each once by hand and check for a 200.
- [ ] Send a real test email (a report schedule, or an announcement to yourself) and confirm it arrives.

## Soon after
- [ ] Uptime monitor on `/api/health`. Alert on 5xx rate. Ship the JSON logs somewhere searchable.
- [ ] Turn on Supabase backups / point-in-time recovery, and do one restore drill.
- [ ] Put a CDN / WAF in front (Cloudflare, Vercel Firewall...) for DDoS protection; the app's own limits are a second line.
- [ ] If you sit behind a proxy, confirm it sets `X-Forwarded-For` honestly (per-IP limits rely on it) and strips client-supplied values.
- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` if they were ever pasted anywhere (chat, tickets, screenshots).
- [ ] After every future migration: `npm run check:exposure`; for new tables also `npm run db:harden`.

## Ongoing
- Review the audit log (`GET /api/audit-logs`) and psychometric access log (`GET /api/psychometrics/access-log`) periodically.
- Watch Gmail's daily send limit if you run large announcements; consider a transactional email provider (SES, Postmark, Resend) for volume. The mailer is in `lib/mailer.ts`.

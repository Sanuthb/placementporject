# Placement platform: backend API

REST API for a college placement cell: student onboarding and verification, companies and drives, rounds and offers, attendance and blocking, analytics and reports, a student app API, and add-on modules (assessments, employer CRM, internships, events, learning programmes, student preparation, recruiter portal, talent showcase).

**Stack:** Next.js 16 route handlers · TypeScript · Prisma 7 · Supabase (Postgres, Auth, Storage) · Zod · Nodemailer.
**The web app lives in the same project:** `/staff`, `/student` and `/recruiter` (Next.js pages built only from shadcn/ui components; `/design` shows them all). Every API endpoint is listed in [`docs/ROUTES.md`](docs/ROUTES.md) (generated from the code).

## Quick start

You need Node 24+, a Supabase project, and (for email) a Gmail address with an app password.

```bash
npm install
cp .env.example .env                 # fill in the Supabase values (see the file's comments)
npx prisma migrate deploy            # creates the tables and locks the public REST API
npm run check:exposure               # must print "OK: the public anon key reaches no tables."

# create the first college, enable every module, create the first admin who can sign in
SEED_COLLEGE_NAME="Your College" SEED_ADMIN_EMAIL="admin@yourcollege.edu" \
SEED_ADMIN_NAME="Your Name" SEED_ADMIN_PASSWORD="a-long-password" npm run db:seed

npm run dev                          # http://localhost:3000 (sign in at /login)
curl localhost:3000/api/health       # {"ok":true,"db":"up",...}
```

Sign in through Supabase Auth to get an access token, then call the API with `Authorization: Bearer <token>`. `GET /api/me` shows who you are and which modules are on.

## How it fits together

| Concept | How it works |
|---|---|
| **Three kinds of login** | Staff (`/api/...`), students (`/api/student/...`), recruiters (`/api/recruiter/...`). All use Supabase Auth; each maps the login to a row in its own table. A token for one kind is refused by the others. |
| **Tenancy** | Every table carries `collegeId`, and every query filters on it. One deployment serves many colleges. |
| **Roles** | `TPO_ADMIN` (everything), `PLACEMENT_OFFICER`, `DEPARTMENT_COORDINATOR` (only their own department's students). |
| **Modules** | Paid modules are switched per college (`CollegeModule`). A route declares the module it needs and is refused with 403 if the college has not bought it. Core features (dashboard, settings, communication) are always on. |
| **Route wrappers** | `route()`, `studentRoute()`, `recruiterRoute()` in `lib/api/` handle authentication, role, module, rate limit, and consistent JSON errors. A new endpoint is one file under `app/api/` using one of them. |
| **Shared operations** | Anything staff and students both do (apply, accept an offer, check in, raise a ticket) lives in `lib/ops/` and `lib/*.ts`, so both sides run the same rules. |
| **Verified data** | Student data is never silently overwritten: edits to a verified section wait as a pending revision until staff approve them. |
| **Approvals** | A college can require sign-off for offers, bulk emails, bulk status changes and eligibility exceptions (`/api/settings/policies`). Gated calls return `202` and run only when an approver approves. |
| **Audit** | Every change to student data, offers, blocks, settings and approvals is written to `AuditLog` in the same transaction. |
| **Privacy** | Personality/aptitude results live in separate tables, are never read by eligibility or blocking, are cohort-only for staff (groups under 5 hidden), and individual access is logged with a stated reason. |
| **Files** | Private Supabase Storage buckets (`student-documents`, `drive-documents`, `offer-letters`); downloads use 10-minute signed links. |

## Security

- **Database not exposed.** Supabase publishes every `public` table through its REST API to anyone with the anon key. Migration `lock_down_public_api` turns on row-level security and revokes the public roles' privileges; the API server connects as a privileged role and is unaffected. **Run `npm run check:exposure` after every migration.** If you add tables, `npm run db:harden` re-applies the lock (new migrations should include `prisma/harden.sql`).
- **Rate limiting.** Database-backed counters (shared by all instances) on email sending, uploads, exports, invites, and student actions that create records; per-IP on the public showcase links. A coarse in-memory per-IP flood guard sits in `proxy.ts`. 429 responses include `Retry-After`.
- **Headers and CORS.** `proxy.ts` adds security headers and a request id to every API response, and answers CORS only for origins in `CORS_ORIGINS` (any `localhost` in development).
- **Request size.** JSON bodies are capped at 1 MB and uploads are refused from their `Content-Length` before being buffered (413).
- **Secrets.** `SUPABASE_SERVICE_ROLE_KEY` is server-only. Startup refuses to boot in production with missing or inconsistent configuration (`lib/env.ts`).
- **Tokens** are checked with Supabase and cached for 60 seconds per instance; the user's active state, role and modules are re-read from the database on every request, so deactivation is immediate.
- **Not covered:** DDoS protection and WAF (use your host/CDN), per-account login throttling (Supabase Auth provides it), malware scanning of uploads.

## Scheduled jobs

Three endpoints must be called on a schedule with `Authorization: Bearer $CRON_SECRET`:

| Endpoint | What it does | Suggested |
|---|---|---|
| `/api/blocking/evaluate` | Applies missed-drive block policies and expires old blocks | daily |
| `/api/reports/schedules/run` | Emails scheduled reports that are due | daily |
| `/api/crm/follow-ups/run` | Reminds prospect owners of due follow-ups | daily |

`vercel.json` already declares these for **Vercel Cron** (which sends GET with the secret). Elsewhere use any scheduler (`curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://api.example.edu/api/blocking/evaluate`). Admins can also trigger the same jobs by hand for their own college.

## Email

Set the `SMTP_*` variables. For Gmail, turn on 2-Step Verification and create an **app password**. `SMTP_DRY_RUN=true` builds messages without sending. Gmail caps a normal account at roughly 500 messages a day; each send is limited to 500 recipients.

**Invitations to staff, students and recruiters are sent by Supabase Auth, not by this app's SMTP.** Supabase's built-in mailer is heavily rate-limited, so in the Supabase dashboard go to *Authentication → SMTP Settings* and enter the same Gmail details, or invites will fail after a handful.

## Testing

```bash
npm run typecheck && npx eslint app lib prisma scripts tests proxy.ts instrumentation.ts
npm run test:unit                    # pure logic, no database
E2E_ALLOW=1 npm run test:e2e         # ~900 checks against a real database; starts its own servers
```

The end-to-end suites **create and delete data**. Point `.env` at a throwaway Supabase project, never production; `E2E_ALLOW=1` is a deliberate speed bump. They need `.env.seed` (the demo admin's credentials). One of them (`09-security`) verifies headers, CORS, size limits, rate limits, cron auth, and that the public key reaches no tables.

## Deploying

See [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md). In short: set the environment variables on the host, run `npx prisma migrate deploy` against `DIRECT_URL` as a release step, run `npm run check:exposure`, deploy, and point a scheduler at the three job endpoints. A GitHub Actions workflow is included.

## Operating it

- **Logs** are one JSON object per line (`level`, `requestId`, `path`, `message`). Every error response carries the same `requestId`, so a user report maps to a log line.
- **Health:** `GET /api/health` returns 200 with `db: "up"`, or 503 if the database is unreachable. Use it for load balancer and uptime checks.
- **Backups:** use Supabase's daily backups (and point-in-time recovery on paid plans). There is no in-app export or restore.
- **Data retention:** nothing is deleted automatically except expired rate-limit counters. Retention/deletion settings are not implemented.

## Not built (decided)

SMS, WhatsApp and push notifications · SSO and multi-factor login for staff · ERP integration · multi-campus under one college · in-app backup and restore · AI mock interviews (needs a decision about sending students' answers to an external AI service).

## Known limitations

- PDFs (resumes, reports) use built-in fonts, so non-Latin characters print as `?`.
- Student profile sections other than Academics accept free-form JSON until the student-facing form design fixes their shape (skills are read as `{ "skills": [...] }`, semesters as `{ semester, sgpa, subjects: [{ name, score }] }`).
- Empty-array filters on `uuid[]` columns return nothing with this Prisma driver, so audience matching for announcements, events, and assessments is done in code.
- Rate limiting is fixed-window, so a burst straddling a window boundary can briefly reach twice the limit.

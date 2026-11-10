# System health and monitoring (System Administrator)

Page `/platform/monitoring`. APIs: `GET /api/platform/monitoring` (health, optional `?refresh=1`), `GET /api/platform/monitoring/errors` (recent server errors, paged),
and two unauthenticated probes, `GET /api/health/live` and `GET /api/health/ready` (the existing `GET /api/health` is unchanged).
Platform administrators with the second step only (`platformRoute`); read-only (other methods return 405); responses are not cacheable.
Code: `lib/health.ts` (checks, classification, throttling), `lib/monitorStore.ts` (in-memory errors and AI tally, scrubbing), `lib/cronMeta.ts` (job registry), `lib/monitorQuery.ts`.
**No database change.** No external monitoring service, no new dependency.

## What a status means (and the evidence behind it)
| Status | Meaning |
|---|---|
| **Healthy** | A live, bounded check ran just now and succeeded within its limits. Never inferred from "the page loaded". |
| **Degraded** | The check worked but something is wrong or slow (stated in the evidence). |
| **Unavailable** | The check ran and failed, was refused, or got no answer within its limit. |
| **Unknown** | There is no reliable evidence either way. Used for scheduled jobs (no run history exists). |
| **Not configured** | The integration is not set up, or is deliberately in dry-run. **Never shown as healthy.** The provider is not contacted. |

Overall = the worst **core** component (application, database, storage). A non-core component (AI, email, scheduled jobs, background jobs, errors) that is degraded or unavailable makes the platform **degraded**, never unavailable. Unknown / not configured components are counted and listed, and a core component that is unknown or not configured stops the platform being "healthy".

## Components, checks and thresholds
| Component | Check (live, bounded, read-only) | Healthy | Degraded | Unavailable | Other |
|---|---|---|---|---|---|
| Application | Reads build id (`.next/BUILD_ID`), mode, node version, uptime, commit (if provided) and the existing configuration check (`lib/env.ts`) | valid configuration | configuration warnings or errors | n/a (it is answering) | Evidence says it proves **liveness only** |
| Database | `select 1`, limit 2 s | answers under 500 ms | answers, 500 ms or more | error or no answer in 2 s | |
| File storage | Lists Supabase buckets with the service key (no file read, written or linked), limit 3 s | answers under 1.5 s and `student-documents` exists | slow, or a required bucket is missing | error or no answer in 3 s | not configured when `SUPABASE_URL`/service key missing |
| AI provider | One authenticated `GET {GROQ_API_BASE}/models` (no tokens used), limit 4 s; plus this instance's tally of real calls | HTTP 2xx under 3 s | 429, other 4xx, slow, or most recent real calls failed | 401/403 (key refused), 5xx, error or no answer | not configured without `GROQ_API_KEY`; the provider is not contacted |
| Email (SMTP) | A connection and login (`transport.verify`), **no message is sent**, limit 4 s; plus 24 h delivery history from `InvitationEmailLog` and `MessageLog` | verified under 2 s | slow, or at least half of 3+ deliveries in 24 h failed | error, login refused, or no answer | not configured without SMTP settings **or when `SMTP_DRY_RUN=true`** |
| Scheduled jobs | Registry from `vercel.json` with each job's schedule and next due time | | | | **unknown** when a secret exists (no history), not configured without `CRON_SECRET` |
| Background jobs | Counts of bulk student imports (`ImportJob`): awaiting confirmation, processing, completed in 7 days, **stuck** (processing over 15 minutes) | none stuck | one or more stuck | | The application has **no general job queue**: no retry counts or worker states exist and none are invented |
| Server errors | This server instance's memory of 5xx and service failures | none in 15 minutes | 1-19 in 15 minutes | 20 or more in 15 minutes | |

A single check reflects the latest single probe: one missed answer shows "Unavailable" until the next refresh.

## Health-check design
- **Liveness** `/api/health/live`: the process answers; touches nothing. **Readiness** `/api/health/ready`: database answers within 2 s; one query at most every 5 s, answer cached; returns only `{"status":"ready"|"unavailable"}` (200 / 503). Nothing about configuration, versions or hosts is returned to an unauthenticated caller. The existing `/api/health` is unchanged.
- **Detailed health** (authenticated): all checks run in parallel, each with its own limit (2 / 3 / 4 / 4 s), so one hung dependency cannot delay the others or the response beyond about 4 s. A failing check becomes that component's status; the request never errors because a dependency is down.
- **Load protection:** at most one round of checks runs at a time; the result is shared for 15 s; `refresh=1` is honoured at most once every 5 s (faster requests get the current result with `throttled: true`). Measured: 30 simultaneous forced refreshes cause one AI probe and one SMTP connection.

## Data sources and history
| Evidence | Source | Durable? |
|---|---|---|
| Live dependency state | live probes | no history; latest check only |
| Email deliveries and failures, last success | `InvitationEmailLog`, `MessageLog` (existing) | yes |
| Bulk import states | `ImportJob` (existing) | yes |
| Registered scheduled jobs | `vercel.json` | n/a |
| Recent server errors (request id, endpoint, status, scrubbed message) | in-process ring (500 newest) fed by the shared error handler and the unhandled-error hook | **no**: per server instance, lost on restart, not shared between instances |
| AI call outcomes and latency (outcome and time only) | in-process tally of the last 200 calls | **no**, same scope |

On a serverless deployment each instance has its own memory, so error and AI figures describe only the instance that answered; the page says so.

## Scheduled jobs do not record history (finding)
The five jobs (`/api/blocking/evaluate`, `/api/reports/schedules/run`, `/api/crm/follow-ups/run`, `/api/notifications/round-reminders/run`, `/api/notifications/reminders/run`) return their result to the scheduler and write nothing. There is no last run, last success, last failure or duration anywhere, so the dashboard shows **Unknown** and "Not recorded", never a guess.

### Proposal (NOT applied; needs your approval)
Smallest safe instrumentation: a wrapper `withJobRun(name, fn)` around the scheduler branch of the five routes (about three lines each) writing one row per run. Two additive tables, no foreign keys, no change to any existing table:
```prisma
model JobRun {            // ~51 rows/day with today's five jobs (2 hourly + 3 daily)
  id         String    @id @default(uuid()) @db.Uuid
  job        String                      // route path
  trigger    String                      // "scheduler" | "admin"
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  ok         Boolean?
  durationMs Int?
  summary    Json?                       // counts only, e.g. { colleges, reminded }
  error      String?                     // scrubbed, at most 300 characters
  @@index([job, startedAt])
}
model MonitorEvent {      // durable replacement for the in-memory error ring; written only for 5xx and service failures, capped at ~2000 a day
  id        String   @id @default(uuid()) @db.Uuid
  at        DateTime @default(now())
  service   String
  status    Int?
  code      String
  method    String?
  path      String?                      // ids and link tokens replaced
  requestId String?
  message   String                       // scrubbed
  @@index([at])
  @@index([service, at])
}
```
Retention: delete `JobRun` older than 90 days and `MonitorEvent` older than 14 days from the existing hourly job. Migration compatibility: two `CREATE TABLE` statements with indexes; nothing is altered or backfilled; safe with `prisma migrate deploy`; reversible by dropping the two tables. With it the dashboard could show last run / success / failure / duration per job and errors across restarts and instances.

## Limitations and unmonitored areas
- Scheduled-job history and durable error history do not exist (above). SA-TC-055 therefore fails until the proposal is approved.
- **A database outage cannot be shown on the dashboard**: authenticating the platform administrator needs the database, so the page shows "could not load". `/api/health/ready` (unauthenticated) and your platform's uptime monitor are what report it.
- The application does not measure its own request latency or throughput, so there is no application-performance chart (SA-TC-008 is recorded as failing for that reason).
- Storage upload/download failures are not tracked (only bucket availability is probed). Email failures come from the delivery logs, not from the SMTP server.
- SMS and WhatsApp (on hold) are not monitored. No backups, disk, memory or CPU, TLS certificate expiry, DNS, or third-party status pages are monitored.
- The `GROQ_API_BASE` environment variable (default: the real Groq endpoint) exists so tests can point the AI client and the health probe at a local mock.

## Tests
`tests/unit/monitoring.test.mts` (classification, roll-up, scrubbing, bounded memory, cron next-run, timeouts, throttling, `runChecks` with mocks), `tests/gate3/g3-08-monitoring.mjs` (own app instance behind controllable proxies and mocks for database, storage, SMTP and AI; no real service is disturbed and no email is sent), `tests/web/platform-monitoring.spec.ts` (Chrome). Measured timings: `tests/gate3/results/g3-08-timings.json`.

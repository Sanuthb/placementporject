# System health and monitoring (System Administrator)

Page `/platform/monitoring`. APIs: `GET /api/platform/monitoring` (health, optional `?refresh=1`), `GET /api/platform/monitoring/errors` (server errors, paged),
`GET /api/platform/monitoring/jobs` (scheduled-job run history, paged), and two unauthenticated probes, `GET /api/health/live` and `GET /api/health/ready` (the existing `GET /api/health` is unchanged).
Platform administrators with the second step only (`platformRoute`); read-only (other methods return 405); responses are not cacheable.
Code: `lib/health.ts` (checks, classification, throttling), `lib/jobRun.ts` (records scheduled-job runs), `lib/jobHistory.ts` (reads them, judges each job), `lib/monitorStore.ts` (scrubbing, the in-memory AI tally and
error ring, the bounded durable-error writer), `lib/monitorEvents.ts` (reads the durable errors), `lib/monitorRetention.ts` (retention), `lib/dbErrors.ts` (recognises a database outage), `lib/cronMeta.ts` (job registry and cron slots), `lib/monitorQuery.ts`.
**Database change (Gate 4 Phase 4.3 closing, migration `20261116090000_monitoring_history`):** two additive tables, `JobRun` and `MonitorEvent`, no foreign keys, nothing altered or backfilled (details below). No external monitoring service, no new dependency.

## What a status means (and the evidence behind it)
| Status | Meaning |
|---|---|
| **Healthy** | A live, bounded check ran just now and succeeded within its limits. Never inferred from "the page loaded". |
| **Degraded** | The check worked but something is wrong or slow (stated in the evidence). |
| **Unavailable** | The check ran and failed, was refused, or got no answer within its limit. |
| **Unknown** | There is no reliable evidence either way: a scheduled job that has no recorded run yet, or run history that could not be read. |
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
| Scheduled jobs | Registry from `vercel.json` plus each job's **recorded runs** (`JobRun`): last run, last success, last failure, duration, attempts. Each job is judged: succeeded, failed, running, interrupted (started, never finished, over 15 minutes), overdue (its latest slot did not run within a grace of a quarter of its interval, 15 to 60 minutes), or no run recorded | every job's latest run succeeded | at least one failed, overdue or interrupted | every job failed, was interrupted or is overdue | **unknown** when some job has no recorded run yet, or the history cannot be read; not configured without `CRON_SECRET` |
| Background jobs | Counts of bulk student imports (`ImportJob`): awaiting confirmation, processing, completed in 7 days, **stuck** (processing over 15 minutes) | none stuck | one or more stuck | | The application has **no general job queue**: no retry counts or worker states exist and none are invented |
| Server errors | The durable error record (`MonitorEvent`: all server instances, 14 days); falls back to this instance's memory only if the record cannot be read, and says so | none in 15 minutes | 1-19 in 15 minutes | 20 or more in 15 minutes | |

A single check reflects the latest single probe: one missed answer shows "Unavailable" until the next refresh.

## Health-check design
- **Liveness** `/api/health/live`: the process answers; touches nothing. **Readiness** `/api/health/ready`: database answers within 2 s; one query at most every 5 s, answer cached; returns only `{"status":"ready"|"unavailable"}` (200 / 503). Nothing about configuration, versions or hosts is returned to an unauthenticated caller. The existing `/api/health` is unchanged.
- **Detailed health** (authenticated): all checks run in parallel, each with its own limit (2 / 3 / 4 / 4 s), so one hung dependency cannot delay the others or the response beyond about 4 s. A failing check becomes that component's status; the request never errors because a dependency is down.
- **Load protection:** at most one round of checks runs at a time; the result is shared for 15 s; `refresh=1` is honoured at most once every 5 s (faster requests get the current result with `throttled: true`). Measured: 30 simultaneous forced refreshes cause one AI probe and one SMTP connection.

## Database outage behaviour (decision B)
The platform administrator is authenticated against the database (`PlatformAdmin`) and the second step is read fresh from Auth, so **when the database is down the dashboard cannot confirm who is asking. There is deliberately no fallback:** no cached identity, no "assume signed in", no relaxed second step. The security model and MFA enforcement are unchanged.
- `GET /api/health/live`: the process answers; touches no dependency. `GET /api/health/ready`: `200 {"status":"ready"}` or **`503 {"status":"unavailable"}`** from one `select 1` (limit 2 s, answer cached 5 s). It never returns credentials, configuration, hosts, versions or a database error.
- Any API route that needs the database answers **`503 DATABASE_UNAVAILABLE`** with `Retry-After: 5`, a fixed message and the request id: no host, port, driver text or query. (Detected in `lib/dbErrors.ts`; every other failure is still a generic 500.)
- The dashboard shows a clear **connection failure** ("Cannot reach the monitoring service") when it has nothing to show. If an earlier result is already on the page, it keeps it, dims it, marks it **stale** with the time of the last good check, and says the refresh failed and why. Recovery clears this by itself on the next refresh.
- Errors raised during an outage cannot be written while the database is down. They wait in a bounded in-memory queue (newest 200) and are written once the database answers again (tested: the 40-request burst and the failed job's own error were all in the durable list after recovery, within about 35 s; the first request after the database returned succeeded, and readiness returned to 200 in 4.8 s). A job that fails *because* the database is down cannot be recorded in `JobRun` (the history lives in that database); its error is in the durable error list afterwards.
- **Recommendation: monitor `GET /api/health/ready` from an external uptime monitor** (any service that can poll a URL every minute and alert on a non-200, for example UptimeRobot, Better Stack or the hosting platform's own checks), outside this application. A dashboard that depends on the failing database cannot be the outage alarm; the readiness endpoint is built to be that signal. Also alert on `/api/health/live` separately (process down) so the two failures are distinguishable.

## Data sources and history
| Evidence | Source | Durable? |
|---|---|---|
| Live dependency state | live probes | no history; latest check only |
| Email deliveries and failures, last success | `InvitationEmailLog`, `MessageLog` (existing) | yes |
| Bulk import states | `ImportJob` (existing) | yes |
| Registered scheduled jobs | `vercel.json` | n/a |
| **Scheduled-job runs** (start, end, outcome, duration, attempts, counts, sanitized failure) | **`JobRun`** | **yes, 90 days** |
| **Server errors** (request id, endpoint, status, scrubbed message) | **`MonitorEvent`**, written by the shared error handler and the unhandled-error hook; the in-memory ring (500 newest) is only the fallback | **yes, 14 days, shared by all instances** |
| AI call outcomes and latency (outcome and time only) | in-process tally of the last 200 calls | **no**: per server instance, lost on restart |

## Scheduled-job history and durable errors (implemented)

### Schema (migration `20261116090000_monitoring_history`, additive)
```prisma
model JobRun {            // one row per job per schedule slot
  id             String    @id @default(uuid()) @db.Uuid
  job            String                       // route path, e.g. /api/notifications/reminders/run
  trigger        String    @default("scheduler")
  slotAt         DateTime                     // the schedule slot (latest cron match, UTC), derived on the server
  startedAt      DateTime  @default(now())    // first attempt for the slot
  lastStartedAt  DateTime  @default(now())    // most recent attempt
  finishedAt     DateTime?                    // most recent attempt's end
  ok             Boolean?                     // outcome of the most recent finished attempt
  durationMs     Int?
  attempts       Int       @default(1)
  failedAttempts Int       @default(0)
  summary        Json?                        // numeric counts the job returned, nothing else
  error          String?                      // sanitized failure note, at most 300 characters
  @@unique([job, slotAt])                     // one row per slot: the duplicate guard, and the "latest run per job" index
  @@index([slotAt])                           // retention and recent-first reads
}
model MonitorEvent {      // a durable server error (5xx or service failure)
  id String @id @default(uuid()) @db.Uuid; at DateTime @default(now()); service String; status Int?; code String
  method String?; path String? /* ids and link tokens replaced */; requestId String?; message String /* scrubbed, one line */
  @@index([at]); @@index([service, at])
}
```
Both tables have row-level security enabled in the migration (matching `prisma/harden.sql`; the public key reaches nothing). **Rollback** is two statements and safe because nothing references the tables: `DROP TABLE "MonitorEvent"; DROP TABLE "JobRun"; DELETE FROM "_prisma_migrations" WHERE migration_name = '20261116090000_monitoring_history';` (verified on the local stack: other tables and their row counts are unchanged by apply or by rollback, and re-applying works). The code tolerates the tables being absent: runs and errors are simply not recorded, the dashboard says the history cannot be read, and the jobs and requests are unaffected.

### How a run is recorded (`lib/jobRun.ts`)
`withJobRun(path, work)` wraps the **scheduler branch** of the five job routes (a college administrator running a job by hand is not recorded). It runs `work` exactly as before and returns its result or rethrows its error unchanged.
- **No duplicates on retry:** the slot is the latest time the job's cron expression matched (computed on the server, never taken from the request), and `(job, slotAt)` is unique. The start is one atomic `INSERT ... ON CONFLICT DO UPDATE` that adds an attempt; the end is another that records the outcome (and creates the row if the start never landed). A scheduler retry, or ten simultaneous invocations of the same slot, leave **one row** with the right attempt count (tested: 12 simultaneous runs, +12 attempts, 1 row). Of several attempts the one that finished last decides `ok`/`error`; every failed attempt is still counted in `failedAttempts`.
- **Monitoring can never stop the job:** each write is time-limited (1 s) and any failure is logged (scrubbed) and ignored. If the monitoring table is missing, or each write hangs for 4 s, the job still runs and returns its normal result, delayed by at most the two write limits (tested). Jobs are not made to wait for, or to fail because of, monitoring.
- **Nothing sensitive is stored:** `summary` keeps only plain numeric counts under plain names. `error` for a database error is its class and code only (those messages can quote the query and the student values in it); for anything else it is the scrubbed first line (connection strings, tokens, keys, addresses, long opaque strings removed), long digit runs masked, at most 300 characters. The same rule applies to `MonitorEvent.message` for unexpected errors. Tested with a database error that quotes an address, phone number, name and JWT: none reaches either table or any response. Residual limit: a non-database error whose free text contains a person's name cannot be recognised generically; the jobs do not raise such messages today.
- **Durable errors are bounded:** `recordError` queues the (already scrubbed) event; a pump writes at most 30 a minute and 2,000 a day per instance, at most 3 at once, each time-limited, and pauses 30 s after a failed write. The queue keeps the newest 200 (older are dropped and counted), so a flood or a long outage cannot grow memory or load the database. The in-memory ring still receives every error.

### Retention (`lib/monitorRetention.ts`)
`JobRun` rows older than **90 days** and `MonitorEvent` rows older than **14 days** are deleted by `pruneMonitoring()`, called at the end of the hourly `/api/notifications/round-reminders/run` after that job's own result has been recorded (so a pruning problem never changes the job's outcome; it never throws). **Bounded:** each statement deletes at most 1,000 rows (`DELETE ... WHERE ctid = ANY(ARRAY(SELECT ctid ... ORDER BY <time> LIMIT 1000 FOR UPDATE SKIP LOCKED))`: an index scan then a TID delete, oldest first), at most 5 statements per table per call (5,000 rows), a 25 ms pause between statements and a 3 s overall budget. A backlog drains over successive hourly calls; overlapping cleanups skip each other's rows instead of blocking. At today's volume (about 51 `JobRun` rows a day, at most 2,000 `MonitorEvent` rows a day per instance) one call clears the daily excess. Tested: a 12,500-row backlog needs three calls; rows inside the window are never touched.

### Indexes (verified with `EXPLAIN`)
`JobRun(job, slotAt)` unique: duplicate guard and latest-run-per-job. `JobRun(slotAt)`: retention and recent-first listing. `MonitorEvent(at)`: retention, newest-first paging, count windows. `MonitorEvent(service, at)`: the service filter. With 20,000 `JobRun` and 30,000 `MonitorEvent` rows the planner uses these indexes for every query above; the full dashboard check reads at most four small bounded queries for jobs and four for errors.

### Deployment note
Apply with `npm run db:deploy` (then `npm run db:harden`, which is idempotent and re-asserts row-level security). **Do this before or with the code**: until the tables exist the app works but records nothing. This phase applied it only to the isolated local Docker database; the hosted database has not been touched.

## Limitations and unmonitored areas
- **A database outage cannot be shown by the dashboard** (it cannot authenticate anyone without the database, and no fallback is allowed). The readiness endpoint and an external uptime monitor are the outage signal; the dashboard shows a connection failure or a stale last-known state, never a fresh "healthy".
- A job that fails because the database is down cannot be recorded in `JobRun`. If the scheduler never calls a job at all, no run exists to show: that case is caught by the **overdue** rule (needs history that began before the missed slot; a brand-new deployment shows "no run yet" until the first slots pass).
- Only scheduler runs are recorded. A run is one row per slot, so the outcome shown is the latest finished attempt; earlier failed attempts of the same slot remain visible only as `failedAttempts`.
- Durable error writes are skipped for events beyond the per-minute/day caps and the 200-event queue (they remain in the in-memory ring). Events raised while the database is down are written after it returns, unless the instance restarts first.
- The AI tally is still per instance and not durable.
- **Application performance (SA-TC-008): agreed scope, Blocked.** The SRS says only "Monitor application performance" (3.1) and, in section 9, that common dashboard operations should normally respond within approximately 2 to 3 seconds under expected load; it defines no request-latency or throughput metric. **Agreed scope (2026-11-11):** application-wide request performance is observed with **Vercel Observability**, not with metrics built into this application: the intended deployment runs on Vercel and may use several independent function instances, so in-memory per-route metrics would be instance-local and lost on restart and could not give reliable platform-wide visibility. This dashboard covers health, dependencies, scheduled jobs and recorded errors, and **does not** show per-route latency or throughput. The only latency evidence kept here is the measured response time of the monitoring and health calls (`tests/gate3/results/g3-08-timings.json`, all under 65 ms in the local test). SA-TC-008 stays **Blocked** pending formal clarification or integration of performance monitoring, and is not marked passed.
- Storage upload/download failures are not tracked (only bucket availability is probed). Email failures come from the delivery logs, not from the SMTP server.
- SMS and WhatsApp (on hold) are not monitored. No backups, disk, memory or CPU, TLS certificate expiry, DNS, or third-party status pages are monitored.
- The `GROQ_API_BASE` environment variable (default: the real Groq endpoint) exists so tests can point the AI client and the health probe at a local mock.

## Tests
`tests/unit/monitoring.test.mts` (classification, roll-up, scrubbing, bounded memory, cron next-run, timeouts, throttling, `runChecks` with mocks), `tests/unit/jobhistory.test.mts` (cron slots, the job wrapper with failing and hanging stores, failure sanitization, job judging, the Scheduled jobs component, retention bounds, bounded durable error writes and their queue, outage detection and the 503 mapping), `tests/gate3/g3-08-monitoring.mjs` (own app instance behind controllable proxies and mocks for database, storage, SMTP and AI; real job runs recorded and read back from the isolated database, retries, 12-way concurrency, partial failure, monitoring table missing or hanging, retention of a 12,500-row backlog through the real hourly job, database outage and recovery with no authentication bypass, secret and personal-data sweeps over every stored row; no real service is disturbed and no email is sent), `tests/web/platform-monitoring.spec.ts` (Chrome, including the stale-state and connection-failure screens). Measured timings: `tests/gate3/results/g3-08-timings.json`.

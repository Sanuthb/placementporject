# Gate 1 — Audit report (audit only)

Date: 2026-11-10. Scope: the whole repository at `applciation/`, the SRS, and `claude/srs-vs-code-checklist.md`.
Rule followed: **no application code, schema, configuration or deployment file was changed during this gate.** Only this report was written. Nothing was run against a database; only read-only commands, type-check, lint and the pure unit tests were run.

Vocabulary used (from your prompt): **Built, Partial, Missing, Broken, Built but not tested, On hold.**
"Broken" is used only where I have evidence. "Built" is used only where something has actually been executed against it (see section 3).

---

## 1. Architecture summary

| Item | What the code shows |
|---|---|
| Stack | Next.js 16 (App Router, route handlers), React, shadcn components, Prisma 7 on Postgres, Supabase Auth (JWT) and Storage, nodemailer SMTP, Anthropic SDK (interviews, discussions, open-answer marking), Groq (JD parsing, Student 360, marksheet reading, resume suggestions) |
| Size | 520 API route files, 109 pages, 148 Prisma models, 96 enums, 46 migrations, 177 `lib` files, 85 components |
| Portals | Staff console (`/staff`), student (`/student`), recruiter (`/recruiter`), platform admin (`/platform`), public token pages (showcase, mentor review, internship feedback, calendar feed) |
| Auth wrappers | `route` (staff, 440 handlers), `studentRoute` (198), `recruiterRoute` (11), `platformRoute` (7). Each wrapper authenticates, checks role and module, rate-limits, and maps errors |
| Route guard inventory | Of 520 route files, 10 do not use a wrapper. All 10 look intentional: `health`, `auth/login-event` and `me/logins` (check the bearer token themselves), `invitations/lookup` and `accept`, and token links (`showcase/[token]` and its PDF, `project-review/[token]`, `internship-feedback/[token]`, `calendar/feed/[token]`). Five more export raw handlers beside wrapped ones: the four cron job routes and the calendar feed. Not yet proven by test |
| Role guards | Faculty-only and principal-only sessions are refused by every route unless the route names them (deny by default). Roles: TPO_ADMIN, PLACEMENT_OFFICER, DEPARTMENT_COORDINATOR, FACULTY, PRINCIPAL. Recruiters and platform admins are separate identities |
| Tenant isolation | Every record carries `collegeId`; sessions are loaded from the token and queries are scoped. One login belongs to one college |
| Scheduled jobs | Five endpoints (cron secret): block evaluation, scheduled reports, CRM follow-ups, round reminders, reminders and message sweep. All declared in `vercel.json` (the last one was missing until the 2026-11-10 audit) |
| AI | Provider calls are made inside the request with time limits; there is no queue. Keys come from environment variables only |
| Migrations | Database diff against the schema is empty (checked 2026-11-10): all 46 migrations, including Modules 14 to 21, are applied on the hosted database |

## 2. Existing test framework and what was actually run today

| Suite | What it is | Run today? | Result |
|---|---|---|---|
| `npm run typecheck` | `tsc --noEmit` | Yes | **Passed**, no errors (75 s) |
| `npm run test:unit` | 34 `tsx` test files for pure rules; all 34 are in the script | Yes | **Passed**, exit 0 (36 s). They need no database |
| `eslint` over the whole project | Lint | Yes | **2 errors, about 27 warnings.** Errors: `scripts/list-routes.mjs:24` (variable named `module`) and `hooks/use-mobile.ts:14` (setState inside an effect). Both are outside the `app components lib` folders that are normally linted. Not caused by Modules 14 to 21 |
| `npm run test:e2e` | 12 files, about 828 `t(...)` checks, driven over HTTP | **No.** Needs a database and the seed admin's credentials | Not run. A local Docker stack exists (`tests/e2e/stack`, Docker 29.9 is installed here). Some suites run only against it, which is the safe route; I did not start it |
| `npm run test:web` | Playwright, 4 spec files, 13 tests, uses installed Chrome | **No** | Not run (needs a running app and database) |
| Production build | `next build` | Yes, per module | Passed (exit 0) after each of Modules 14 to 21 |

**What the existing suites cover** (from their headers): invitations and sign-in (M1), institutions, tenant isolation and academic structure (M2), academic records (M3), psychometrics (M4), Student 360 intelligence, companies, drives, rounds, offers, attendance, blocking, dashboards, analytics, communications, security headers and rate limits, access security and platform MFA, and an add-on file covering early versions of internships and similar.
**What no end-to-end test covers:** Modules 5 to 21 as built since (roadmap, LMS, resources, projects, internships as rebuilt, resume engine, JD analysis, matching, campaigns, mock tests, mock interviews, reports, readiness, placement status, discussions, notifications, dashboards, the principal role). They have unit tests of their rules only.
**No test** checks the route-guard matrix (every route against every role) or the platform administrator's workflow in a browser.

## 3. Module-by-module status

"Test evidence" is only what exists today, executed or not.

| Module | Code status | Test evidence | Classification |
|---|---|---|---|
| M1 Authentication and users | All listed items built except mobile OTP and SSO (your decision: on hold) and bulk upload of **staff** (staff are invited one at a time; students bulk-import) | E2E files 10 and 12 exist, not run today | Built but not tested (today). Mobile OTP, SSO: On hold. Staff bulk upload: Partial |
| M2 Institution management | Built | E2E 13 (100 checks), web specs, not run today | Built but not tested (today) |
| M3 Student profile | Built | E2E 14, web spec, not run today | Built but not tested (today) |
| M4 Assessments and career profiling | Built (personality, DISC-style, RIASEC, aptitude, communication, etc.) | E2E 07 and 11, unit | Built but not tested (today) |
| M5 Career roadmap | Built. Gap: roadmap suggestions point at general practice rather than naming courses | Unit only | Partial, not tested |
| M6 LMS | Built. Live sessions are a link plus attendance (no video of its own); programmes and journeys are a lighter model | Unit only | Partial, not tested |
| M7 Resources | Built. AI recommendations are rules, not a language model; assigning to JDs and mock interviews checked only partly | Unit only | Partial, not tested |
| M8 Projects and portfolio | Built, GitHub commit counts for public repositories only | Unit only | Built but not tested; GitHub verification needs a live check |
| M9 Internships | Built | Early version in E2E 08; unit | Built but not tested |
| M10 Resume engine | Built (PDF and Word, versions, ATS check, suggestions) | Unit only | Built but not tested |
| M11 JD management and AI analysis | Built. "Approval gates for different drive types" (your list): to be checked against the SRS in Gate 2; JD review is a single approval step | Unit only | Built but not tested; approval-gate question open |
| M12 Matching | Built | Unit only | Built but not tested |
| M13 Preparation campaigns | Built | Unit only | Built but not tested |
| M14 Mock test engine | Built. Coding and SQL answers are read by the AI, never run | Unit only | Partial (no execution environment), not tested |
| M15 Mock interviews | Built. Voice is browser dictation only, no video | Unit only | Partial, not tested |
| M16 Reports | Test, interview, discussion, student and group reports built. **Ten of the SRS section 11 reports are missing as downloads** (section 5 below) | Unit only | Partial |
| M17 Readiness | Built | Unit only | Built but not tested |
| M18 Placement management | Built, plus the 14-step derived status | E2E 03 to 06 cover the older parts; status derivation unit only | Built but not tested |
| M19 Group discussion | Built as AI-participant practice. Your list mentions "collaboration and communication": the SRS describes a simulator, not live multi-student rooms, so I treat live rooms as not required unless you say otherwise | Unit only | Built but not tested; scope question open |
| M20 Notifications | In-app, email, reminders, preferences, calendar feed built. SMS and WhatsApp built but **On hold** (see section 6) | Unit only | Built but not tested; SMS and WhatsApp: On hold |
| M21 Dashboards | Student, placement office and principal dashboards built. Employer dashboard belongs to the recruiter portal and has not been inspected in depth | Unit only (nav and role helpers) | Built but not tested; employer dashboard: not inspected |

**Broken:** nothing is proven broken today. Two items are likely defects and are listed in section 7 so they can be tested.

## 4. System Administrator status

This is the least complete area. Verified by reading the code:

**Exists and looks sound**
- Separate portal `/platform` (one page, 176 lines) and 7 handlers under `/api/platform`, all wrapped in `platformRoute`.
- Identity is the `PlatformAdmin` table. There is **no API to create or remove platform admins**; rows are added only by `npm run db:platform-admin` (a deliberate boundary). A platform admin has no `User` row, so every college route refuses them.
- Two-step sign-in is mandatory and independent of any college setting. State is read fresh from Supabase on each request and fails closed. Enrolment, verification and removal exist with rate limits; a recovery script exists.
- Institution provisioning: creates college, settings, modules, optional departments and academic year, and the first TPO admin (invited by email) in one transaction with rollback of the invited auth user on failure. Duplicate `slug` is refused with 409.
- Institution activate and deactivate (`PATCH /api/platform/institutions/[id]`, audited with before and after). Suspension is enforced on every request by `getSession`, `getStudentSession` and the recruiter session (each checks `college.isActive`), so existing sessions stop working at once. Nothing is deleted.
- Institution list with counts of staff, students and departments only (no college records leave).
- `PlatformAuditLog` table and a helper (`lib/platformAudit.ts`) used for sign-in protection events.

**Missing against your prompt**
| Area (prompt section) | Finding |
|---|---|
| B. Institution management | No search, filter or pagination on the list. No edit of institution details or module set by the platform admin (name, colour and logo are edited by the college's own TPO; modules are fixed at creation). No "registration status", no usage view. Duplicate check is by slug only, not by name |
| C. Platform analytics | **UPDATE 2026-11-10 (Gate 4 Phase 4.2): BUILT.** Was: none. Now `/platform/analytics` with `GET /api/platform/analytics` and `/institutions`: institution, user, institution-wise, placement and activity statistics, date-range / institution / status filters, charts, tables, empty, loading and error states. Every figure is a database aggregate; no new table. Metric definitions in `applciation/docs/PLATFORM_ANALYTICS.md`; see 4.2 below |
| D. Subscriptions and plans | **None.** No tables, no limits, no billing. Not named as in scope in the SRS beyond "if applicable" |
| E. Health and monitoring | **UPDATE 2026-11-11 (Gate 4 Phase 4.3 closing): BUILT; two of the three recorded gaps are closed and one is open for a scope decision.** `/platform/monitoring` with `GET /api/platform/monitoring`, `/errors` (durable, 14 days), `/jobs` (run history, 90 days), plus unauthenticated `/api/health/live` and `/ready`. Scheduled-job history (`JobRun`) and durable errors (`MonitorEvent`) came from one additive migration (`20261116090000_monitoring_history`, applied to the isolated local database only; verified on a scratch database: fresh deploy, upgrade over data, no drift, clean rollback, re-apply). A database outage answers 503 and the dashboard shows a connection failure or a marked stale last-known state, with **no authentication fallback**. SA-TC-055 and SA-TC-054 pass. **Open:** the application does not measure its own request latency or throughput; the SRS names no such metric and none was approved, so SA-TC-008 is **Blocked** by agreed scope (Vercel Observability for request performance). See 4.3 below and `applciation/docs/MONITORING.md` |
| F. AI configuration | Environment variables only. No admin interface, no usage statistics, limits or fallbacks. Model names are not recorded on AI evaluations (only the Student 360 report keeps one) |
| G. Support and monitoring | College-level tickets exist (students raise them, staff answer). **No platform-level support view** |
| H. Audit | **UPDATE 2026-11-10 (Gate 4 Phase 4.1): BUILT.** Was: `PlatformAuditLog` had no screen or API to read it, and institution actions by a platform administrator sat in the college `AuditLog` (split trails). Now `GET /api/platform/audit-logs` (+ `/:id`, `/facets`) and the page `/platform/audit` show both existing trails as one read-only timeline: search, filters (event type, administrator, institution, kind, outcome, date range), sort, paging, details, credential masking. Mutating methods return 405. No new table or migration; institution staff events are not included. See section 4.1 below |
| Logout and session expiry | Sign-out is the shared Supabase client; session lifetime is Supabase's. No platform-specific idle timeout |

### 4.1 Platform audit-log viewer (added 2026-11-10, Gate 4 Phase 4.1)

**Architecture (unchanged, extended by reading):** two existing trails. `PlatformAuditLog` (no college): `platform.admin.created`, `platform.mfa.enroll_started|enrolled|enroll_failed|challenge_ok|challenge_failed|removed|remove_failed|recovery`, with administrator id and email, source address and a detail JSON. `AuditLog` rows with `platformActorId` set: `institution.provision|activate|deactivate`, with college, entity, before and after. The viewer is a `UNION ALL` of exactly those two reads (`lib/platformAuditView.ts`); it creates and changes nothing.

**Outcome:** recorded only through the action name (`..._failed` is a failure; everything written is otherwise a completed action). Refused or failed institution actions that never reach the database are **not** recorded today, so they cannot be shown (see limitations).

**Access:** `platformRoute` only: authenticated platform administrator with the second step complete. Anonymous 401; college Head TPO, officer, coordinator, faculty, principal, student and recruiter 403; password-only platform session 403 `MFA_REQUIRED`; administrator without an authenticator 403 `MFA_SETUP_REQUIRED`.

**Masking:** `redact()` hides values under keys that look like credentials (password, secret, token, key, authorization, cookie, session, otp, code, hash, private, credential, bearer, signature) and any value shaped like a JWT, `sk-` key, bearer string or long opaque blob, at any depth. The list never returns detail bodies.

**Known limitations:** no export; no free-text search inside the detail body; outcome of institution actions is always "succeeded" because failures are not logged; platform actions that are only refused (for example a rejected duplicate registration) are not audited; the page is tested in Chrome only; ordering by actor or institution uses the database collation.

### 4.2 Platform analytics (added 2026-11-10, Gate 4 Phase 4.2)

**Sources used (no new tracking):** `College` (institutions, status, registration date), `Student`, `User` (staff), `Recruiter`, `PlatformAdmin`, `Drive`, `Application`, `Offer`, `LoginEvent` (recorded sign-in sessions), and the two audit trails for recent administrative activity.

**Placement rate:** placed students ÷ students registered for placement (active, not archived, `participationStatus = REGISTERED`), the population the institution dashboards already use; null when nobody is registered. The SRS gives no formula. Platform rate is pooled. With a date range the numerator becomes distinct registered students with an offer accepted in the range.

**Snapshots vs flows:** people and institution totals are as of now; registrations, drives, applications, offers, placements and sign-ins follow the range (UTC days).

**Known limitations:** "active users" is distinct people with a recorded sign-in session (last 30 days by default), not every request; platform administrators are not in `LoginEvent`; placed-with-range needs an accepted offer; no export; charts use the theme's single-hue palette. Stale planner statistics after a bulk load can make the institution search+range query slow until `ANALYZE` (measured 7.6-8.7 s vs 0.14 s).

### 4.3 System health and monitoring (added 2026-11-10, Gate 4 Phase 4.3)

**Existing infrastructure found:** `/api/health` (one `SELECT 1`, unauthenticated), `lib/env.ts` (startup configuration check), Prisma/pg pool (`DB_POOL_MAX`), Supabase storage client (single bucket `student-documents`), Groq client with a 50 s timeout (`lib/intelligence/groq.ts`), nodemailer SMTP with a dry-run switch (`lib/mailer.ts`), five Vercel cron jobs in `vercel.json` (cron-secret endpoints), request ids set in `proxy.ts` and returned in error bodies, JSON error logs to the console. **Not found:** any record of cron runs, any stored application errors, any AI or storage outcome history, any job queue. **Durable data that does exist:** `InvitationEmailLog`, `MessageLog` (email deliveries), `ImportJob` (bulk imports).

**Built without a migration:** bounded live probes (database, storage, AI, SMTP, with limits of 2-4 s), an in-memory per-instance error ring and AI call tally (clearly labelled not durable), the job registry from `vercel.json`, email history and import states from existing tables, liveness and readiness endpoints, throttling (15 s shared result, forced refresh at most every 5 s).

**Recorded at first delivery (2026-11-10), since resolved or decided:** SA-TC-055 (no job history), SA-TC-054 database-outage step (dashboard cannot authenticate without the database), SA-TC-008 (no application request-latency metrics). The proposed `JobRun` and `MonitorEvent` tables were approved for the local development environment and are now built (below).

**Closing update (2026-11-11):**
- **Schema:** two additive tables, no foreign keys, nothing altered or backfilled, row-level security on. `JobRun` is one row per job per schedule slot (unique on job and slot, so retries and concurrent duplicates update one row); `MonitorEvent` holds scrubbed server errors. Rollback is two `DROP TABLE` statements; tested.
- **Retention:** 90 days (`JobRun`) and 14 days (`MonitorEvent`), run from the hourly job in bounded slices (at most 5 x 1,000 rows per table per call, `FOR UPDATE SKIP LOCKED`, 3 s budget). A 12,500-row backlog drains over three calls; recent rows are never touched.
- **Job history (SA-TC-055: Pass):** start, finish, outcome, duration, attempts, numeric counts and a sanitized failure note; tested with success, failure, retry, 12 concurrent executions, six failing plus six succeeding concurrent attempts, the monitoring table missing, and monitoring writes that hang (the job still returned its normal result, delayed by about 2 s at most). Database error text (which can quote student values) is never stored; only its class and code.
- **Database outage (SA-TC-054: Pass, expected behaviour updated with rationale):** `/api/health/live` 200 and `/api/health/ready` 503 with no detail; every platform route answers 503 `DATABASE_UNAVAILABLE`; no credential kind (valid, password-only, no authenticator, none, garbage) received data; readiness recovered in 4.8 s and the dashboard on the first request; outage errors were written after recovery. The dashboard shows a connection failure, or the last-known state marked stale with its time.
- **Application performance (SA-TC-008: Blocked, agreed scope 2026-11-11):** the SRS says only "Monitor application performance" (3.1) and that common dashboard operations should normally respond within about 2-3 seconds (section 9); it defines no latency or throughput metric. Approved decision: use **Vercel Observability** for application-wide request performance and do not build in-process per-route metrics (several independent function instances would make them instance-local, lost on restart and unreliable). The custom dashboard covers health, dependencies, scheduled jobs and recorded errors, and has no per-route latency or throughput. The case stays Blocked pending formal clarification or integration of performance monitoring; it is not passed.
- **Tests:** 237 unit assertions, 170 integration assertions (`g3-08`), 22 migration and rollback assertions (`g3-09`), 2 browser tests; all pass except the one Blocked item above.


**Possible security findings to verify in Gate 3** (not yet tested)
1. **Suspended institution, public pages:** `lib/showcase.ts` checks the student and the link but not `college.isActive`, so a suspended institution's student showcase links may keep working. Same question for the mentor-review, internship-feedback and calendar-feed token routes.
2. Whether any scheduled job (reminders, delivery sweep, reports) still processes a suspended institution (the reminders job selects colleges with `isActive: true`; the older jobs are not yet read).
3. Whether a TPO admin token, student token and recruiter token are each refused by every `/api/platform` route (the wrapper looks correct; no test exists).

## 5. Requirement inventory (counts) and the gaps already known

The SRS text has about **1,070 bullet-style requirement lines** (about 570 in the module sections, 120 in roles and structure, 84 screens, 93 entities, 49 AI, 37 non-functional, 14 integrations, 20 reports, 21 workflow, 53 acceptance, 11 principles). This is an approximate count of lines, not of testable requirements; the exact inventory is a Gate 2 deliverable.

Gaps already found in the 2026-11-10 comparison (full list in `srs-vs-code-checklist.md` section 5):
- **Missing as downloads:** student profile, academic performance, career assessment, roadmap, course completion, skill gap, project, internship, preparation campaign and job readiness reports. Partial: JD analysis, candidate matching, drive and company reports. CSV only in a few places.
- **Missing:** AI question generation, revision planning, model and prompt version retention, data retention and deletion workflows, Interviewer, Trainer and Alumni roles, configurable roles and permissions, campus-level and batch-level staff access, public landing page, ERP and SIS integration, code execution for coding and SQL, JD and eligibility change history (the audit log records that a change happened, not the earlier content), document classification, quality and duplicate checks.
- **Partial:** backup and recovery (relies on Supabase, no tested drill), monitoring and error tracking, background retries (no queue), asynchronous AI work.

## 6. On hold (as you decided)

- **SMS** and **WhatsApp**: `ON HOLD — Awaiting affordable provider access`. Present in code: a Twilio-style adapter (`lib/channels.ts`), college switches, student opt-in, quiet hours, delivery log. Both are **off by default** (`smsEnabled` and `whatsappEnabled` are false, and nothing is sent unless a college enables it, the student opts in, and keys exist). `CHANNEL_DRY_RUN=true` records without sending. To confirm in Gate 3: that email and in-app delivery are unaffected when these are off.
- Mobile-number OTP login and institutional SSO: On hold (your earlier decision).

## 7. Existing bugs and defects found without running anything

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| A-01 | Medium | Lint fails on two files outside the normally linted folders (`scripts/list-routes.mjs`, `hooks/use-mobile.ts`) | `eslint .` output |
| A-02 | High (**confirmed by code reading in Gate 2**) | Suspended institutions' public pages stay reachable and writable: showcase page and resume PDF (`lib/showcase.ts`), calendar feed (`lib/calendarService.ts`), project-mentor review and internship-mentor feedback links (both can also write), and invitation acceptance (`app/api/invitations/accept`). None checks the college status; the showcase page also counts a view | `lib/showcase.ts`, `lib/calendarService.ts`, `app/api/project-review/[token]/route.ts`, `app/api/internship-feedback/[token]/route.ts`, `app/api/invitations/accept/route.ts`. Not yet reproduced by a running test (Gate 3) |
| A-03 | Medium | Platform audit trail is split between `PlatformAuditLog` (MFA events) and the college `AuditLog` (institution actions), and the first has no reader | code reading |
| A-04 | Medium | AI evaluations (descriptive marks, interview and discussion reports) do not store model or prompt version | code reading, SRS section 8 rule |
| A-05 | Medium | No automatic cleanup and no deletion workflow for student data | README states it |
| A-06 | Low | A scheduled-jobs gap that existed (reminders job missing from `vercel.json`) was fixed on 2026-11-10; no test guards the list | fixed earlier, no regression test |
| A-07 | Info | `tests/e2e` and `tests/web` have not been run against Modules 5 to 21 | section 2 |

## 8. Proposed testing strategy (for approval)

1. **Environment.** Use the isolated local stack (`tests/e2e/stack`, Docker is available): its own Postgres, Supabase-compatible auth and a mail sink. Never the hosted Supabase project, and I will not type the seed admin password there. External providers are replaced by mocks: AI by a recorded-response stub, SMTP by the mail sink, Twilio by dry-run. No real messages to anyone.
2. **Gate 2 deliverable.** `claude/full-application-test-plan.md` with one row per requirement, the exact fields you listed, IDs as you specified, and a coverage check that fails if any SRS bullet has no test case. All rows start as "Not Run".
3. **Gate 3.** Run what exists (12 E2E files and 4 web specs on the local stack, plus unit). Then add, in this order: route-guard matrix (every route against every role and no token, generated from the route list); tenant isolation across two colleges; platform admin suite (`SA-TC-*`); security regression (injection, upload validation, rate limits, cron auth, token pages for suspended colleges); then module suites for M5 to M21 using the existing `lib.mjs` helpers; report export tests that compare files with database rows.
4. **Performance** with seeded volumes on the local stack (for example 10,000 students), recording real timings and query counts.
5. **Fixes** only after the Gate 3 results, smallest change first, each with a regression test, in the severity order you gave.

## 9. Decisions I need from you before Gate 2

1. **System Administrator scope.** The SRS lists, for the Super Administrator: manage institutions, platform users, roles and permissions, subscriptions and billing "if applicable", AI services, platform settings, performance monitoring, platform analytics, integrations, support, and data retention and security settings. Which of these do you want built? My suggestion: institution search, edit and status, platform analytics, a platform audit viewer, a monitoring page (real checks only), AI configuration with masked secrets, and platform-level support. Subscriptions and billing documented as future unless you say otherwise.
2. **Platform admin management.** Keep "created only by script" (current, safer), or add a protected screen?
3. **Roles not built** (Trainer, Interviewer, Alumni, configurable permissions): your prompt says not to create roles without validating the SRS. The SRS does list them. Do you want them in scope for the testing and completion work, or documented as missing and deferred?
4. **Reports.** The ten missing section 11 downloads: in scope to build (my assumption from your prompt), and in which formats (PDF, Word, Excel, CSV)?
5. **M19 "collaboration and communication".** The SRS describes an AI simulator. Do you want live multi-student rooms, or is the current design correct?
6. **M11 "approval gates for different drive types".** I could not find this wording in the SRS. Please point me to the requirement, or I will treat it as the single JD approval step the SRS describes.
7. **Local test stack.** May I start the Docker stack in Gate 3 (it only uses local containers)?

**Awaiting your approval before Gate 2.**

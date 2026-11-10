# M2 Institution Management: what exists, what was added

Existing and retained, unchanged in behaviour: college profile, campuses, departments, programmes, branches, academic years, batches
(with coordinator), semesters, student academic mapping (`lib/academicMapping.ts`), invitations, institution settings, `collegeId` isolation.

## Added
| Area | What | Where |
|---|---|---|
| Faculty | `FACULTY` role (staff `User`, no second auth). Profile, departments, programme and batch allocation, mentor per student. Deny-by-default for faculty-only sessions. | `lib/faculty.ts`, `app/api/settings/faculty/*`, `app/api/faculty/*`, `components/faculty-panel.tsx` |
| University | `University` per college; `Program.universityId` (legacy `Program.university` text kept and kept in step). | `app/api/settings/universities/*`, `lib/academicIntegrity.ts` |
| Provisioning | Platform-admin-only: college + settings + modules + first TPO admin (+ optional departments / academic year), one transaction, audited. | `lib/provision.ts`, `app/api/platform/institutions/*`, `app/platform/page.tsx` |
| Platform boundary | `PlatformAdmin` table, no API writes to it; added with `npm run db:platform-admin`. Has no `User` row, so reaches no college route. | `lib/auth/platform.ts`, `lib/api/platformHandler.ts` |
| Integrity | Branch-of-programme checks now also scoped by college; programme department change blocked while students would be left mismatched; read-only violation report. | `app/api/settings/integrity` |

## Decisions
- Faculty access = mentees + students of allocated batches/programmes. Departments are affiliation and bound what can be allocated.
- Faculty-only sessions are refused by every route unless it lists `FACULTY` or sets `facultyOk` (fixes 18 routes that had no role list).
- A multi-role user keeps the union of their roles; FACULTY adds nothing beyond the faculty routes.
- Universities are per college (programmes are), unique by code and by case-insensitive name.
- One login belongs to one college (`User.id` = Supabase auth id), so the same email cannot administer two institutions.

## Platform administrator two-step sign-in (mandatory)
- Enforced in `getPlatformSession` (`lib/auth/platform.ts`) for every `/api/platform/*` route except the enrolment/challenge/status routes. It does not read any college setting.
- No authenticator enrolled → `403 MFA_SETUP_REQUIRED`. Enrolled but password-only session → `403 MFA_REQUIRED`. Supabase unreachable → `503` (fails closed). State is read fresh each request (no cache).
- Enrol / challenge go through `/api/platform/mfa/{enroll,verify}` so each step is audited in `PlatformAuditLog`; wrong codes limited to 10 per 10 minutes.
- Removal: `DELETE /api/platform/mfa` needs an already-verified session plus a fresh code. Afterwards platform access is refused until a new authenticator is enrolled.
- Recovery (lost phone): `PLATFORM_ADMIN_EMAIL=… PLATFORM_RECOVERY_CONFIRM=… npm run db:platform-mfa-recovery` (needs the service-role key; audited as `platform.mfa.recovery`, with the operator). Do it with the administrator present and identity confirmed out of band, because whoever signs in next with the password can enrol.
- The `/platform` page is a client shell with no data of its own; every byte of platform data comes from the API, which does the enforcing.

## Platform audit log (read-only viewer)
- `GET /api/platform/audit-logs`, `GET /api/platform/audit-logs/:id`, `GET /api/platform/audit-logs/facets`; page `/platform/audit`. Platform administrators with the second step only; there is no write route (other methods return 405).
- One timeline over the two existing trails: `PlatformAuditLog` (administrator security events) and `AuditLog` rows with `platformActorId` (institution actions by a platform administrator). No new table. Institution staff's own actions are not shown.
- Query: `q` (event, administrator email, institution name, target id, event id), `action`, `admin`, `institution`, `source` (PLATFORM|INSTITUTION), `outcome` (success|failure), `from`, `to` (date-only `to` includes the whole day), `sort` (createdAt|action|actor|institution|source), `order`, `page`, `pageSize` (1-100). Fixed allow-lists; invalid values give 400.
- Detail hides anything credential-shaped (`lib/platformAuditView.ts` `redact`). Code: `lib/platformAuditView.ts`. Tests: `tests/unit/platformaudit.test.mts`, `tests/gate3/g3-06-platform-audit.mjs`, `tests/web/platform-audit.spec.ts`.

## Platform analytics
Page `/platform/analytics`, APIs `GET /api/platform/analytics` and `/institutions`. Platform administrators with the second step only; read-only; aggregates only, no personal records. Definitions of every metric, the placement-rate denominator, date and timezone rules and the filters: `docs/PLATFORM_ANALYTICS.md`. Code `lib/platformAnalytics.ts`; no migration.

## System health and monitoring
Page `/platform/monitoring`; `GET /api/platform/monitoring`, `/errors`; unauthenticated `GET /api/health/live` and `/ready`. Meaning of each status, thresholds, evidence, data sources, limitations and the (unapplied) schema proposal for durable job and error history: `docs/MONITORING.md`. No migration.

## Local, isolated end-to-end stack
`bash tests/e2e/stack/up.sh` starts Postgres, Supabase Auth (GoTrue), Storage and a mail sink in Docker, applies all migrations and seeds one college. `source tests/e2e/stack/env.sh` points the app and tests at it. `tests/e2e/run.mjs` refuses to run unless `SUPABASE_URL` and `DIRECT_URL` are local.

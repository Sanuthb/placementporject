# Platform analytics (System Administrator)

Page `/platform/analytics`; API `GET /api/platform/analytics` (summary, chart series, recent activity) and `GET /api/platform/analytics/institutions` (institution-wise table).
Platform administrators with the second step only (`platformRoute`). Read-only (other methods return 405). Aggregates only: no student, staff or recruiter record is returned.
Code: `lib/platformAnalytics.ts`. Nothing is stored for analytics; every figure is computed by the database from the tables below. No migration.

## Two kinds of figure
- **Snapshots** describe the platform now and do **not** follow the date range: institutions, students, staff, recruiters, platform administrators.
- **Flows** happen at a time and **do** follow the range: institutions registered, drives, applications, offers, placed students, sign-ins, recent activity.
- All dates are **UTC days**. `from` starts at 00:00:00.000Z, a date-only `to` ends at 23:59:59.999Z (the whole day is included). `from` after `to` is refused (400).

## Filters
`from`, `to`, `institution` (one institution, UUID), `status` (`all` | `active` | `suspended`). The table adds `q` (name or address), `sort`, `order`, `page`, `pageSize` (1-100). Every value is validated by an allow-list or a type; sort keys map to fixed SQL; search text is escaped (`%`, `_`, `\` are literal) and always bound as a parameter. The institution and status filters apply to every college-scoped figure; platform administrators are platform-level and are not filtered.

## Metrics
| Metric | Source | Calculation | Includes / excludes |
|---|---|---|---|
| Registered institutions | `College` | count of colleges matching the filters | Suspended included. A range does not change it |
| Active / suspended | `College.isActive` | count where true / false | |
| Registered last 30 days | `College.createdAt` | created in the 30 days before the request | Fixed window, not the range |
| Registered in range | `College.createdAt` | created inside the range; `null` when no range is given | |
| Students: total | `Student` | all rows of the filtered institutions | Including inactive and archived |
| Students: active | `Student` | `isActive` and not `isArchived` | |
| Students: with login | `Student.inviteStatus` | active students whose invitation is `ACTIVATED` | |
| Staff total / active | `User` | all rows / `isActive` | College staff only; platform administrators have no `User` row |
| Recruiters total / active | `Recruiter` | all rows / `isActive` | |
| Platform administrators total / active | `PlatformAdmin` | all rows / `isActive` | Platform-level: not filtered by institution |
| Signed in (active users) | `LoginEvent` | distinct `userId` with at least one recorded sign-in session in the window; sign-ins = sessions | Staff, students, recruiters. Window is the range, or the **last 30 days** when none is given (the response says which). A session is recorded when the app calls the sign-in event route right after sign-in, so this is "recorded sign-ins", not every API call. Platform administrators are not recorded there |
| Drives | `Drive` | `status <> DRAFT` with `driveDate` in range; breakdown published / closed / cancelled | Drafts excluded |
| Applications | `Application` | rows with `appliedAt` in range; breakdown shortlisted / withdrawn | Withdrawn included in the total |
| Offers made | `Offer` | `status <> REVOKED` with `offeredAt` in range; breakdown accepted / declined; revoked and historical-imported shown apart | Same "made" rule as the institution analytics. Imported historical offers are counted and labelled |
| Registered for placement | `Student` | active, not archived, `participationStatus = REGISTERED` | Opted-out, higher-studies, entrepreneurship, not-eligible, inactive and archived are excluded |
| Placed students | `Student.isPlaced` / `Offer` | **No range:** registered students with `isPlaced` (kept up to date from accepted offers). **With a range:** distinct registered students with an `ACCEPTED` offer whose `respondedAt` (else `offeredAt`) is in the range | A student with several accepted offers counts once |
| **Placement rate** | derived | placed students ÷ students registered for placement, one decimal; `null` (shown "—") when nobody is registered, never 0% | This is the denominator the institution dashboard and analytics already use (`lib/dashboard.ts`, `lib/analytics.ts`). The SRS does not define a rate formula, so the existing, documented population is reused rather than a new one. Platform rate is pooled (sum of placed ÷ sum of registered), not an average of institution rates. With a range the denominator is still all currently registered students |

The institution table is the same measures per institution. Each measure is aggregated in its own sub-query and joined on the institution id, so a join cannot multiply counts (tested: table rows summed over every page equal the global summary).

## Chart series
Institutions registered, sign-ins, applications and offers per **day** (ranges up to 92 days) or **month**, zero-filled. No range = the last 12 months, monthly.

## Recent activity
Latest 10 institution registrations (`College.createdAt`) and latest 10 platform administrator events (the audit viewer's read of `PlatformAuditLog` and platform-actor `AuditLog` rows).

## Performance
Everything is computed with aggregates in the database; the institution table is sorted and paged in the database. Measured timings are in `tests/gate3/results/g3-07-timings.json` and `claude/full-application-test-results.md`. After a large bulk insert the database's planner statistics are stale until `ANALYZE` / autovacuum has run; one query then took 7.6-8.7 s instead of about 0.14 s (measured).

## Limits
Placed students with a range depend on `Offer.respondedAt`/`offeredAt`; students placed through a path that sets only `isPlaced` and no offer count only in the no-range view. Sign-in figures depend on the client reporting the session. No export.

## Tests
`tests/unit/platformanalytics.test.mts`, `tests/gate3/g3-07-platform-analytics.mjs` (API and database comparison, large dataset, timings), `tests/web/platform-analytics.spec.ts` (Chrome).

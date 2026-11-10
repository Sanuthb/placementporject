# Full application test results (Gate 3: automated testing)

Generated 2026-11-10 by `claude/tools/gate3_report.py` from the recorded assertions in `applciation/tests/gate3/results/`. Companion file: `full-application-test-results.csv` (all 1386 cases). The approved plan (`full-application-test-plan.md/.csv`) is unchanged.

**Honesty rules used:** a case is **Pass** only if at least one assertion was recorded against it and every recorded assertion passed. **Fail** if any failed. **Blocked** if something was attempted but a step could not run (reason stated). Everything else stays **Not Run**; nothing is promoted. No application code was changed. No test case was removed or renumbered.

## 1. Headline numbers

| Measure | Count |
|---|---|
| Total test cases | 1386 |
| Executed (Pass + Fail) | 154 |
| Pass | 118 |
| Fail | 36 |
| Blocked | 19 |
| Not Run | 1213 |

`Executed` does not include Blocked. Case-level statuses are decided only from assertions tagged to the case; whole-suite results are listed separately in section 5 and are not counted as case passes.

## 2. Module-wise results

| Group | Cases | Pass | Fail | Blocked | Not Run |
|---|---|---|---|---|---|
| M01 Authentication and User Management | 19 | 13 | 0 | 0 | 6 |
| M02 Institution Management | 16 | 8 | 0 | 0 | 8 |
| M03 Student Registration and Profile | 38 | 19 | 0 | 0 | 19 |
| M04 Student Assessment and Career Profiling | 31 | 2 | 0 | 0 | 29 |
| M05 Career Roadmap and Student Development | 17 | 2 | 0 | 0 | 15 |
| M06 Learning Management System | 29 | 2 | 0 | 0 | 27 |
| M07 Resource Management System | 49 | 1 | 0 | 1 | 47 |
| M08 Project Management and Portfolio | 20 | 2 | 0 | 0 | 18 |
| M09 Internship Management | 18 | 2 | 0 | 0 | 16 |
| M10 Dynamic Resume Engine | 27 | 1 | 0 | 1 | 25 |
| M11 Job Description Management and AI Analysis | 32 | 1 | 0 | 1 | 30 |
| M12 AI Candidate Matching Engine | 21 | 0 | 0 | 1 | 20 |
| M13 Job-Specific Preparation Campaign | 65 | 1 | 0 | 1 | 63 |
| M14 Mock Test Engine | 51 | 0 | 0 | 1 | 50 |
| M15 AI Mock Interview Engine | 39 | 1 | 0 | 1 | 37 |
| M16 Report Generation | 30 | 1 | 0 | 1 | 28 |
| M17 Job Readiness Engine | 14 | 1 | 0 | 1 | 12 |
| M18 Placement Management | 28 | 2 | 0 | 0 | 26 |
| M19 Group Discussion and Communication Simulator | 12 | 1 | 0 | 1 | 10 |
| M20 Notification Centre | 19 | 2 | 0 | 0 | 17 |
| M21 Dashboards and Analytics | 40 | 1 | 0 | 1 | 38 |
| Roles (ROLE-*) | 113 | 13 | 0 | 0 | 100 |
| SRS sections (cross-cutting, security, NFR, UI, data...) | 591 | 21 | 1 | 1 | 568 |
| System Administrator (SA) | 67 | 21 | 35 | 7 | 4 |

A low executed count for a module means its cases have not yet been turned into data-specific tests, not that they were tested and passed.

## 3. System Administrator results

67 SA cases: Pass 21, Fail 35, Blocked 7, Not Run 4.

| Case | Feature | Status | Detail |
|---|---|---|---|
| SA-TC-001 | Super Administrator: Responsible for managing the complete p | Not Run |  |
| SA-TC-002 | Super Administrator: Manage institutions | Not Run |  |
| SA-TC-003 | Super Administrator: Manage platform users | Not Run |  |
| SA-TC-004 | Super Administrator: Configure roles and permissions | Fail | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/plat |
| SA-TC-005 | Super Administrator: Manage subscriptions and billing, if ap | Not Run |  |
| SA-TC-006 | Super Administrator: Configure AI services | Fail | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 |
| SA-TC-007 | Super Administrator: Manage platform-wide settings | Fail | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/plat |
| SA-TC-008 | Super Administrator: Monitor application performance | Fail | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 |
| SA-TC-009 | Super Administrator: View platform-level analytics | Fail | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 |
| SA-TC-010 | Super Administrator: Manage integrations | Fail | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/plat |
| SA-TC-011 | Super Administrator: Manage support requests | Fail | System Administrator: platform support requests exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/support:404, /api/platform/tickets:404 |
| SA-TC-012 | Super Administrator: Configure data retention and security s | Fail | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/plat |
| SA-TC-013 | Platform administrator login | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-014 | Invalid platform administrator login | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-015 | MFA setup is forced | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-016 | MFA verification and limits | Pass | 6 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-017 | MFA removal | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-018 | Account creation is script-only and secure | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-019 | MFA recovery script | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-020 | GET /api/platform/me | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-021 | GET /api/platform/institutions | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-022 | POST /api/platform/institutions (register) | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-023 | Duplicate institution | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-024 | Registration validation | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-025 | Registration rollback | Blocked | rollback through a forced mid-transaction failure: Only an input-level failure was exercised; a forced mid-transaction fault needs a fault-injection seam |
| SA-TC-026 | Activate and deactivate institution | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-027 | Suspension blocks all sessions at once | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-028 | Reactivation restores access | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-029 | Suspended institution: public token pages | Fail | SUSPENDED showcase page: read refused: HTTP 200  <-- EXPOSED to a suspended institution / SUSPENDED showcase resume PDF: read refused: HTTP 200  <-- EXPOSED to a suspended institution / SUSPENDED calendar feed: read refused: HTTP  |
| SA-TC-030 | Suspended institution: scheduled jobs | Blocked | suspended institution: scheduled jobs: Cron-secret routes need a run against seeded due work; planned for the next Gate 3 pass |
| SA-TC-031 | Platform audit trail for privileged actions | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-032 | Platform responses never contain college records | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-033 | Platform session expiry and logout | Blocked | platform session expiry and logout: Needs a token expiry clock control or a signed-out token revocation check; test not built yet |
| SA-TC-034 | Rate limits on platform endpoints | Blocked | rate limits on platform endpoints: Dev server runs with RATE_LIMIT_DISABLED=true; needs the production-mode server (:3112) and a flood harness |
| SA-TC-035 | Permission matrix for all platform APIs | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-036 | Platform administrator cannot use college routes | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-037 | Institution isolation through platform pages | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-038 | Page /platform states | Blocked | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above |
| SA-TC-039 | Page /platform: create and suspend flow | Blocked | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above |
| SA-TC-040 | Page /platform accessibility and responsiveness | Blocked | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above |
| SA-TC-041 | Institution search | Fail | System Administrator: institution search, filters, sort and paging exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/institutions?q=g3&limit=5&sort=name:200 |
| SA-TC-042 | Institution filters, sort and paging | Fail | System Administrator: institution search, filters, sort and paging exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/institutions?q=g3&limit=5&sort=name:200 |
| SA-TC-043 | Institution detail view | Fail | System Administrator: institution detail view exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/institutions/2de6c280-da4f-42e4-bf75-ae4fc0652239:405 |
| SA-TC-044 | Institution editing | Fail | System Administrator: institution editing (name, contact) exists and works: Feature not built (Gate 1 audit: Missing). Probed no endpoint exists |
| SA-TC-045 | Duplicate institution warning by name | Fail | a duplicate institution NAME is warned about or refused: HTTP 200 (a second institution with the same name was accepted) |
| SA-TC-046 | Institution usage view | Fail | System Administrator: institution usage view exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/institutions/2de6c280-da4f-42e4-bf75-ae4fc0652239/usage:404 |
| SA-TC-047 | Platform analytics: totals | Fail | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 |
| SA-TC-048 | Platform analytics: distribution | Fail | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 |
| SA-TC-049 | Platform analytics: trends and date filters | Fail | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 |
| SA-TC-050 | Platform analytics: recent activity | Fail | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 |
| SA-TC-051 | Platform analytics: not hardcoded | Fail | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 |
| SA-TC-052 | Platform audit-log viewer | Fail | System Administrator: platform audit-log viewer exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/audit-logs:404, /api/platform/audit:404 |
| SA-TC-053 | Audit trails unified | Fail | System Administrator: platform audit-log viewer exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/audit-logs:404, /api/platform/audit:404 |
| SA-TC-054 | System monitoring: health checks | Fail | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 |
| SA-TC-055 | System monitoring: scheduled jobs | Fail | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 |
| SA-TC-056 | System monitoring: errors | Fail | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 |
| SA-TC-057 | System monitoring: safe output | Fail | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 |
| SA-TC-058 | AI configuration: masked secrets | Fail | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 |
| SA-TC-059 | AI configuration: change and fallback | Fail | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 |
| SA-TC-060 | AI configuration: limits and health | Fail | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 |
| SA-TC-061 | AI usage statistics | Fail | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 |
| SA-TC-062 | AI configuration: access | Fail | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 |
| SA-TC-063 | Platform support: list and filter | Fail | System Administrator: platform support requests exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/support:404, /api/platform/tickets:404 |
| SA-TC-064 | Platform support: privacy | Fail | System Administrator: platform support requests exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/support:404, /api/platform/tickets:404 |
| SA-TC-065 | Platform support: workflow | Fail | System Administrator: platform support requests exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/support:404, /api/platform/tickets:404 |
| SA-TC-066 | Subscriptions and billing documented as future scope | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-067 | Platform-wide settings, integrations, roles and permissions, | Fail | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/plat |

## 4. Security findings

| Issue | Severity | Finding | Cases | Evidence |
|---|---|---|---|---|
| G3-SEC-01 (A-02) | **Critical, confirmed** | A suspended institution remains reachable through public token surfaces. Verified live on the local stack and on a production build: each link works while the college is active, then after `College.isActive=false` it still returns **HTTP 200** for the showcase page, showcase resume PDF, calendar feed, project mentor review link, internship mentor feedback link and invitation lookup. Staff and student APIs are correctly refused (403) in the same state. Write probes (review submit, feedback submit, invitation accept) were **not run** under the stop rule, so write exposure is unproven (code reading says the handlers have no status check). | SA-TC-027/028/029, SRS-SECURITY-TC-039 | `tests/gate3/g3-01-suspended-institution.mjs`, `results/g3-01-suspended-institution.jsonl` |
| G3-SYS-02 | Medium | Platform registration accepts a duplicate institution name (SA-TC-045). | SA-TC-045 | `g3-03-system-admin.mjs` |
| (reviewed, no defect) | Info | Read-only principal can call `POST /api/notifications/read` (returns 400 on an empty body): by design (`principalOk`, a viewer marks their own notifications read). Allow-listed in the sweep with this reason. | ROLE-PRN-TC-005 | `g3-02-access-sweep.mjs` |

What passed (no defect found): all 654 protected endpoints refuse anonymous callers; every staff/recruiter route refuses a student token; every student route refuses a staff token; platform-admin token is refused on all college routes; staff roles outside a route's documented roles are refused (792 probes); principal cannot write (255 probes); institution B cannot list, read, patch or delete any of institution A's records across the 33 collections that held data (59 probes); SQL-injection strings return no error and no extra rows; error responses carry no stack or SQL.

Not covered yet: browser-level XSS rendering, write exposure on the six public surfaces (stop rule), public frontend pages for them (they are thin clients of the same APIs), cross-institution probes for modules with no seeded data (listed as Blocked).

## 5. Supporting suite-level evidence (not counted as case passes)

| Suite | Result | Note |
|---|---|---|
| 03-companies-drives | 41 pass, 0 fail |  |
| 04-rounds-offers-approvals-email | 54 pass, 0 fail |  |
| 05-attendance-blocking-alerts-history | 71 pass, 0 fail |  |
| 06-dashboard-360-analytics-comms | 77 pass, 5 fail | Stale expectations: expects 8 profile sections and old semester route; there are now 9 sections (EDUCATION_HISTORY, M3 Phase 2). |
| 07-student-api-psychometrics | 84 pass, 2 fail | Stale: expects exactly 8 sections; now 9. |
| 08-addon-modules | 92 pass, 2 fail | Stale: internship PATCH to COMPLETED now runs completion checks (M9), so the old unconditional completion fails. |
| 09-security | 24 pass, 0 fail |  |
| 10-student-invitations | 117 pass, 0 fail |  |
| 11-intelligence | 17 pass, 1 fail | Stale: DISC/RIASEC gap wording changed after the M4 instruments. |
| 12-access-security | 44 pass, 0 fail |  |
| 13-institutions | 100 pass, 0 fail |  |
| 14-academic-records | 50 pass, 0 fail |  |
| unit | 34 unit files, exit 0, 233 PASS lines | All unit suites pass (one logged error is an expected negative test). |

The four failing existing suites were verified by hand to be out-of-date tests (section count and completion rules changed in later modules), not application defects. They are left unmodified and listed as test maintenance for Gate 4.

## 6. Environment and infrastructure

- Isolated Docker stack from `tests/e2e/stack` (Postgres 54330, Auth/Storage gateway 54321, mail sink 54325). All 21+ migrations applied locally, including the M14 to M21 migrations that are still unapplied on the hosted database. No hosted Supabase or production data was touched. No real email, SMS or WhatsApp was sent (SMS and WhatsApp remain ON HOLD).
- Functional and sweep suites run against a production build (`next start`, port 3113, rate limits off); the security suite 09 against 3112 with limits on. A dev server was too slow for 500+ routes on this 7.8 GB machine.
- `tests/e2e/run.mjs` still scans `tests/e2e/` for numbered files; the Gate 3 suites live in `tests/gate3/` so they are not mixed into that runner.
- Test-data hygiene: some suites leave rows (provisioned test institutions `g3-prov*`, sweep users) in the local stack; harmless, but a clean reset is `docker compose down -v` then `up.sh`.
- Existing suite 06/07/08/11 expectations are out of date (section 5).
- Not built: browser (Playwright) runs, performance load numbers (A-ambiguities), forced-fault and clock-control seams for session expiry and rollback.

## 7. Ambiguities A-01 to A-20

None were resolved or invented. Cases that depend on them are not executed (stay Not Run or Blocked): report formats and performance numbers (SRS-NFR-TC-001, -024 to -039, M16 format cases), Principal vs Head TPO permission edges (ROLE-PRN-TC-008, ROLE-PERM-TC-003/005), interviewer access mechanism (ROLE-INT-*, ROLE-PERM-TC-008), approval gates by drive type. The principal read-only check used the SRS statement only.

## 8. Every executed case

| Case | Date | Environment | Status | Actual result | Failure details | Evidence | Issue |
|---|---|---|---|---|---|---|---|
| M01-TC-003 | 2026-11-10 | local stack | Pass | 28 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M01-TC-006 | 2026-11-10 | local stack | Pass | 14 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-009 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M01-TC-010 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M01-TC-011 | 2026-11-10 | local stack | Pass | 13 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-012 | 2026-11-10 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-013 | 2026-11-10 | local stack | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-014 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M01-TC-015 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M01-TC-016 | 2026-11-10 | local stack | Pass | 13 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-017 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security, existing suite 13-institutions |  |
| M01-TC-018 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M01-TC-019 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M02-TC-001 | 2026-11-10 | local stack | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-002 | 2026-11-10 | local stack | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-005 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-010 | 2026-11-10 | local stack | Pass | 18 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-013 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-014 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-015 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M02-TC-016 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M03-TC-002 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-003 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-010 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-011 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-012 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-013 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-015 | 2026-11-10 | local stack | Pass | 12 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 14-academic-records |  |
| M03-TC-017 | 2026-11-10 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 14-academic-records |  |
| M03-TC-020 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-022 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-023 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-024 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-025 | 2026-11-10 | local stack | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-033 | 2026-11-10 | local stack | Pass | 16 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-034 | 2026-11-10 | local stack | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-035 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-036 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-037 | 2026-11-10 | local stack | Pass | 7 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M03-TC-038 | 2026-11-10 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations, g3-02-access-sweep |  |
| M04-TC-030 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M04-TC-031 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M05-TC-016 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M05-TC-017 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M06-TC-028 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M06-TC-029 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M07-TC-048 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Resource Management System: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M07-TC-049 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M08-TC-019 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M08-TC-020 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M09-TC-017 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M09-TC-018 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M10-TC-026 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Dynamic Resume Engine: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M10-TC-027 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M11-TC-031 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Job Description Management and AI Analysis: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M11-TC-032 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M12-TC-020 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: AI Candidate Matching Engine: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M13-TC-064 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Job-Specific Preparation Campaign: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M13-TC-065 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M14-TC-050 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Mock Test Engine: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M15-TC-038 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: AI Mock Interview Engine: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M15-TC-039 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M16-TC-029 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Report Generation: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M16-TC-030 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M17-TC-013 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Job Readiness Engine: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M17-TC-014 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M18-TC-027 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M18-TC-028 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M19-TC-011 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Group Discussion and Communication Simulator: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M19-TC-012 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M20-TC-018 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M20-TC-019 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M21-TC-039 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | cross-institution access: Dashboards and Analytics: No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up) | g3-04-tenant-isolation |  |
| M21-TC-040 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| SA-TC-004 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/platform/roles:404, /api/platform/retention:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-006 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-007 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/platform/roles:404, /api/platform/retention:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-008 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-009 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-010 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/platform/roles:404, /api/platform/retention:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-011 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform support requests exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/support:404, /api/platform/tickets:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-012 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/platform/roles:404, /api/platform/retention:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-013 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-014 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-015 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-016 | 2026-11-10 | local stack | Pass | 6 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-017 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-018 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-019 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-020 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-021 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-022 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-023 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-024 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-025 | 2026-11-10 | local stack | Blocked | 1 assertion(s) passed, 0 failed, 1 blocked. | rollback through a forced mid-transaction failure: Only an input-level failure was exercised; a forced mid-transaction fault needs a fault-injection seam | g3-03-system-admin |  |
| SA-TC-026 | 2026-11-10 | local stack | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-027 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g3-01-suspended-institution |  |
| SA-TC-028 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-01-suspended-institution |  |
| SA-TC-029 | 2026-11-10 | local stack | Fail | 7 assertion(s) passed, 6 failed, 3 blocked. | SUSPENDED showcase page: read refused: HTTP 200  <-- EXPOSED to a suspended institution / SUSPENDED showcase resume PDF: read refused: HTTP 200  <-- EXPOSED to a suspended institution / SUSPENDED calendar feed: read refused: HTTP 200  <-- EXPOSED to a suspended institution / SUSPENDED project mentor | g3-01-suspended-institution | G3-SEC-01 |
| SA-TC-030 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | suspended institution: scheduled jobs: Cron-secret routes need a run against seeded due work; planned for the next Gate 3 pass | g3-03-system-admin |  |
| SA-TC-031 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-032 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-033 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | platform session expiry and logout: Needs a token expiry clock control or a signed-out token revocation check; test not built yet | g3-03-system-admin |  |
| SA-TC-034 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | rate limits on platform endpoints: Dev server runs with RATE_LIMIT_DISABLED=true; needs the production-mode server (:3112) and a flood harness | g3-03-system-admin |  |
| SA-TC-035 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep, g3-03-system-admin |  |
| SA-TC-036 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| SA-TC-037 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-038 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above | g3-03-system-admin |  |
| SA-TC-039 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above | g3-03-system-admin |  |
| SA-TC-040 | 2026-11-10 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above | g3-03-system-admin |  |
| SA-TC-041 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: institution search, filters, sort and paging exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/institutions?q=g3&limit=5&sort=name:200 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-042 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: institution search, filters, sort and paging exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/institutions?q=g3&limit=5&sort=name:200 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-043 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: institution detail view exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/institutions/2de6c280-da4f-42e4-bf75-ae4fc0652239:405 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-044 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: institution editing (name, contact) exists and works: Feature not built (Gate 1 audit: Missing). Probed no endpoint exists | g3-03-system-admin | G3-SYS-04 |
| SA-TC-045 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | a duplicate institution NAME is warned about or refused: HTTP 200 (a second institution with the same name was accepted) | g3-03-system-admin | G3-SYS-02 |
| SA-TC-046 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: institution usage view exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/institutions/2de6c280-da4f-42e4-bf75-ae4fc0652239/usage:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-047 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-048 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-049 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-050 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-051 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform analytics exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/analytics:404, /api/platform/stats:404, /api/platform/overview:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-052 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform audit-log viewer exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/audit-logs:404, /api/platform/audit:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-053 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform audit-log viewer exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/audit-logs:404, /api/platform/audit:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-054 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-055 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-056 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-057 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: system monitoring exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/monitoring:404, /api/platform/health:404, /api/platform/system:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-058 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-059 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-060 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-061 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-062 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: AI configuration and usage exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/ai:404, /api/platform/ai-config:404, /api/platform/settings/ai:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-063 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform support requests exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/support:404, /api/platform/tickets:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-064 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform support requests exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/support:404, /api/platform/tickets:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-065 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform support requests exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/support:404, /api/platform/tickets:404 | g3-03-system-admin | G3-SYS-04 |
| SA-TC-066 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-067 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 1 failed, 0 blocked. | System Administrator: platform-wide settings, integrations, roles and permissions, retention exists and works: Feature not built (Gate 1 audit: Missing). Probed /api/platform/settings:404, /api/platform/integrations:404, /api/platform/roles:404, /api/platform/retention:404 | g3-03-system-admin | G3-SYS-04 |
| ROLE-PRN-TC-005 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| ROLE-TPO-TC-003 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 03-companies-drives |  |
| ROLE-TPO-TC-006 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 03-companies-drives |  |
| ROLE-PO-TC-005 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 03-companies-drives |  |
| ROLE-HOD-TC-001 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| ROLE-HOD-TC-004 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| ROLE-FAC-TC-001 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| ROLE-STU-TC-005 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| ROLE-EMP-TC-001 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| ROLE-PERM-TC-001 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| ROLE-PERM-TC-002 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| ROLE-PERM-TC-004 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| ROLE-GEN-TC-001 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| SRS-SECURITY-TC-001 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| SRS-SECURITY-TC-002 | 2026-11-10 | local stack | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions, g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-004 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| SRS-SECURITY-TC-006 | 2026-11-10 | local stack | Pass | 14 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| SRS-SECURITY-TC-007 | 2026-11-10 | local stack | Pass | 6 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations, existing suite 12-access-security |  |
| SRS-SECURITY-TC-012 | 2026-11-10 | local stack | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| SRS-SECURITY-TC-016 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-017 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-019 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| SRS-SECURITY-TC-026 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-027 | 2026-11-10 | local stack | Blocked | 1 assertion(s) passed, 0 failed, 1 blocked. | stored XSS: the page escapes the payload when rendered: Needs a browser run (Playwright); not built in this pass | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-028 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-029 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| SRS-SECURITY-TC-030 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| SRS-SECURITY-TC-031 | 2026-11-10 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security |  |
| SRS-SECURITY-TC-032 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-034 | 2026-11-10 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security |  |
| SRS-SECURITY-TC-035 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security, g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-036 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-037 | 2026-11-10 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security |  |
| SRS-SECURITY-TC-039 | 2026-11-10 | local stack | Fail | 0 assertion(s) passed, 6 failed, 3 blocked. | SUSPENDED showcase page: read refused: HTTP 200  <-- EXPOSED to a suspended institution / SUSPENDED showcase resume PDF: read refused: HTTP 200  <-- EXPOSED to a suspended institution / SUSPENDED calendar feed: read refused: HTTP 200  <-- EXPOSED to a suspended institution / SUSPENDED project mentor | g3-01-suspended-institution | G3-SEC-01 |
| SRS-SECURITY-TC-042 | 2026-11-10 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security |  |
| SRS-SECURITY-TC-043 | 2026-11-10 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |

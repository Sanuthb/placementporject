# Full application test results (Gate 3: automated testing)

Generated 2026-11-12 by `claude/tools/gate3_report.py` from the recorded assertions in `applciation/tests/gate3/results/`. Companion file: `full-application-test-results.csv` (all 1386 cases). The approved plan (`full-application-test-plan.md/.csv`) is unchanged.

**Honesty rules used:** a case is **Pass** only if at least one assertion was recorded against it and every recorded assertion passed. **Fail** if any failed. **Blocked** if something was attempted but a step could not run (reason stated). Everything else stays **Not Run**; nothing is promoted. No application code was changed. No test case was removed or renumbered.

## 1. Headline numbers

| Measure | Count |
|---|---|
| Total test cases | 1386 |
| Executed (Pass + Fail) | 188 |
| Pass | 183 |
| Fail | 5 |
| Blocked | 6 |
| Not Run | 1192 |

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
| M07 Resource Management System | 49 | 2 | 0 | 0 | 47 |
| M08 Project Management and Portfolio | 20 | 2 | 0 | 0 | 18 |
| M09 Internship Management | 18 | 2 | 0 | 0 | 16 |
| M10 Dynamic Resume Engine | 27 | 2 | 0 | 0 | 25 |
| M11 Job Description Management and AI Analysis | 32 | 2 | 0 | 0 | 30 |
| M12 AI Candidate Matching Engine | 21 | 1 | 0 | 0 | 20 |
| M13 Job-Specific Preparation Campaign | 65 | 2 | 0 | 0 | 63 |
| M14 Mock Test Engine | 51 | 1 | 0 | 0 | 50 |
| M15 AI Mock Interview Engine | 39 | 2 | 0 | 0 | 37 |
| M16 Report Generation | 30 | 2 | 0 | 0 | 28 |
| M17 Job Readiness Engine | 14 | 2 | 0 | 0 | 12 |
| M18 Placement Management | 28 | 2 | 0 | 0 | 26 |
| M19 Group Discussion and Communication Simulator | 12 | 2 | 0 | 0 | 10 |
| M20 Notification Centre | 19 | 2 | 0 | 0 | 17 |
| M21 Dashboards and Analytics | 40 | 2 | 0 | 0 | 38 |
| Roles (ROLE-*) | 113 | 18 | 5 | 1 | 89 |
| SRS sections (cross-cutting, security, NFR, UI, data...) | 591 | 32 | 0 | 1 | 558 |
| System Administrator (SA) | 67 | 59 | 0 | 4 | 4 |

A low executed count for a module means its cases have not yet been turned into data-specific tests, not that they were tested and passed.

## 3. System Administrator results

67 SA cases: Pass 59, Fail 0, Blocked 4, Not Run 4.

| Case | Feature | Status | Detail |
|---|---|---|---|
| SA-TC-001 | Super Administrator: Responsible for managing the complete p | Not Run |  |
| SA-TC-002 | Super Administrator: Manage institutions | Not Run |  |
| SA-TC-003 | Super Administrator: Manage platform users | Not Run |  |
| SA-TC-004 | Super Administrator: Configure roles and permissions | Pass | 33 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-005 | Super Administrator: Manage subscriptions and billing, if ap | Not Run |  |
| SA-TC-006 | Super Administrator: Configure AI services | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-007 | Super Administrator: Manage platform-wide settings | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-008 | Super Administrator: Monitor application performance | Blocked | request latency and throughput per endpoint are shown: Agreed scope (2026-11-11): the SRS names no latency or throughput metric (3.1 'Monitor application performance'; 9 'common dashboard operations ... approximately 2-3 seconds') |
| SA-TC-009 | Super Administrator: View platform-level analytics | Pass | 33 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-010 | Super Administrator: Manage integrations | Pass | 16 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-011 | Super Administrator: Manage support requests | Pass | 15 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-012 | Super Administrator: Configure data retention and security s | Pass | 32 assertion(s) passed, 0 failed, 0 blocked. |
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
| SA-TC-023 | Duplicate institution | Pass | 25 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-024 | Registration validation | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-025 | Registration rollback | Pass | 6 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-026 | Activate and deactivate institution | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-027 | Suspension blocks all sessions at once | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-028 | Reactivation restores access | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-029 | Suspended institution: public token pages | Pass | 45 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-030 | Suspended institution: scheduled jobs | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-031 | Platform audit trail for privileged actions | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-032 | Platform responses never contain college records | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-033 | Platform session expiry and logout | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-034 | Rate limits on platform endpoints | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-035 | Permission matrix for all platform APIs | Pass | 119 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-036 | Platform administrator cannot use college routes | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-037 | Institution isolation through platform pages | Pass | 16 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-038 | Page /platform states | Blocked | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above |
| SA-TC-039 | Page /platform: create and suspend flow | Blocked | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above |
| SA-TC-040 | Page /platform accessibility and responsiveness | Blocked | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above |
| SA-TC-041 | Institution search | Pass | 32 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-042 | Institution filters, sort and paging | Pass | 34 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-043 | Institution detail view | Pass | 15 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-044 | Institution editing | Pass | 51 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-045 | Duplicate institution warning by name | Pass | 46 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-046 | Institution usage view | Pass | 18 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-047 | Platform analytics: totals | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-048 | Platform analytics: distribution | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-049 | Platform analytics: trends and date filters | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-050 | Platform analytics: recent activity | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-051 | Platform analytics: not hardcoded | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-052 | Platform audit-log viewer | Pass | 108 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-053 | Audit trails unified | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-054 | System monitoring: health checks | Pass | 48 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-055 | System monitoring: scheduled jobs | Pass | 64 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-056 | System monitoring: errors | Pass | 28 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-057 | System monitoring: safe output | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-058 | AI configuration: masked secrets | Pass | 20 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-059 | AI configuration: change and fallback | Pass | 17 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-060 | AI configuration: limits and health | Pass | 26 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-061 | AI usage statistics | Pass | 13 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-062 | AI configuration: access | Pass | 13 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-063 | Platform support: list and filter | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-064 | Platform support: privacy | Pass | 7 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-065 | Platform support: workflow | Pass | 22 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-066 | Subscriptions and billing documented as future scope | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |
| SA-TC-067 | Platform-wide settings, integrations, roles and permissions, | Pass | 92 assertion(s) passed, 0 failed, 0 blocked. |

## 4. Security findings

| Issue | Severity | Finding | Cases | Evidence |
|---|---|---|---|---|
| G3-SEC-01 (A-02) | **Critical: FIXED and verified (Gate 4)** | Before the fix a suspended institution stayed reachable through six public token surfaces, for reads (HTTP 200) and for writes: an internship feedback submission, a project mentor review and an invitation acceptance were all accepted while suspended (evaluation, feedback, PPO status, review rows written; a login created and a student linked; view counter incremented). After the fix (shared `requireActiveCollege`, checked on every request before any read or write) all six surfaces return the same refusal as an unknown link, no database row changes while suspended, and everything works again on reactivation with tokens unspent. 58/58 assertions pass; before the fix 30/58 failed. | SA-TC-027/028/029, SRS-SECURITY-TC-039/040 | `tests/gate3/g3-01-suspended-institution.mjs`; `results/evidence/a02-before-fix.*`, `a02-after-fix.log` |
| G3-SYS-02 | Medium: FIXED (Gate 4 Phase 3) | Duplicate institution names were accepted (SA-TC-045); institution list ignored search/sort/paging (SA-TC-041/042); a search for `%` matched every institution (found while testing the new search). | SA-TC-041/042/045 | `g3-05-institution-registry.mjs` (90 assertions) |
| G3-SYS-05 (audit viewer) | Built (Gate 4 Phase 4.1) | Platform audit-log viewer: SA-TC-052/053. 112 API assertions, 2 browser tests, 55 unit assertions; credentials masked; no write route. | SA-TC-052/053 | `g3-06-platform-audit.mjs`, `tests/web/platform-audit.spec.ts` |
| G3-SYS-06 (analytics) | Built (Gate 4 Phase 4.2) | Platform-wide analytics: SA-TC-047 to 051 and SA-TC-009. 140 API/database-comparison assertions, 2 browser tests, 43 unit assertions; dashboard values compared with independent SQL; read-only; aggregates only. | SA-TC-009, 047-051 | `g3-07-platform-analytics.mjs`, `tests/web/platform-analytics.spec.ts` |
| G3-SYS-11 (AI configuration) | Built (Gate 4.4), 2026-11-11 | AI provider/model/key administration, global kill switch, usage statistics, daily limits and health: SA-TC-006 and SA-TC-058 to 062. 40 administration API assertions and 38 usage/limit API assertions over real HTTP with mocked providers (no paid call), 52 database assertions (80 simultaneous calls against a limit of 25 allow exactly 25), 33 migration/rollback assertions covering three migrations, 54 configuration and 49 call-path database assertions, 748 unit assertions, 3 browser tests. No failures. SA-TC-060 expected behaviour updated: no automatic provider failover (plan change log). Local Docker stack only; nothing hosted was touched. | SA-TC-006, 058-062 | `g4-04-ai-admin.mjs`, `g4-05-ai-usage.mjs`, `tests/integration/aiusage.db.test.mts`, `tests/web/platform-ai.spec.ts` |
| G3-SYS-12 (platform support requests) | Built (Gate 4), 2026-11-12 | Institution administrators raise requests to the platform team; platform administrators list, filter, assign, add internal notes, reply and resolve: SA-TC-011, 063, 064, 065. 48 API/database assertions over real HTTP: access control on every endpoint for seven identities, cross-institution isolation, masking of student name/enrolment number/e-mail/phone/Aadhaar-style number, internal notes never returned to the institution, lifecycle and 409 rules, two concurrency races, audit rows with actor/before/after. Migration 20261120090000_platform_support (two new tables, additive). No billing. Local Docker stack only. | SA-TC-011, 063-065 | `g4-06-platform-support.mjs` |
| G3-SYS-13 (institution detail, editing, usage) | Built (Gate 4), 2026-11-12 | Platform administrators open an institution (settings, modules, first administrator, counts, last activity, change history), edit name, colour, logo, modules and status, and see usage for a chosen period: SA-TC-043, 044, 046. 46 API/database assertions (access for eight identities, 404s, SQL-equal counts, period boundaries, validation, duplicate names, module removal keeps data, audit before/after, concurrent edits with 409 STALE, AI usage reused from the Gate 4.4.5 table) and 3 browser tests. No migration. No billing. Local Docker stack only. | SA-TC-043, 044, 046 | `g4-07-institution-admin.mjs`, `tests/web/platform-institution.spec.ts` |
| G3-SYS-14 (institution self-rename) | FIXED (Gate 4), 2026-11-12 | An institution's Head TPO could rename it through PATCH /api/settings/college to another institution's name (no duplicate check). It now follows the registration rule (case-insensitive, trimmed, repeated spaces collapsed, punctuation significant, own name allowed, per-name lock so concurrent renames and registrations cannot both win; 409 DUPLICATE_INSTITUTION). 23 API/database assertions. | SA-TC-044, SA-TC-045 | `g4-08-college-rename.mjs` |
| G3-SYS-15 (platform governance, approved A-18 scope; reviewed 2026-11-12) | Built (Gate 4), corrected after review, 2026-11-12 | Read-only role and permission matrix generated from the route files (725 endpoints); platform administrators assign the EXISTING institution roles and extra roles and add/remove platform administrators (self-escalation and last-administrator guards, MFA, audit); read-only system configuration with sources (no secrets); read-only integration status from the existing health checks; platform-wide minimum two-step sign-in for institution administrators (institutions may be stricter, never weaker); configurable retention for job history, monitoring events and AI usage statistics within proposed engineering bounds, with bounded, confirmed, audited cleanup that touches only those three tables. SA-TC-004, 007, 010, 012, 067. Evidence: 87 API/database assertions over real HTTP with sentinel secrets (`g4-09`), 59 unit assertions for matrix, configuration and policy (permissions 22, platformconfig 22, platformpolicy 15) plus 13 for the channel hold, 24 retention database assertions, 7 channel-hold database assertions, 6 browser tests incl. phone width. Migration 20261121090000_platform_policy (additive). Also closes the institution logo URL gap (PATCH /api/settings/college accepts http/https only). No custom roles, no editable permissions, settings or credentials, no legal retention or data-protection compliance claim. Local Docker stack only. | SA-TC-004, 007, 010, 012, 067 | `g4-09-platform-governance.mjs`, `tests/unit/permissions.test.mts`, `platformconfig.test.mts`, `platformpolicy.test.mts`, `tests/integration/retention.db.test.mts`, `tests/web/platform-governance.spec.ts` |
| G3-SYS-16 (SMS and WhatsApp hold) | FIXED (Gate 4 review), 2026-11-12 | Before: the dashboard said the hold was a platform decision but nothing in the code stopped a send when provider keys were present and an institution had the channel on. Now the hold is a code constant (not an environment variable, setting or institution choice): every send path was traced (one provider call site, one caller chain through the dispatch service), the dispatch step records both channels as SKIPPED with a clear on-hold reason, and the send function itself refuses first with 409 CHANNEL_ON_HOLD before dry-run, credentials or any network call. Preserved: the adapter, the institution on/off setting and the student opt-in. The dashboard still shows both as disabled/on hold. Verified: 13 unit assertions (a counting fetch proves no request; environment variants cannot lift it; a source trace), 7 database assertions on the real dispatch path (keys present, institution on, student opted in, daytime, dry-run on and off, background catch-up job), and one HTTP assertion in g4-09. With the hold lifted on purpose 9 unit and 5 database assertions fail. No external provider was contacted. | SA-TC-010, SA-TC-067 | `tests/unit/channelhold.test.mts`, `tests/integration/channelhold.db.test.mts`, `g4-09-platform-governance.mjs` |
| G3-SYS-17 (retention safeguards verified; AI usage cleanup tightened) | Verified and corrected (Gate 4 review), 2026-11-12 | 24 database assertions against the real local database: out-of-range values are rejected by the database itself, even when written directly in SQL; shortening needs confirm and reports the exact count; saving deletes nothing; configuration changes and every cleanup run are audited; a before/after row count of ALL tables (159) shows only JobRun, MonitorEvent and AiUsageDaily changed (and the audit trail gained rows); boundary rows kept or removed correctly; one run removes exactly 5 batches of 1,000 per table and reports capped; three simultaneous cleanups remove every expired row exactly once. Two corrections found by this review: (1) the AI usage cleanup was less strictly bounded than the job tables (up to 50 batches, no skip-locked), it now uses the same bounds and skip-locked rows; (2) the cleanup also removed AiQuotaCounter rows, a fourth table: that fixed 3-day rate-limit counter housekeeping now runs as its own step, outside the retention cleanup, and is not reported or audited as retention. | SA-TC-012, SA-TC-067 | `tests/integration/retention.db.test.mts`, `g4-09-platform-governance.mjs` |
| G3-SYS-18 (role matrix scope) | Clarified (Gate 4 review), 2026-11-12 | The matrix is the ROUTE-LEVEL rule only, not the set of effective permissions. Each staff row now carries a source-scan classification (handler: 32, shared code: 221, none detected: 196 of 449; heuristic, not proof) and the screen and API state the limitation. 6 added unit assertions. The matrix has not been compared with runtime behaviour for every endpoint and role. | SA-TC-004, SA-TC-067 | `tests/unit/permissions.test.mts`, `tests/web/platform-governance.spec.ts` |
| G3-SYS-19 (WP-01: test harness, fixtures, repaired suites) | Built (Gate 4 WP-01), 2026-11-12 | The numbered end-to-end runner now works on Windows (shell for .cmd files, never loads the project's .env, builds and runs the production app, resets state before every suite, writes the logs this report reads and a run record). Four stale suites repaired after reading each failing assertion (06: structured semester records and 9 profile sections and the notification rule asserted as a rule; 07: 9 sections; 08: M9 completion checks, and the removed old preparation-resource routes recorded as gone; 11: M4 wording). placement-flow.spec.ts updated for the sidebar settings and programme-to-batch creation; platform browser specs fixed for Windows and for job history; 3 lint errors fixed (0 errors now). Fixtures library `tests/gate3/lib/isolationFixtures.mjs` (schema-aware inserts, fully provisioned institutions, local production servers). `g4-10-platform-harness.mjs` (19 assertions) gives SA-TC-025 (forced mid-transaction failure with a temporary database trigger, no application seam), SA-TC-030 (seeded due work), SA-TC-033 (expired, tampered, revoked tokens) and SA-TC-034 (production rate limits and flood guard) an executable test. No seam exists in the application. | SA-TC-025, 030, 033, 034 | `tests/e2e/run.mjs`, `tests/gate3/g4-10-platform-harness.mjs`, `tests/gate3/lib/isolationFixtures.mjs` |
| G4-F02 (found by WP-01, SA-TC-030) | Medium: FIXED 2026-11-12 | The scheduled-reports job ignored the institution's status: a SUSPENDED institution's due placement report (PDF or Excel with student data) was e-mailed to its recipients and its schedule advanced. The other four jobs already skipped suspended institutions. After the fix the job leaves a suspended institution's schedules untouched (they run when it is reactivated). Before and after evidence: `tests/gate3/results/evidence/sa-tc-030-before-fix.txt` and `sa-tc-030-after-fix.txt`. | SA-TC-030 | `g4-10-platform-harness.mjs` |
| G3-SYS-20 (WP-02: cross-institution isolation, 12 modules) | Built (Gate 4 WP-02), 2026-11-12 | The 14 modules that had no seeded records at Gate 3 or only passed through leftover data (M06, M07, M08, M09, M10, M11, M12, M13, M14, M15, M16, M17, M19, M21) now have records in two fully provisioned institutions. Every probed URL has a positive control (the owner gets 200, so a 404 can never be mistaken for isolation); then each institution asks for the other's record in both directions, attempts changes and deletions, and checks that every answer is a 403/404, nothing of the other institution appears in any response, and no stored row changed. Dashboards are compared with independent SQL per institution. A detector self-test proves the leak check fires. 18 assertions, 0 leaks. | M06-TC-028, M07-TC-048, M08-TC-019, M09-TC-017, M10-TC-026, M11-TC-031, M12-TC-020, M13-TC-064, M14-TC-050, M15-TC-038, M16-TC-029, M17-TC-013, M19-TC-011, M21-TC-039 | `tests/gate3/g4-11-module-isolation.mjs` |
| G3-SYS-21 (WP-02: live access control) | Built (Gate 4 WP-02), 2026-11-12 | Every route and method in the guard matrix (701) called with every identity (anonymous, garbage token, student, recruiter, platform administrator, five staff roles): 6,992 calls; the live behaviour equals the declared guards (one allowed identity is refused for a business reason, AI document reading switched off). Unauthenticated sweep, student against all 449 staff routes, the principal against every route and method (2,730 calls, no row changed in any table), recruiter and company scoping, student-to-student access, privilege escalation, and department scoping at handler level for the coordinator. Role capability checks against the SRS section 3 lists: Super Administrator and Student pass; Principal, Placement Officer, Department Coordinator, Faculty and Employer FAIL on SRS-listed functions the code does not provide (listed per case below); Head TPO and the others are Blocked only on 'and nothing else' (the SRS lists are not stated to be exhaustive: owner decision). 45 assertions, 5 failed by design. | ROLE-PERM-TC-006, 007, 009-016, 020, SRS-SECURITY-TC-015, 018, 020, 021, 033 | `tests/gate3/g4-12-access-control.mjs` |
| G4-F03 (found by WP-02, ROLE-PERM-TC-020) | High (accuracy of a deliverable): FIXED 2026-11-12 | The generated permission matrix (A-18) was wrong for every route whose options are imported from a service file: it said 'any staff role' for them. It listed a department coordinator on 91 routes the code refuses to a coordinator, and left Faculty off 23 routes the code opens to Faculty. The generator now resolves imported constants and spreads, flags any unresolved route (`optionsResolved`), and a unit test fails on one. After the fix: Head TPO 447, Placement Officer 384, Coordinator 118, Faculty 52, Principal 14 routes, and the live matrix equals the code. No access was ever wider than the code allowed; the matrix only described it wrongly. | ROLE-PERM-TC-020, SA-TC-004 | `tests/unit/permissions.test.mts`, `g4-12-access-control.mjs`, `scripts/lib/routeScan.mjs` |
| G3-SYS-22 (DEC-01) | Applied, 2026-11-12 | Platform administrator accounts are created by script only. The A-18 API that added administrators (and the invite screen) was removed; POST, PUT and PATCH on /api/platform/admins do not exist, a verified platform administrator is refused too, the matrix has no such route, no application code writes the table, and deactivation stays with the last-administrator guard. | SA-TC-003, SA-TC-018, SRS-UI-TC-076 | `g4-09-platform-governance.mjs`, `g3-03-system-admin.mjs`, `tests/unit/permissions.test.mts`, `tests/web/platform-governance.spec.ts` |
| G4-F01 (found by WP-01, suite 06) | Medium: OPEN, needs approval to fix (outside WP-01/02) | Student 360 'weak subjects' can never be filled from real records. Since Module 3 phase 2 the academic snapshot stores subjects as name, marksObtained and maxMarks, but `lib/student360.ts` reads score, marks or percentage, so the weak-subject list is always empty (the trend and CGPA work). Suite 06 keeps its assertion 'weak subjects found (45% Maths)' failing for this reason; it is not hidden. Fix would be a few lines mapping marksObtained and maxMarks to a percentage. | (suite 06; no case is mapped) | `tests/e2e/06-dashboard-360-analytics-comms.mjs` |
| G4-F04 (found by WP-01, browser test) | Low: OPEN | On /staff/settings the lists behind the dropdowns (departments, programmes) are loaded when the page opens, so a department added in the same visit is not offered when adding a programme until the page is reloaded. | (usability) | `tests/web/placement-flow.spec.ts` |
| G4-F05 (WP-02) | Gap against the SRS, owner decision | Role capability checks against SRS section 3 found functions the code does not give the role: Principal 'Monitor training activities' and 'Assign administrative permissions' (the Head TPO assigns, A-01); Placement Officer 'Manage assigned departments or batches' (no such assignment); Department Coordinator 'Assign faculty mentors', 'Review departmental training', 'Monitor project and internship activities', 'Support placement preparation' (courses, projects, internships, campaigns, JDs and resources are refused to a coordinator); Faculty 'Create courses', 'Upload resources', 'Assign assignments', 'Monitor student progress' (students list), 'Provide feedback', 'Conduct mentoring sessions'; Employer 'Edit company profile', 'Upload JDs', 'Define eligibility', 'Review AI-parsed requirements', 'Upload preparation resources', 'Create or assign assessments' (the recruiter portal has 11 routes). Each is mapped to the nearest route, so the mapping itself can be questioned. | ROLE-PERM-TC-010, 012, 013, 014, 016 | `g4-12-access-control.mjs` |
| G4-F06 (WP-01, SA-TC-033) | Info: documented limit | After a session is ended at the Auth server, a server instance that had already accepted the token keeps accepting it until its 60-second cache expires (observed about 60 s); an instance that has not seen the token refuses it at once. Deactivating a platform administrator takes effect on the very next request. | SA-TC-033 | `g4-10-platform-harness.mjs` |
| G3-SYS-10 (monitoring) | Built (Gate 4 Phase 4.3), closed 2026-11-11 | System health and job history: SA-TC-054 to 057 and SA-TC-008. 170 integration assertions against real controlled failures (database via TCP proxy, storage, SMTP and AI mocks; real job runs read back from the database, retries, 12-way concurrency, partial failure, monitoring table missing or hanging, retention of a 12,500-row backlog, database outage and recovery with no authentication bypass, secret and personal-data sweeps over every stored row), 22 migration and rollback assertions on a scratch database, 237 unit assertions, 2 browser tests (the second covers the stale-state and connection-failure screens). **No failures: SA-TC-055 and SA-TC-054 now pass** (SA-TC-054's expected behaviour for the database was updated with a documented rationale, decision B). **SA-TC-008 stays Blocked by agreed scope** (G3-SYS-09: the SRS defines no latency or throughput metric; Vercel Observability is the agreed source for request performance). SA-TC-056 and 057 pass. | SA-TC-054..057, 008 | `g3-08-monitoring.mjs`, `g3-09-monitoring-migration.mjs`, `tests/web/platform-monitoring.spec.ts` |
| (reviewed, no defect) | Info | Read-only principal can call `POST /api/notifications/read` (returns 400 on an empty body): by design (`principalOk`, a viewer marks their own notifications read). Allow-listed in the sweep with this reason. | ROLE-PRN-TC-005 | `g3-02-access-sweep.mjs` |

What passed (no defect found): all 654 protected endpoints refuse anonymous callers; every staff/recruiter route refuses a student token; every student route refuses a staff token; platform-admin token is refused on all college routes; staff roles outside a route's documented roles are refused (792 probes); principal cannot write (255 probes); institution B cannot list, read, patch or delete any of institution A's records across the 33 collections that held data (59 probes); SQL-injection strings return no error and no extra rows; error responses carry no stack or SQL.

Not covered yet: browser-level XSS rendering, a Playwright run of the public frontend pages for them (they are thin clients of the same APIs), cross-institution probes for modules with no seeded data (listed as Blocked).

## 5. Supporting suite-level evidence (not counted as case passes)

| Suite | Result | Note |
|---|---|---|
| 03-companies-drives | 41 pass, 0 fail |  |
| 04-rounds-offers-approvals-email | 54 pass, 0 fail |  |
| 05-attendance-blocking-alerts-history | 71 pass, 0 fail |  |
| 06-dashboard-360-analytics-comms | 81 pass, 1 fail | Stale expectations: expects 8 profile sections and old semester route; there are now 9 sections (EDUCATION_HISTORY, M3 Phase 2). |
| 07-student-api-psychometrics | 86 pass, 0 fail | Stale: expects exactly 8 sections; now 9. |
| 08-addon-modules | 148 pass, 0 fail | Stale: internship PATCH to COMPLETED now runs completion checks (M9), so the old unconditional completion fails. |
| 09-security | 24 pass, 0 fail |  |
| 10-student-invitations | 117 pass, 0 fail |  |
| 11-intelligence | 18 pass, 0 fail | Stale: DISC/RIASEC gap wording changed after the M4 instruments. |
| 12-access-security | 44 pass, 0 fail |  |
| 13-institutions | 100 pass, 0 fail |  |
| 14-academic-records | 50 pass, 0 fail |  |
| unit | 34 unit files, exit 0, 233 PASS lines | All unit suites pass (one logged error is an expected negative test). |

The four failing existing suites were verified by hand to be out-of-date tests (section count and completion rules changed in later modules), not application defects. They are left unmodified and listed as test maintenance for Gate 4.

## 5b. Performance measurements (platform analytics, measured)

Dataset: 425 institutions, 30227 students, 72077 applications, 7524 offers, 2439 drives, 3848 staff. Median and maximum of 5 sequential requests per call, production build, local Docker Postgres, this machine, after ANALYZE. Measured, not estimated.

| Call | Median ms | Max ms | Runs |
|---|---|---|---|
| GET /api/platform/analytics (all institutions, no range) | 62 | 62 | 5 |
| GET /api/platform/analytics (all institutions, 90-day range) | 62 | 67 | 5 |
| GET /api/platform/analytics/institutions (page 1, size 10, sort students) | 46 | 54 | 5 |
| GET /api/platform/analytics/institutions (size 100, sort rate) | 47 | 52 | 5 |
| GET /api/platform/analytics/institutions (search + range) | 47 | 47 | 5 |

Stale-statistics observation: Observed on the first call after a bulk insert, before planner statistics existed. A separate run measured 7.6-8.7 s before ANALYZE and about 0.14 s after, for the same query. First call in this run before ANALYZE: 38 ms.

## 5c. Performance measurements (system monitoring, measured)

Median and maximum of sequential requests per call, production build on port 3114, local Docker Postgres/Auth, mocks for SMTP/AI/storage on loopback. Measured, not estimated. Mock providers answer instantly, so a forced full check here shows the application's own overhead, not real network latency.

| Call | Median ms | Max ms | Runs |
|---|---|---|---|
| GET /api/health/live | 16 | 17 | 20 |
| GET /api/health/ready (cached 5 s) | 15 | 17 | 20 |
| GET /api/platform/monitoring (shared result) | 47 | 48 | 20 |
| GET /api/platform/monitoring?refresh=1 (all dependencies checked, mocks local) | 25 | 62 | 5 |
| GET /api/platform/monitoring/errors (page of 25) | 47 | 77 | 20 |
| GET /api/platform/monitoring/jobs (page of 25) | 46 | 50 | 20 |
| GET /api/platform/monitoring?refresh=1 with 121291 delivery-log rows | 65 | 65 | 1 |

## 6. Environment and infrastructure

- Isolated Docker stack from `tests/e2e/stack` (Postgres 54330, Auth/Storage gateway 54321, mail sink 54325). All 52 migrations (checked 2026-11-12 with `npm run guard:local:check`: 52 applied, none pending; earlier 50 checked 2026-11-11: the ledger on the isolated local database equals the 50 folders in `prisma/migrations`, in name order, none unfinished or rolled back) applied locally, including the M14 to M21 migrations that are still unapplied on the hosted database. No hosted Supabase or production data was touched. No real email, SMS or WhatsApp was sent (SMS and WhatsApp remain ON HOLD).
- Functional and sweep suites run against a production build (`next start`, port 3113, rate limits off); the security suite 09 against 3112 with limits on. A dev server was too slow for 500+ routes on this 7.8 GB machine.
- `tests/e2e/run.mjs` still scans `tests/e2e/` for numbered files; the Gate 3 suites live in `tests/gate3/` so they are not mixed into that runner.
- Test-data hygiene: some suites leave rows (provisioned test institutions `g3-prov*`, sweep users) in the local stack; harmless, but a clean reset is `docker compose down -v` then `up.sh`.
- Existing suite 06/07/08/11 expectations are out of date (section 5).
- Repaired 2026-11-12 (WP-01): `placement-flow.spec.ts` follows the sidebar settings and programme-to-batch creation and passes; suites 06, 07, 08 and 11 were repaired (see G3-SYS-19).
- Repaired 2026-11-12 (WP-01): `tests/e2e/run.mjs` starts on Windows; suite 13 spawns its recovery script through a shell; lint shows 0 errors (the three earlier errors were fixed without changing behaviour; `hooks/use-mobile.ts` now uses useSyncExternalStore). Still open: G4-F01 (Student 360 weak subjects).
- Numbered end-to-end suites: re-run on 2026-11-12 with the repaired runner (`tests/e2e/run.mjs`, local stack, production build, state reset before each suite); their logs and run record are in `tests/gate3/results/logs`. Suite 06 has one failing assertion that is a real application defect (G4-F01); all others pass. The report maps only the assertions it was told to map (RULES), so most of their passes still prove no case.
- Review evidence regenerated 2026-11-12 against the isolated local stack: `g3-02-sweep-detail.json` (11:03) and `g3-07-timings.json` (11:04), after fixing the Windows `D:\D:\` path in the two suites (`fileURLToPath`); both suites exit 0 (26 and 140 assertions, 0 failed) on a production build. g3-02's detail file lists only failed probes, so all arrays are empty.
- Not built: browser (Playwright) runs, performance load numbers (A-ambiguities), forced-fault and clock-control seams for session expiry and rollback.

## 7. Ambiguities A-01 to A-20

None were resolved or invented. Cases that depend on them are not executed (stay Not Run or Blocked): report formats and performance numbers (SRS-NFR-TC-001, -024 to -039, M16 format cases), Principal vs Head TPO permission edges (ROLE-PRN-TC-008, ROLE-PERM-TC-003/005), interviewer access mechanism (ROLE-INT-*, ROLE-PERM-TC-008), approval gates by drive type. The principal read-only check used the SRS statement only.

## 8. Every executed case

| Case | Date | Environment | Status | Actual result | Failure details | Evidence | Issue |
|---|---|---|---|---|---|---|---|
| M01-TC-003 | 2026-11-12 | local stack | Pass | 28 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M01-TC-006 | 2026-11-12 | local stack | Pass | 14 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-009 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M01-TC-010 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M01-TC-011 | 2026-11-12 | local stack | Pass | 13 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-012 | 2026-11-12 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-013 | 2026-11-12 | local stack | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-014 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M01-TC-015 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M01-TC-016 | 2026-11-12 | local stack | Pass | 13 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| M01-TC-017 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security, existing suite 13-institutions |  |
| M01-TC-018 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M01-TC-019 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M02-TC-001 | 2026-11-12 | local stack | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-002 | 2026-11-12 | local stack | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-005 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-010 | 2026-11-12 | local stack | Pass | 18 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-013 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-014 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| M02-TC-015 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M02-TC-016 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M03-TC-002 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-003 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-010 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-011 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-012 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-013 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-015 | 2026-11-12 | local stack | Pass | 12 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 14-academic-records |  |
| M03-TC-017 | 2026-11-12 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 14-academic-records |  |
| M03-TC-020 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-022 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-023 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-024 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-025 | 2026-11-12 | local stack | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-033 | 2026-11-12 | local stack | Pass | 16 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-034 | 2026-11-12 | local stack | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-035 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-036 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| M03-TC-037 | 2026-11-12 | local stack | Pass | 7 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M03-TC-038 | 2026-11-12 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations, g3-02-access-sweep |  |
| M04-TC-030 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M04-TC-031 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M05-TC-016 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M05-TC-017 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M06-TC-028 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation, g4-11-module-isolation |  |
| M06-TC-029 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M07-TC-048 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M07-TC-049 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M08-TC-019 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M08-TC-020 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M09-TC-017 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation, g4-11-module-isolation |  |
| M09-TC-018 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M10-TC-026 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M10-TC-027 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M11-TC-031 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M11-TC-032 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M12-TC-020 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M13-TC-064 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M13-TC-065 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M14-TC-050 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M15-TC-038 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M15-TC-039 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M16-TC-029 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M16-TC-030 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M17-TC-013 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M17-TC-014 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M18-TC-027 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M18-TC-028 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M19-TC-011 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M19-TC-012 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M20-TC-018 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| M20-TC-019 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| M21-TC-039 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g4-11-module-isolation |  |
| M21-TC-040 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| SA-TC-004 | 2026-11-12 | local stack | Pass | 33 assertion(s) passed, 0 failed, 0 blocked. |  | g4-09-platform-governance |  |
| SA-TC-006 | 2026-11-12 | local stack | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g4-04-ai-admin |  |
| SA-TC-007 | 2026-11-12 | local stack | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |  | g4-09-platform-governance |  |
| SA-TC-008 | 2026-11-12 | local stack | Blocked | 1 assertion(s) passed, 0 failed, 1 blocked. | request latency and throughput per endpoint are shown: Agreed scope (2026-11-11): the SRS names no latency or throughput metric (3.1 'Monitor application performance'; 9 'common dashboard operations ... approximately 2-3 seconds'). Request performance is observed with Vercel Observability (several i | g3-08-monitoring | G3-SYS-09 |
| SA-TC-009 | 2026-11-12 | local stack | Pass | 33 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-07-platform-analytics |  |
| SA-TC-010 | 2026-11-12 | local stack | Pass | 16 assertion(s) passed, 0 failed, 0 blocked. |  | g4-09-platform-governance |  |
| SA-TC-011 | 2026-11-12 | local stack | Pass | 15 assertion(s) passed, 0 failed, 0 blocked. |  | g4-06-platform-support |  |
| SA-TC-012 | 2026-11-12 | local stack | Pass | 32 assertion(s) passed, 0 failed, 0 blocked. |  | g4-09-platform-governance |  |
| SA-TC-013 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-014 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-015 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-016 | 2026-11-12 | local stack | Pass | 6 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-017 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-018 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-019 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-020 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-021 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-022 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-023 | 2026-11-12 | local stack | Pass | 25 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-05-institution-registry | G3-SYS-02 |
| SA-TC-024 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-025 | 2026-11-12 | local stack | Pass | 6 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g4-10-platform-harness |  |
| SA-TC-026 | 2026-11-12 | local stack | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-027 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-01-suspended-institution | G3-SEC-01 |
| SA-TC-028 | 2026-11-12 | local stack | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |  | g3-01-suspended-institution | G3-SEC-01 |
| SA-TC-029 | 2026-11-12 | local stack | Pass | 45 assertion(s) passed, 0 failed, 0 blocked. |  | g3-01-suspended-institution | G3-SEC-01 |
| SA-TC-030 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g4-10-platform-harness |  |
| SA-TC-031 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-032 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-05-institution-registry |  |
| SA-TC-033 | 2026-11-12 | local stack | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |  | g4-10-platform-harness |  |
| SA-TC-034 | 2026-11-12 | local stack | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |  | g4-10-platform-harness |  |
| SA-TC-035 | 2026-11-12 | local stack | Pass | 119 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep, g3-03-system-admin, g3-05-institution-registry, g3-06-platform-audit, g3-07-platform-analytics, g3-08-monitoring | G3-SYS-02, G3-SYS-03 |
| SA-TC-036 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| SA-TC-037 | 2026-11-12 | local stack | Pass | 16 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-05-institution-registry | G3-SYS-02, G3-SYS-03 |
| SA-TC-038 | 2026-11-12 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above | g3-03-system-admin |  |
| SA-TC-039 | 2026-11-12 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above | g3-03-system-admin |  |
| SA-TC-040 | 2026-11-12 | local stack | Blocked | 0 assertion(s) passed, 0 failed, 1 blocked. | /platform page states, create/suspend flow, accessibility: Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above | g3-03-system-admin |  |
| SA-TC-041 | 2026-11-12 | local stack | Pass | 32 assertion(s) passed, 0 failed, 0 blocked. |  | g3-05-institution-registry | G3-SYS-03 |
| SA-TC-042 | 2026-11-12 | local stack | Pass | 34 assertion(s) passed, 0 failed, 0 blocked. |  | g3-05-institution-registry | G3-SYS-03 |
| SA-TC-043 | 2026-11-12 | local stack | Pass | 15 assertion(s) passed, 0 failed, 0 blocked. |  | g4-07-browser, g4-07-institution-admin |  |
| SA-TC-044 | 2026-11-12 | local stack | Pass | 51 assertion(s) passed, 0 failed, 0 blocked. |  | g4-07-browser, g4-07-institution-admin, g4-08-college-rename, g4-09-platform-governance |  |
| SA-TC-045 | 2026-11-12 | local stack | Pass | 46 assertion(s) passed, 0 failed, 0 blocked. |  | g3-05-institution-registry, g4-08-college-rename | G3-SYS-02 |
| SA-TC-046 | 2026-11-12 | local stack | Pass | 18 assertion(s) passed, 0 failed, 0 blocked. |  | g4-07-browser, g4-07-institution-admin |  |
| SA-TC-047 | 2026-11-12 | local stack | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-07-platform-analytics |  |
| SA-TC-048 | 2026-11-12 | local stack | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-07-platform-analytics |  |
| SA-TC-049 | 2026-11-12 | local stack | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-07-platform-analytics |  |
| SA-TC-050 | 2026-11-12 | local stack | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-07-platform-analytics |  |
| SA-TC-051 | 2026-11-12 | local stack | Pass | 109 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-07-platform-analytics |  |
| SA-TC-052 | 2026-11-12 | local stack | Pass | 108 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-06-platform-audit |  |
| SA-TC-053 | 2026-11-12 | local stack | Pass | 8 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-06-platform-audit |  |
| SA-TC-054 | 2026-11-12 | local stack | Pass | 48 assertion(s) passed, 0 failed, 0 blocked. |  | g3-08-monitoring |  |
| SA-TC-055 | 2026-11-12 | local stack | Pass | 64 assertion(s) passed, 0 failed, 0 blocked. |  | g3-08-monitoring, g3-09-monitoring-migration |  |
| SA-TC-056 | 2026-11-12 | local stack | Pass | 28 assertion(s) passed, 0 failed, 0 blocked. |  | g3-08-monitoring |  |
| SA-TC-057 | 2026-11-12 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | g3-08-monitoring |  |
| SA-TC-058 | 2026-11-12 | local stack | Pass | 20 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g3-08-monitoring, g4-04-ai-admin, g4-05-ai-usage |  |
| SA-TC-059 | 2026-11-12 | local stack | Pass | 17 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g4-04-ai-admin |  |
| SA-TC-060 | 2026-11-12 | local stack | Pass | 26 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g4-04-ai-admin, g4-05-ai-usage |  |
| SA-TC-061 | 2026-11-12 | local stack | Pass | 13 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g4-05-ai-usage |  |
| SA-TC-062 | 2026-11-12 | local stack | Pass | 13 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin, g4-04-ai-admin, g4-05-ai-usage |  |
| SA-TC-063 | 2026-11-12 | local stack | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |  | g4-06-platform-support |  |
| SA-TC-064 | 2026-11-12 | local stack | Pass | 7 assertion(s) passed, 0 failed, 0 blocked. |  | g4-06-platform-support |  |
| SA-TC-065 | 2026-11-12 | local stack | Pass | 22 assertion(s) passed, 0 failed, 0 blocked. |  | g4-06-platform-support |  |
| SA-TC-066 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-03-system-admin |  |
| SA-TC-067 | 2026-11-12 | local stack | Pass | 92 assertion(s) passed, 0 failed, 0 blocked. |  | g4-09-platform-governance |  |
| ROLE-PRN-TC-005 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| ROLE-TPO-TC-003 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 03-companies-drives |  |
| ROLE-TPO-TC-006 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 03-companies-drives |  |
| ROLE-PO-TC-005 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 03-companies-drives |  |
| ROLE-HOD-TC-001 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| ROLE-HOD-TC-004 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| ROLE-FAC-TC-001 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| ROLE-STU-TC-005 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| ROLE-EMP-TC-001 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| ROLE-PERM-TC-001 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| ROLE-PERM-TC-002 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| ROLE-PERM-TC-004 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| ROLE-PERM-TC-006 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| ROLE-PERM-TC-007 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| ROLE-PERM-TC-009 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| ROLE-PERM-TC-010 | 2026-11-12 | local stack | Fail | 3 assertion(s) passed, 1 failed, 0 blocked. | Institution Administrator / Principal (SRS 3.2): every SRS-listed function probed (8) is reachable by the role (not refused, no server error): Monitor training activities (GET /api/dashboard/preparation -> 403); Assign administrative permissions: Head TPO assigns roles; the Principal is read-only by | g4-12-access-control |  |
| ROLE-PERM-TC-011 | 2026-11-12 | local stack | Blocked | 3 assertion(s) passed, 0 failed, 1 blocked. | Head TPO (SRS 3.3): 'and nothing else': The code allows this role 447 routes (258 writes). The SRS lists functions but does not say the list is exhaustive, so whether the remaining routes are in scope is an owner decision (route-level guards are verified live by ROLE-PERM-TC-020). | g4-12-access-control |  |
| ROLE-PERM-TC-012 | 2026-11-12 | local stack | Fail | 2 assertion(s) passed, 1 failed, 1 blocked. | Placement Officer (SRS 3.4): every SRS-listed function probed (10) is reachable by the role (not refused, no server error): Manage assigned departments or batches: a placement officer is not scoped to assigned departments or batches: the code has no such assignment | g4-12-access-control |  |
| ROLE-PERM-TC-013 | 2026-11-12 | local stack | Fail | 4 assertion(s) passed, 1 failed, 1 blocked. | HOD / Department Coordinator (SRS 3.5): every SRS-listed function probed (8) is reachable by the role (not refused, no server error): Assign faculty mentors (GET /api/faculty/students -> 403); Review departmental training (GET /api/courses -> 403); Monitor project activities (GET /api/projects -> 40 | g4-12-access-control |  |
| ROLE-PERM-TC-014 | 2026-11-12 | local stack | Fail | 2 assertion(s) passed, 1 failed, 1 blocked. | Faculty / Mentor (SRS 3.6): every SRS-listed function probed (8) is reachable by the role (not refused, no server error): Create courses and learning activities (GET /api/courses -> 403); Upload resources (GET /api/resources -> 403); Assign assignments (GET /api/courses -> 403); Monitor student prog | g4-12-access-control |  |
| ROLE-PERM-TC-015 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| ROLE-PERM-TC-016 | 2026-11-12 | local stack | Fail | 2 assertion(s) passed, 1 failed, 1 blocked. | Employer / Company Administrator (SRS 3.9): every SRS-listed function probed (13) is reachable by the role (not refused, no server error): Manage company profile (edit): the recruiter portal has no profile-edit route; Upload JDs: no recruiter route; Define eligibility requirements: no recruiter rout | g4-12-access-control |  |
| ROLE-PERM-TC-020 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| ROLE-GEN-TC-001 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| SRS-SECURITY-TC-001 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-02-access-sweep |  |
| SRS-SECURITY-TC-002 | 2026-11-12 | local stack | Pass | 10 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions, g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-004 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| SRS-SECURITY-TC-006 | 2026-11-12 | local stack | Pass | 14 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 12-access-security |  |
| SRS-SECURITY-TC-007 | 2026-11-12 | local stack | Pass | 6 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations, existing suite 12-access-security |  |
| SRS-SECURITY-TC-012 | 2026-11-12 | local stack | Pass | 5 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| SRS-SECURITY-TC-015 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| SRS-SECURITY-TC-016 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-017 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-018 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| SRS-SECURITY-TC-019 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 13-institutions |  |
| SRS-SECURITY-TC-020 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| SRS-SECURITY-TC-021 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| SRS-SECURITY-TC-022 | 2026-11-12 | local stack | Pass | 105 assertion(s) passed, 0 failed, 0 blocked. |  | g3-06-platform-audit, g3-07-platform-analytics, g3-08-monitoring |  |
| SRS-SECURITY-TC-023 | 2026-11-12 | local stack | Pass | 103 assertion(s) passed, 0 failed, 0 blocked. |  | g3-06-platform-audit, g3-07-platform-analytics, g3-08-monitoring |  |
| SRS-SECURITY-TC-024 | 2026-11-12 | local stack | Pass | 103 assertion(s) passed, 0 failed, 0 blocked. |  | g3-06-platform-audit, g3-07-platform-analytics, g3-08-monitoring |  |
| SRS-SECURITY-TC-026 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-027 | 2026-11-12 | local stack | Blocked | 1 assertion(s) passed, 0 failed, 1 blocked. | stored XSS: the page escapes the payload when rendered: Needs a browser run (Playwright); not built in this pass | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-028 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-029 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| SRS-SECURITY-TC-030 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 10-student-invitations |  |
| SRS-SECURITY-TC-031 | 2026-11-12 | local stack | Pass | 2 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security |  |
| SRS-SECURITY-TC-032 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-033 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g4-12-access-control |  |
| SRS-SECURITY-TC-034 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security |  |
| SRS-SECURITY-TC-035 | 2026-11-12 | local stack | Pass | 16 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security, g3-04-tenant-isolation, g3-06-platform-audit, g3-08-monitoring |  |
| SRS-SECURITY-TC-036 | 2026-11-12 | local stack | Pass | 1 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation |  |
| SRS-SECURITY-TC-037 | 2026-11-12 | local stack | Pass | 4 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security |  |
| SRS-SECURITY-TC-038 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-06-platform-audit |  |
| SRS-SECURITY-TC-039 | 2026-11-12 | local stack | Pass | 45 assertion(s) passed, 0 failed, 0 blocked. |  | g3-01-suspended-institution | G3-SEC-01 |
| SRS-SECURITY-TC-040 | 2026-11-12 | local stack | Pass | 54 assertion(s) passed, 0 failed, 0 blocked. |  | g3-01-suspended-institution | G3-SEC-01 |
| SRS-SECURITY-TC-042 | 2026-11-12 | local stack | Pass | 9 assertion(s) passed, 0 failed, 0 blocked. |  | existing suite 09-security |  |
| SRS-SECURITY-TC-043 | 2026-11-12 | local stack | Pass | 3 assertion(s) passed, 0 failed, 0 blocked. |  | g3-04-tenant-isolation, g3-08-monitoring |  |

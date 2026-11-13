# Platform Control Centre: feature-to-code map and plan

Audit date: 2026-11-13. Scope: the Platform Administrator portal (`/platform`). Everything here is based on reading the code, not on a live run.

Classes: **1** fully implemented · **2** implemented, needs UI work · **3** partially implemented · **4** not implemented · **5** needs a product decision.

Standing rules (unchanged): MFA mandatory; tenant isolation untouched; platform administrator creation is script-only; fixed roles, no editable permissions; no SMS or WhatsApp sending; no billing; no student-data deletion; no impersonation.

## Feature map

| Requested feature | Class | Reuses | Notes |
|---|---|---|---|
| Dashboard metrics (institutions, users, drives, applications, offers) | 1 | `GET /api/platform/analytics` | Shown on `/platform`. |
| Dashboard AI usage, open support, system health | 1 | `/api/platform/ai/usage`, `/support`, `/monitoring` | |
| Dashboard activity trend chart | 1 (Batch 1) | analytics `series` | Real series; says so when empty. |
| Dashboard module adoption | 1 (Batch 3) | `CollegeModule`; new `GET /api/platform/analytics/modules` | Counts of active institutions per module. Counts only. |
| Institution create, search, filter, activate/suspend | 1 | `/api/platform/institutions` | `/platform/institutions`. |
| Institution edit, branding, modules | 1 (UI 2) | `PATCH /institutions/[id]` | On the institution detail page, one long page. |
| Institution detail tabs (Overview, Modules, Features, Administrators, Usage, Activity, Support, Security) | 1 for 7 of 8 (Batch 2 and 5) | detail, `/usage`, `/staff`, `/support?institution=`, `/modules`, `/policy` | Overview, Modules, Administrators, Usage, Activity, Support and Security are built. Effective module availability (including the platform emergency switch) is shown inside Modules, so there is no separate Features tab: there are no feature flags to show. |
| Institution health | 1 (Batch 3, indicators not a score) | detail, `/usage`, `/support` | Six indicators on the Overview tab, each with its rule shown; deliberately no composite score. Security configuration is not shown (no per-institution data). |
| Onboarding checklist | 1 (Batch 3) | creation flow, detail counts | "Setup progress" on the Overview tab: eight steps checked against what exists. |
| Module on/off per institution | 1 | `CollegeModule`, institution PATCH | Thirteen keys. The brief's list (alumni, AI interview, mock interviews...) does not map one-to-one; **product decision**. |
| Global emergency switch per module | 1 (Batch 4) | new `PlatformModuleSetting`, `requireModule` | Can only turn a module off for everyone. Separate from per-institution entitlement. |
| Scheduled activation, gradual rollout | 1 (Batch 6) | `PlatformModuleSetting` (+2 columns), `requireModule` | A launch time and a rollout percentage per module. Both can only reduce availability. Institutions are chosen by a stable hash, and raising the percentage only adds institutions. |
| Feature dependencies | 3 (Batch 6) | advisory map in `lib/platformModules.ts` | Shown as advice only; the server does not enforce it. The map (Employer portal and Attendance depend on Drives) is an assumption to confirm. |
| Generic feature flags beyond modules | 4 | | Not built: there is no feature list other than the 13 modules. |
| Platform analytics, comparison, filters | 1 | `/analytics`, `/analytics/institutions` | `/platform/analytics`. |
| Platform admin list, MFA status, deactivate | 1 | `/api/platform/admins` | On the Access page. Creation stays script-only. |
| Administrator profile and MFA | 2 (Batch 1) | `/me`, `/mfa` | New `/platform/account`. |
| Login history, session revocation | 1 (Batch 4 and 6) | `LoginEvent` (now written for platform administrators) | History with a "This session" marker, plus "sign out my other sessions". The Auth service cannot list live sessions or end a chosen one, so there is no live session list. |
| Support list, assign, notes, reply, resolve, status | 1 | `/api/platform/support*` | `/platform/support`. |
| Support reopen | 1 (Batch 4) | new `POST /support/[id]/reopen` | Only a resolved request can be reopened. The existing status route still refuses to change a resolved request. |
| Support resolution metrics | 1 (Batch 2) | new `GET /api/platform/support/metrics` | Counts, median time to resolve, oldest open. Read-only, no text or person. |
| Support priority | 1 (Batch 4) | new `priority` column | Internal to the platform team; the institution never sees it. |
| System health, storage, AI, email, database | 1 | `/api/platform/monitoring` | |
| Background jobs and history, application errors | 1 | `/monitoring/jobs`, `/monitoring/errors` | Same page as system health. |
| Incidents (list, status, resolution) | 1 (Batch 4) | new `PlatformIncident`, `PlatformIncidentUpdate` | Recorded by hand; nothing detected automatically. Resolved is final. |
| AI providers, models, keys, tests, switches, limits, usage | 1 | `/api/platform/ai*` | `/platform/ai`. Cost estimates are not shown (no pricing data). |
| Integration directory and status | 1 | `/api/platform/integrations` | `/platform/integrations`. SMS and WhatsApp stay blocked. |
| Platform announcements | 3 (Batch 4) | new `PlatformAnnouncement*`, institution read and acknowledge routes | Create, target, schedule, publish, cancel, acknowledgements. Shown as a banner at the top of the staff area (institution administrators can confirm they have read it); email, SMS and WhatsApp are never used. |
| Security overview, events, review status | 3 (Batch 4) | audit trail (`listAudit`), new `PlatformSecurityReview` | Reviews with notes on recorded events. **Institution sign-in failures and cross-institution denials are not recorded anywhere, so they are not shown.** |
| Roles and access | 2 (Batch 1) | `/api/platform/roles` | Plain-language roles on top; technical matrix collapsed. |
| Audit log | 1 | `/api/platform/audit-logs*` | |
| System configuration (read-only) | 1 | `/api/platform/system` | `/platform/system`. |
| Data retention, cleanup, confirmation | 1 | `/api/platform/policy*` | `/platform/policy`. Changes are audited; a dedicated cleanup-history view was not verified. |
| Backup status | 4 | | Not built. Reading it needs the Supabase management API and a new access token, whose response I cannot verify here. The System configuration page says backups are managed in the Supabase dashboard. |
| Release information | 1 (Batch 6) | System configuration | Shows the commit and branch of the deployment when the host provides them. No release history and no deployment controls. |

## Batch 1 (done in this change)

- Navigation regrouped to the requested sections, **existing pages only** (no empty pages).
- Dashboard: real activity trend chart and quick actions; the MFA card moved.
- New `/platform/account`: profile, two-step status, removal of the authenticator, honest "sessions not available".
- Access: plain-language institution roles; the route-level matrix moved into a collapsed "Technical authorization matrix".
- No API changed. Specs updated: `m2-hardening`, `platform-audit`, `platform-governance`.

## Batch 2 (done in this change)

- Institution detail is now tabbed: Overview, Modules, Administrators, Usage, Activity, Support. The active tab survives a save. Deactivation asks for confirmation. No institution API changed.
- Support: new read-only `GET /api/platform/support/metrics` (open, in progress, unassigned, resolved in 30 days, median time to resolve, oldest open) with a unit-tested pure summary, shown above the support list.
- Not done, on purpose: **reopening a resolved request** (the backend refuses it by design; a decision is needed) and **splitting System Health into tabs** (its browser spec asserts on regions and mocked pagination, so it needs a local-stack run to change safely).
- Specs updated, not run: `platform-institution`.
- Route index and permission matrix regenerated for the new route.

## Batch 3 (done in this change)

- System Health is now tabbed: Services, Scheduled jobs, Errors (the overall card, refresh and failure banners stay above). Spec `platform-monitoring` updated, not run.
- Institution Overview gains **Setup progress** (8 steps) and **Health** (6 indicators with the rule printed beside each; no overall score).
- Dashboard gains **Module adoption** from a new read-only `GET /api/platform/analytics/modules` (unit-tested summary).
- Tabs in the platform use a new flat underline style (`app/platform/_components/tabs.tsx`).

## Batch 4 (done in this change; migrations written, NOT run anywhere)

New tables (four migration files, additive only, with rollback notes and row-level security): support priority; incidents and updates; announcements, targets and acknowledgements; the module emergency switch and security reviews.
- **Incidents**, **Announcements**, **Module management** and **Security centre** pages, plus support priority and reopen, and sign-in history with "sign out my other sessions" on the account page.
- Changes to shared code: `requireModule` now also reads the emergency switch (it can only deny, and a missing table is treated as "on"); `/api/auth/login-event` now also records platform administrators.
- Every new route uses `platformRoute` (MFA enforced) or the staff `route` wrapper with a role list; writes are rate-limited and audited. Route index and permission matrix regenerated.

## Batch 5 (done in this change)

- Institution **Security** tab: whether two-step sign-in is required, and by whom (the platform or the institution). Settings only; no person is shown. Adds one read-only field, `security.requireMfaForAdmins`, to the institution detail response.
- Institution **Modules** tab marks a module the platform has switched off for everyone.
- Dashboard **AI usage** chart (calls, failures, blocked per day) from the existing AI usage API.
- System configuration states plainly that backups live in the Supabase dashboard and that there is no release history or deployment control.

## Batch 6 (done in this change; two more migrations written, NOT run)

- **Module scheduling and gradual rollout**, and **advisory dependencies**, on the Module management page. New columns `availableFrom` and `rolloutPercent` (migration `20261123090000_module_rollout`). Both only reduce availability, and a missing column is treated as "on".
- **Refused requests** recorded by the request wrapper (role or module refusals only), throttled to one line a minute per identical refusal, shown on the Security centre with counts by page and institution. New table `PlatformAccessDenial` (migration `20261123100000_access_denials`). This is not a record of sign-in failures and does not see attempts that end as "not found".
- **This session** marker on the administrator sign-in history, and **release information** (commit and branch) on System configuration.

## Not built

Backup status and restore (needs a new secret and an API I cannot verify); release history and deployment controls; recording of institution sign-in failures (they happen inside the Auth service); a live session list (the Auth service cannot provide one); generic feature flags beyond the 13 modules; a separate "Platform Insights" page (the Dashboard and Analytics already hold that content).

## Verification state

See the delivery report for exact results. Browser specs were edited but **not run** (no local stack available); they are not marked as passing.

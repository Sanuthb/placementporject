# Gate 4: remaining work assessment and completion roadmap

Date: 2026-11-12. **Assessment only.** No application code, schema, configuration, `.env`, test or plan file was changed to produce this document. Nothing was committed, pushed, deployed or reset; no hosted Supabase connection or migration was used; Gate 5 has not started. The only files written are this report, `gate-4-remaining-work.csv` and `gate-4-test-inventory.csv`.

Companion files: `claude/gate-4-remaining-work.csv` (one row per work package with every field requested) and `claude/gate-4-test-inventory.csv` (all 1,386 test case IDs with their current status, the work package that owns each remaining case and what blocks it).

## 1. Summary

Of the 1,386 approved test cases, **183 Pass, 5 Fail, 6 Blocked and 1192 Not Run** (after WP-01 and WP-02, 2026-11-12; before them it was 157, 0, 21 and 1,208). Every remaining case (1,203) is assigned to exactly one of **36 work packages** below.

What the numbers mean (they are not 1,229 pieces of missing software):

* **993 cases (83%) are ready to execute**: the feature exists and the case has simply never been run with data-specific tests. This is test work, not build work. Most sit in the module verification packages WP-05 to WP-10, WP-21, WP-30 to WP-33.
* **124 cases need a product decision** before anything can be built or concluded (new roles, reports, AI gaps, integrations, scopes, data-model questions).
* **11 cases need fixtures or test infrastructure** (seeded data for cross-institution probes, a fault and clock seam, a production-mode flood harness, devices for accessibility sessions); **23** also need a decision on performance thresholds.
* **44 cases are held, future or process by decision** (SMS, WhatsApp, mobile OTP, SSO, voice and video, subscriptions and billing, Release 6, the 25 organisational cases) and **3** are blocked on a student-data deletion decision and a legal assessment. These stay as they are.

Headline findings:

1. **Five cases Fail, and none is a security leak:** ROLE-PERM-TC-010, 012, 013, 014 and 016 (Principal, Placement Officer, Department Coordinator, Faculty, Employer) fail because the code does not give the role functions the SRS section 3 lists for it (details in section 12). Defects found and fixed during WP-01/02: scheduled reports for a suspended institution (G4-F02) and the inaccurate permission matrix (G4-F03). One real defect is open and needs your approval to fix: Student 360 weak subjects (G4-F01). The numbered end-to-end suites all pass except that one assertion; lint shows 0 errors.
2. **The largest risk is unexecuted verification, not missing code.** 993 remaining cases are ready to run. Modules 4 to 21 have unit tests for their rules, and older end-to-end suites touch Placement Management (suites 03 to 05) and some add-on modules (08), but most of those assertions are not mapped to case IDs, so each of these modules has at most 2 passing cases (M12 and M14 have none).
3. **Security priority:** after WP-01 and WP-02, tenant isolation is proven across 14 modules with positive controls, every route and method was checked live against its declared guard (6,992 calls, no difference), and the coordinator's department scope was tested at handler level. Still untested: stored XSS in the browser, AI prompt injection, and staff and student session expiry (WP-03). These come next.
4. **Build gaps that need your decision before any code:** ten report downloads and six partial reports; Interviewer, Trainer and Alumni roles; campus and batch scope; AI document classification, quality and duplicate checks, question generation, revision planning and model and prompt version retention; asynchronous AI and job retry; coding and SQL execution; public landing page; JD and eligibility history; ERP, external LMS, meeting creation. All are listed in the decision register (section 8).
5. **DEC-01 is resolved (2026-11-12):** platform administrator accounts stay script-created. The A-18 add/invite API and screen were removed and tested; deactivation stays. **DEC-31 is decided (2026-11-12):** Gate 4 is complete when all approved in-scope application functionality is implemented and verified, the relevant automated tests pass and unresolved critical functional defects are addressed; organisational/process cases and release documentation may move to Gate 6 when they are not missing functionality.
6. **Fourteen Gate 1 audit notes are stale** (the feature now exists, e.g. the Super Admin screens, platform analytics and monitoring) and would mislead anyone planning from the plan's Implementation column: those cases need executing, not building (section 6).

## 2. Updated test inventory (all 1,386 IDs preserved)

`gate-4-test-inventory.csv` holds one row per ID in the same order as `full-application-test-plan.csv`; the two ID lists are identical (checked when the file was generated). No ID was added, removed or renumbered, and no status was changed by this assessment.

### 2.1 By status

| Status | Cases |
|---|---|
| Pass | 183 |
| Fail | 5 |
| Blocked | 6 |
| Not Run | 1192 |
| **Total** | **1386** |

### 2.2 By group

| Group | Cases | Pass | Blocked | Not Run | Not yet passing |
|---|---|---|---|---|---|
| M01 | 19 | 13 | 0 | 6 | 6 |
| M02 | 16 | 8 | 0 | 8 | 8 |
| M03 | 38 | 19 | 0 | 19 | 19 |
| M04 | 31 | 2 | 0 | 29 | 29 |
| M05 | 17 | 2 | 0 | 15 | 15 |
| M06 | 29 | 2 | 0 | 27 | 27 |
| M07 | 49 | 2 | 0 | 47 | 47 |
| M08 | 20 | 2 | 0 | 18 | 18 |
| M09 | 18 | 2 | 0 | 16 | 16 |
| M10 | 27 | 2 | 0 | 25 | 25 |
| M11 | 32 | 2 | 0 | 30 | 30 |
| M12 | 21 | 1 | 0 | 20 | 20 |
| M13 | 65 | 2 | 0 | 63 | 63 |
| M14 | 51 | 1 | 0 | 50 | 50 |
| M15 | 39 | 2 | 0 | 37 | 37 |
| M16 | 30 | 2 | 0 | 28 | 28 |
| M17 | 14 | 2 | 0 | 12 | 12 |
| M18 | 28 | 2 | 0 | 26 | 26 |
| M19 | 12 | 2 | 0 | 10 | 10 |
| M20 | 19 | 2 | 0 | 17 | 17 |
| M21 | 40 | 2 | 0 | 38 | 38 |
| ROLE-* | 113 | 18 | 1 | 89 | 95 |
| SA | 67 | 59 | 4 | 4 | 8 |
| SRS-* | 591 | 32 | 1 | 558 | 559 |

### 2.3 By Gate 1 implementation class (the plan's Implementation column; 14 notes are stale, see section 6)

| Class | Pass | Blocked | Not Run | Total |
|---|---|---|---|---|
| Existing | 145 | 4 | 979 | 1128 |
| Partial | 5 | 1 | 86 | 92 |
| Missing | 32 | 0 | 61 | 93 |
| Unverified | 0 | 1 | 26 | 27 |
| On hold | 0 | 0 | 6 | 6 |
| Future scope | 1 | 0 | 9 | 10 |
| Process | 0 | 0 | 25 | 25 |

The 37 cases outside the Existing class that already Pass (32 Missing, 4 Partial, 1 Future scope at Gate 1) are 36 Super Administrator cases built in Gate 4 and one SRS-SECURITY case.

### 2.4 SRS cross-cutting sections

| Prefix | SRS section | Cases | Pass | Not yet passing |
|---|---|---|---|---|
| SRS-ACCEPT | 14 acceptance criteria | 54 | 0 | 54 |
| SRS-AI | 8 AI | 49 | 0 | 49 |
| SRS-DATA | 7 entities | 95 | 0 | 95 |
| SRS-DEF | 18 definition | 6 | 0 | 6 |
| SRS-DELIV | 15 deliverables | 19 | 0 | 19 |
| SRS-FLOW | 12 workflow | 30 | 0 | 30 |
| SRS-INT | 10 integrations | 14 | 0 | 14 |
| SRS-NFR | 9 non-functional | 39 | 0 | 39 |
| SRS-OBJ | 2 objectives | 14 | 0 | 14 |
| SRS-PRINC | 17 principles | 11 | 0 | 11 |
| SRS-PROC | 16 responsibilities | 25 | 0 | 25 |
| SRS-REL | 13 release plan | 63 | 0 | 63 |
| SRS-REPORT | 11 reports | 20 | 0 | 20 |
| SRS-SECURITY | 9 security and privacy | 43 | 32 | 11 |
| SRS-STRUCT | 4 structure | 10 | 0 | 10 |
| SRS-UI | 6 screens | 84 | 0 | 84 |
| SRS-VISION | 1 vision | 15 | 0 | 15 |

### 2.5 By work package

| Order | Package | Not Run | Blocked | Total | Ready to execute | Needs decision, fixtures, or held |
|---|---|---|---|---|---|---|
| 1 | WP-01 Test harness repair, fixtures and refreshed baselines | 0 | 0 | 0 | 0 | 0 |
| 2 | WP-02 Tenant isolation and access-control completion | 0 | 1 | 6 | 0 | 6 |
| 3 | WP-03 Security verification: sessions, XSS, prompt injection, files, privacy controls | 7 | 1 | 8 | 8 | 0 |
| 4 | WP-04 Super Administrator portal closure and audit completeness | 15 | 3 | 18 | 14 | 4 |
| 5 | WP-05 Foundations: authentication, institution and student registration (M01-M03) | 31 | 0 | 31 | 30 | 1 |
| 6 | WP-06 Student development: assessment, roadmap, learning, resources, projects, internships, resume (M04-M10) | 174 | 0 | 174 | 174 | 0 |
| 7 | WP-07 Recruitment and placement: JD, matching, campaigns, placement management (M11, M12, M13, M18) | 139 | 0 | 139 | 139 | 0 |
| 8 | WP-08 Practice engines: mock tests, mock interviews, discussions, readiness (M14, M15, M17, M19) | 102 | 0 | 102 | 102 | 0 |
| 9 | WP-09 Communication and dashboards: notifications, dashboards, analytics (M20, M21) | 52 | 0 | 52 | 52 | 0 |
| 10 | WP-10 AI services verification with mocked providers (existing AI requirements) | 38 | 0 | 38 | 38 | 0 |
| 11 | WP-11 Existing integrations and monitoring re-baseline | 7 | 0 | 7 | 5 | 2 |
| 12 | WP-12 Report downloads and export formats (M16 plus ten missing reports) | 50 | 0 | 50 | 32 | 18 |
| 13 | WP-13 Interviewer role and portal, interview scheduling | 11 | 0 | 11 | 0 | 11 |
| 14 | WP-14 Training Coordinator / Trainer role | 14 | 0 | 14 | 0 | 14 |
| 15 | WP-15 Alumni / Industry Mentor role | 8 | 0 | 8 | 0 | 8 |
| 16 | WP-16 Staff access scopes (campus, batch) and role-model alignment | 7 | 0 | 7 | 0 | 7 |
| 17 | WP-17 Employer / recruiter portal verification and gaps | 15 | 0 | 15 | 6 | 9 |
| 18 | WP-18 AI evaluation provenance: model and prompt version retention | 1 | 0 | 1 | 0 | 1 |
| 19 | WP-19 Document intelligence extensions | 3 | 0 | 3 | 0 | 3 |
| 20 | WP-20 AI-generated learning content: question generation, revision planning, AI-written plans | 8 | 0 | 8 | 0 | 8 |
| 21 | WP-21 JD and eligibility change history; data-model conformance | 92 | 0 | 92 | 75 | 17 |
| 22 | WP-22 Asynchronous AI work and job retry | 3 | 0 | 3 | 1 | 2 |
| 23 | WP-23 Coding and SQL execution environment | 6 | 0 | 6 | 0 | 6 |
| 24 | WP-24 Public landing page | 1 | 0 | 1 | 0 | 1 |
| 25 | WP-25 Small partial items: resource targets, GitHub, video conferencing, ERP and external LMS | 9 | 0 | 9 | 0 | 9 |
| 26 | WP-26 Performance, scalability and reliability measurement | 23 | 0 | 23 | 0 | 23 |
| 27 | WP-27 Held by decision: voice and video, SMS and WhatsApp, mobile OTP, SSO (no work) | 9 | 0 | 9 | 0 | 9 |
| 28 | WP-28 Backup, disaster recovery and recovery procedures | 3 | 0 | 3 | 0 | 3 |
| 29 | WP-29 Usability, accessibility and responsive behaviour | 9 | 0 | 9 | 0 | 9 |
| 30 | WP-30 Browser E2E coverage of the SRS screen lists by portal | 67 | 0 | 67 | 67 | 0 |
| 31 | WP-31 Role workflow verification (TPO, officer, coordinator, faculty, principal, student) | 55 | 0 | 55 | 55 | 0 |
| 32 | WP-32 Acceptance, release, objectives and traceability closure | 177 | 0 | 177 | 176 | 1 |
| 33 | WP-33 Release deliverables and documentation | 19 | 0 | 19 | 19 | 0 |
| 34 | WP-34 Student-data retention, deletion and data-protection compliance (decision-blocked) | 3 | 0 | 3 | 0 | 3 |
| 35 | WP-35 Organisational process cases (product owner and team responsibilities) | 25 | 0 | 25 | 0 | 25 |
| 36 | WP-36 Future scope and decided-not-now (no work) | 9 | 1 | 10 | 0 | 10 |
| | **Total** | **1192** | **6** | **1198** | **993** | **205** |

Reconciliation: Pass 183 + not yet passing 1198 = 1386. Every Blocked case (21) and every Not Run case (1,208) appears in exactly one package.

### 2.6 By blocker class (what stops a case being completed)

| Blocker class | Cases |
|---|---|
| Ready to execute | 993 |
| Needs product decision | 124 |
| Process (owner) | 25 |
| Needs decision (thresholds) and fixtures | 23 |
| Future scope / preserved | 10 |
| Held by decision | 9 |
| Needs fixtures (devices, assistive technology) | 8 |
| Failing: SRS function gap or defect (needs decision) | 5 |
| Needs browser test build | 3 |
| Blocked on decision and legal review | 3 |

## 3. What Gate 4 has already delivered (do not redo)

| Area | State | Evidence |
|---|---|---|
| Suspended-institution access (A-02, Critical) | Fixed and verified: six public token surfaces refuse a suspended institution | g3-01 (58 assertions) |
| Platform audit viewer, analytics, monitoring and job history | Built and verified | g3-06 (112), g3-07 (140), g3-08 (170) and browser specs |
| AI configuration, global switch, usage, daily limits | Built and verified with mocked providers | g4-04 (40), g4-05 (38), AI database suites (52, 54, 49) |
| Platform support requests | Built and verified | g4-06 (48) |
| Institution detail, editing, usage; self-rename uniqueness | Built and verified | g4-07 (46), g4-08 (23) |
| Platform governance (A-18 read-only scope) | Built, reviewed and corrected | g4-09 (87), 59 unit, 6 browser tests |
| SMS and WhatsApp hold | Enforced server-side (code constant); adapters kept | 13 unit and 7 database assertions |
| Retention of three operational tables | Verified bounded, confirmed, audited, concurrency-safe, table-isolated | 24 database assertions |
| Role matrix | Route-level only, labelled as such; narrowing scan added | 22 unit assertions |

Unit tests: 820 PASS. Production build and type-check clean. Lint: 3 errors outside feature code (WP-01).

## 4. Findings by category

### 4.1 Missing requirements (61 cases not yet passing; Gate 1 class Missing)

* **Roles and portals:** Interviewer (ROLE-INT-TC-001-006, SRS-STRUCT-TC-008, ROLE-PERM-TC-018), Trainer (ROLE-TRN-TC-008 report; capability exists but no role: WP-14), Alumni (ROLE-ALM-TC-001-005, SRS-REL-TC-054, ROLE-PERM-TC-019), campus and batch scope (ROLE-PERM-TC-003, 005). Packages WP-13, 14, 15, 16.
* **Reports:** ten missing downloads, SRS-REPORT-TC-002 to 009, 013, 016; SRS-UI-TC-046. WP-12.
* **AI:** document classification, quality checks, duplicate detection (SRS-AI-TC-003, 005, 006); question generation and revision planning (013, 015); model and prompt version retention (045). WP-18, 19, 20.
* **Integrations:** ERP/SIS and university systems (SRS-INT-TC-001, 002), coding environment (010), external LMS (011). WP-23, 25.
* **Structure and data:** public landing page (SRS-STRUCT-TC-001), JD and eligibility change history (SRS-DATA-TC-095 is Partial), role and permission tables (SRS-DATA-TC-011, 012: conflicts with the fixed-role decision). WP-24, 21, 16.
* **Privacy:** data retention policies, deletion workflows, data-protection compliance (SRS-SECURITY-TC-011, 013, 014): operational retention exists for three tables only. WP-34, decision-blocked.
* **Deliverables:** six documents (SRS-DELIV-TC-001, 002, 009, 014, 015, 016). WP-33.
* **Stale 'Missing' notes:** SRS-UI-TC-074, 077, 078, 079, 081, 083, 084, SRS-FLOW-TC-029 are Missing in the plan but the screens exist now: execute them (WP-04).

### 4.2 Partial requirements (88 cases not yet passing)

* Rule-based rather than AI-written plans and recommendations (SRS-AI-TC-014, 021, 022, 025, 039; M07-TC-039): WP-20, decision DEC-15.
* Entities held as JSON or derived values (18 SRS-DATA cases): WP-21, DEC-17.
* Report downloads that exist only as screens or Excel (SRS-REPORT-TC-001, 010, 011, 012, 017, 018): WP-12.
* Live-session meetings (M06-TC-011), GitHub depth (M08-TC-011, SRS-INT-TC-009), video conferencing (SRS-INT-TC-007), direct resource targets (M07-TC-035, 038): WP-25.
* Coding and SQL marked by reading, not execution (M14-TC-006, 007, 028, 029): WP-23.
* Voice is browser dictation only (M15-TC-021, 037, M19-TC-003): held (WP-27).
* Backups, error tracking, retries, asynchronous AI (SRS-NFR-TC-002, 018, 019, 020, 021, 023): WP-22, 28, 11.
* Principal assigns permissions (ROLE-PRN-TC-008), campus and batch scope, temporary access (ROLE-PERM-TC-008): WP-16, 13.
* Staff bulk upload (M01-TC-008): WP-05, DEC-03. Native mobile app (SRS-STRUCT-TC-009): WP-29, DEC-27.

### 4.3 Failed tests

* **Five cases Fail** (ROLE-PERM-TC-010, 012, 013, 014, 016): SRS section 3 functions the code does not give the role. They are incomplete role workflows, not access leaks (section 12.1).
* The four stale suites and the browser spec were repaired in WP-01. One real defect remains visible: suite 06 'weak subjects found (45% Maths)' (G4-F01).
* Lint: 0 errors. The numbered runner works on Windows (WP-01).

### 4.4 Blocked tests (6 now; 21 before WP-01/02)

* **Cross-institution probes (12 at Gate 3; 14 modules now):** all covered by WP-02 and Pass (section 12).
* **Now resolved by WP-01/02:** the 12 cross-institution cases above and SA-TC-025, 030, 033, 034 (Pass). Still Blocked: SA-TC-038, 039, 040 (platform browser runs, WP-04), SRS-SECURITY-TC-027 (stored XSS in the browser, WP-03), ROLE-PERM-TC-011 ('and nothing else' for the Head TPO: owner decision) and SA-TC-008 (decided).
* **Platform browser runs (3):** SA-TC-038, 039, 040. Owner WP-04.
* **Stored XSS in the browser (1):** SRS-SECURITY-TC-027. Owner WP-03.
* **Decided:** SA-TC-008 stays Blocked under the Vercel Observability decision (WP-36).

### 4.5 Unverified requirements (27 not yet passing)

* **Recruiter portal never inspected in depth (A-20):** ROLE-EMP-TC-008-012, M21-TC-038, SRS-FLOW-TC-025. WP-17.
* **Never measured (17):** SRS-NFR-TC-001 and 024 to 039. WP-26. **Never tested on devices or with assistive tools (3):** SRS-NFR-TC-011, 015 and SA-TC-040. WP-29, WP-04.
* **The Employer portal has 3 pages and 11 endpoints** (verified in code today), against 14 SRS screen cases.

### 4.6 Security gaps

| # | Gap | Severity (my assessment) | Package |
|---|---|---|---|
| S-01 | Cross-institution isolation for 14 modules: PROVEN 2026-11-12 (positive controls, both directions, writes and deletes, no leak) | Closed | WP-02 |
| S-02 | Handler-level scoping: tested for the coordinator (54 list routes, 25 student detail routes) and for the principal read-only rule (2,730 calls, no row changed); the 32/221/196 classification stays a heuristic | Mostly closed | WP-02 |
| S-03 | AI prompt injection untested (JD text, resumes, answers, documents) | High | WP-03 |
| S-04 | Stored XSS never run in a browser | Medium to High | WP-03 |
| S-05 | Platform session expiry, tampering, revocation and deactivation: PROVEN (revoked token accepted for up to 60 s by a server that cached it). Staff and student session expiry still untested | Partly closed | WP-03 |
| S-06 | A scheduled job processed a suspended institution (scheduled reports): FOUND AND FIXED 2026-11-12; the other four jobs proven to skip it | Closed | WP-01 |
| S-07 | Registration atomicity: PROVEN with a forced failure after the rows were written (SA-TC-025) | Closed | WP-01 |
| S-08 | Platform rate limits in production mode: PROVEN (per-route limit, per-administrator, flood guard, switch ignored in production) | Closed | WP-01 |
| S-09 | Platform audit does not record refused or failed platform actions, and institution actions are always logged as succeeded (Gate 1 4.1) | Medium | WP-04, DEC-02 |
| S-10 | Platform administrator creation through the API: REMOVED (DEC-01); deactivation only | Closed | WP-04 |
| S-11 | AI evaluations (descriptive marks, interview, discussion) do not record model or prompt version | Medium | WP-18 |
| S-12 | `/design` UI-kit showcase route is reachable without a portal (verified present; exposure not tested) | Low | WP-24 |
| S-13 | Encryption at rest and in transit is provided by hosting and cannot be proven on the local stack | Document review | WP-03 |
| S-14 | Backups never drilled; no tested restore | Medium | WP-28 |
| S-15 | No student-data deletion, breach process or grievance contact; compliance not assessed | Decision and legal | WP-34 |
| S-16 | Secure file handling beyond the suites already run (SRS-NFR-TC-022) | Medium | WP-03 |

### 4.7 Incomplete role workflows

* **Absent roles:** Interviewer, Trainer, Alumni / Industry Mentor (verified: the role enum holds five roles). WP-13, 14, 15.
* **Partial:** Faculty mentoring session record (ROLE-FAC-TC-008); Principal assigning permissions (ROLE-PRN-TC-008, A-01); temporary access for external users is limited to one-time mentor links (ROLE-PERM-TC-008).
* **Unverified:** Employer workflows (ROLE-EMP-TC-008-012). WP-17.
* **Never executed end to end (existing roles):** Head TPO 11, Placement Officer 9, Coordinator 5, Faculty 6, Principal 6, Student 13 cases. WP-31.

### 4.8 Missing report or export

* Ten downloads missing, six partial, CSV only in the import helper and the historical-import route (verified in code today). The report framework (`lib/reportDoc.ts`) already renders PDF, Word and JSON, so the work is builders, scope rules, formats and tests. WP-12, DEC-05.
* Platform analytics and the platform audit log have no export (Gate 1 4.1/4.2 limitations); no SRS line requires one, so no case exists. Recorded for awareness only.

### 4.9 Missing or incomplete screens

* No public landing page (home redirects to sign-in); no Interviewer, Trainer or Alumni screens; Employer company registration and profile are staff-created (SRS-UI-TC-050, 051); mock interview scheduling is a window with a last day, not time slots (SRS-UI-TC-044); final readiness report is on screen only (SRS-UI-TC-046).
* Super Admin portal screens now exist (12 pages) but 10 SRS-UI cases and SA-TC-038 to 040 have never been run in a browser. WP-04.
* Of 84 SRS-UI cases, none passes today; 67 are in WP-30, 10 in WP-04 plus the screen items listed above.

### 4.10 AI requirement gaps

* Missing: document classification, quality, duplicate detection; question generation; revision planning; model and prompt version retention. WP-18, 19, 20.
* Partial: plans and recommendations are rules, not AI-written; asynchronous long-running AI work and progress. WP-20, WP-22.
* Not yet verified: 38 existing AI cases (grounding, labelling, human review, personal-data protection) with mocked providers. WP-10.

### 4.11 Integration gaps

* Not built, no target named: ERP/SIS, university systems, external LMS (A-08). Coding environment (A-15). Meeting creation. GitHub beyond public counts. WP-23, 25.
* Held: SMS and WhatsApp (server-side blocked), mobile OTP, SSO. Future: payment gateway. WP-27, 36.
* Existing integrations never mapped to cases: email, calendar, cloud storage, AI model providers, authorised-API rule (SRS-INT-TC-003, 006, 008, 013, 014). WP-11.

### 4.12 Documentation and release deliverables

* Six deliverables have no document; five are partial (generated route list, README, in-app help). WP-33.
* 25 organisational process cases (SRS-PROC-TC-001-025) are not software behaviour; they need the owner. WP-35, DEC-30.
* Backup and recovery procedures (SRS-DELIV-TC-016) depend on WP-28.

## 5. Preserved decisions: how this roadmap respects them

| Decision (as instructed) | How the roadmap treats it |
|---|---|
| SMS and WhatsApp remain disabled and server-side blocked | WP-27 holds the cases; the channel-hold regression stays in every run (WP-09). No work to lift it. |
| Subscriptions and billing remain future scope | WP-36 (SA-TC-005, SRS-UI-TC-080, SRS-INT-TC-012). No work. |
| Voice-interview redesign remains on hold | WP-27 holds M15-TC-021, M15-TC-037, M19-TC-003; browser dictation stays as is. |
| Platform Administrator accounts remain script-created | Applied (DEC-01, 2026-11-12): the A-18 add/invite API and screen were removed; no API or screen creates, invites or re-enables an account; deactivation stays with the last-administrator guard. |
| No custom roles or editable permission rules | Honoured. Trainer, Interviewer and Alumni are fixed, SRS-defined roles from the earlier decision 3, not custom roles; WP-16 treats campus and batch scope as data and asks (DEC-10, DEC-11) before touching it; SRS-DATA-TC-011/012/013 are proposed as satisfied by fixed roles. |
| No student-data deletion or anonymisation without a separate approved decision | WP-34 is decision-blocked; DEC-29. Nothing designed or built. |
| SA-TC-008 remains Blocked (Vercel Observability) | WP-36; unchanged. |

No existing scope decision is changed by this document. Anything that looks like a change is raised as a numbered decision for you.

## 6. Reconciliation findings

### 6.1 Stale Gate 1 notes (feature exists now; case needs executing, not building)

`SA-TC-002; SRS-FLOW-TC-029; SRS-NFR-TC-019-020; SRS-STRUCT-TC-002; SRS-UI-TC-074-075, 077-079, 081-084`

Examples: SRS-UI-TC-074 to 084 say 'No such platform screen' although `/platform/analytics`, `/platform/monitoring`, `/platform/ai`, `/platform/integrations`, `/platform/access`, `/platform/audit` exist; SRS-NFR-TC-019/020 say 'no tracking service' although in-app monitoring and durable error records exist; SA-TC-002 says search, edit and usage are missing although they are built. The plan's Implementation column is a Gate 1 snapshot and was not rewritten (the plan change log records only audit-note updates for SA cases). Recommendation: keep the history, and record the executed result when each case is run.

### 6.2 Evidence that may already prove cases but is not mapped

Candidates, to be reviewed one by one and never bulk-promoted: `` (g3-02 proves anonymous, student, recruiter, wrong-role and principal-write refusals across 654 protected endpoints; those assertions are tagged to other case IDs). Old suites 03 to 05 (166 passing assertions) cover Placement Management while only 2 of its 28 cases are Pass; suites 10 to 14 are mapped for M1 to M3 only. They were last run on 2026-11-11 and need a re-run on the current build before any mapping (WP-01).

### 6.3 Items in the checklist that I verified in code for this assessment

Role enum has five roles and no Role or Permission model; Interviewer panels and slots exist as staff-managed records; recruiter portal is 3 pages and 11 endpoints; CSV exists only in the import helper and historical-import route; model name is stored only for provider configuration, usage statistics, document extraction and the Student 360 report; no JD or eligibility version tables; no queue dependency; the home route redirects to sign-in; GitHub access is in `lib/projectService.ts` only; platform has 12 pages and 44 endpoints. Items not re-verified here are marked 'Reported' in the Evidence basis column of the CSV.

## 7. Roadmap (ordered by dependency and security priority)

Principle: foundation and security before verification, verification before build, build before non-functional measurement, closure last. Packages inside a phase can run in parallel unless a dependency says otherwise. Decisions are requested as late as is safe so that ready work is not held up; the decisions each phase needs are listed.

| Order | Package | Phase | Complexity | Cases | Depends on | Decisions needed first |
|---|---|---|---|---|---|---|
| 1 | WP-01 Test harness repair, fixtures and refreshed baselines | A. Foundation | Medium | 0 | None. Everything below depends on it. | None |
| 2 | WP-02 Tenant isolation and access-control completion | A. Foundation | High | 6 | WP-01 (fixtures). | None |
| 3 | WP-03 Security verification: sessions, XSS, prompt injection, files, privacy controls | A. Foundation | High | 8 | WP-01 (clock/session seam, Playwright baseline); WP-02 recommended first. | None |
| 4 | WP-04 Super Administrator portal closure and audit completeness | A. Foundation | Medium | 18 | WP-01; WP-03 for session/rate-limit items (SA-TC-033/034 sit in WP-01 harness, executed here). | DEC-01, DEC-02 |
| 5 | WP-05 Foundations: authentication, institution and student registration (M01-M03) | B. Verify existing modules | Medium | 31 | WP-01, WP-02. | DEC-03 |
| 6 | WP-06 Student development: assessment, roadmap, learning, resources, projects, internships, resume (M04-M10) | B. Verify existing modules | High | 174 | WP-05 (students and profiles must exist); WP-01 fixtures. | None |
| 7 | WP-07 Recruitment and placement: JD, matching, campaigns, placement management (M11, M12, M13, M18) | B. Verify existing modules | High | 139 | WP-05, WP-06 (student evidence feeds matching); WP-01. | None |
| 8 | WP-08 Practice engines: mock tests, mock interviews, discussions, readiness (M14, M15, M17, M19) | B. Verify existing modules | High | 102 | WP-06 (students, resources), WP-07 for job-linked practice; WP-01. | None |
| 9 | WP-09 Communication and dashboards: notifications, dashboards, analytics (M20, M21) | B. Verify existing modules | Medium | 52 | WP-05..WP-08 for source data; WP-01. | None |
| 10 | WP-10 AI services verification with mocked providers (existing AI requirements) | B. Verify existing modules | Medium | 38 | WP-06..WP-08 (features exist per module); WP-03 for injection. | None |
| 11 | WP-11 Existing integrations and monitoring re-baseline | B. Verify existing modules | Low | 7 | WP-01. | DEC-04 |
| 12 | WP-12 Report downloads and export formats (M16 plus ten missing reports) | C. Build missing features | High | 50 | WP-05..WP-09 (data modules verified so reports can be compared with the database); WP-02 (reports must respect scope); decision DEC-05. | DEC-05 |
| 13 | WP-13 Interviewer role and portal, interview scheduling | C. Build missing features | High | 11 | WP-02 (isolation and authorisation foundation), WP-07 (drives and rounds); decisions DEC-06, DEC-07. | DEC-06, DEC-07 |
| 14 | WP-14 Training Coordinator / Trainer role | C. Build missing features | Medium | 14 | WP-02; WP-06 (learning modules verified); decision DEC-08. | DEC-08 |
| 15 | WP-15 Alumni / Industry Mentor role | C. Build missing features | Medium | 8 | WP-02; WP-06 (projects and internships verified); decision DEC-09. | DEC-09 |
| 16 | WP-16 Staff access scopes (campus, batch) and role-model alignment | C. Build missing features | High | 7 | WP-02; WP-13..WP-15 so the final role set is known; decisions DEC-10, DEC-11. | DEC-10, DEC-11 |
| 17 | WP-17 Employer / recruiter portal verification and gaps | C. Build missing features | Medium | 15 | WP-02, WP-07; decision DEC-12. | DEC-12 |
| 18 | WP-18 AI evaluation provenance: model and prompt version retention | C. Build missing features | Medium | 1 | WP-10 (AI behaviour verified first); decision DEC-13. Additive migration. | DEC-13 |
| 19 | WP-19 Document intelligence extensions | C. Build missing features | Medium | 3 | WP-05 (documents verified), WP-10; decision DEC-14. | DEC-14 |
| 20 | WP-20 AI-generated learning content: question generation, revision planning, AI-written plans | C. Build missing features | High | 8 | WP-10, WP-18 (provenance first so generated content is traceable); decision DEC-15. | DEC-15 |
| 21 | WP-21 JD and eligibility change history; data-model conformance | C. Build missing features | Medium | 92 | WP-07 (JD module verified); decisions DEC-16, DEC-17. | DEC-16, DEC-17 |
| 22 | WP-22 Asynchronous AI work and job retry | C. Build missing features | High | 3 | WP-01; WP-10; decision DEC-18 (architecture). | DEC-18 |
| 23 | WP-23 Coding and SQL execution environment | C. Build missing features | High | 6 | WP-08; decision DEC-19. Do not start without an approved sandbox design. | DEC-19 |
| 24 | WP-24 Public landing page | C. Build missing features | Low | 1 | None technically; decision DEC-20. | DEC-20 |
| 25 | WP-25 Small partial items: resource targets, GitHub, video conferencing, ERP and external LMS | C. Build missing features | Medium | 9 | WP-06 for the resource and project items; decisions DEC-21 to DEC-24. | DEC-21, DEC-22, DEC-23, DEC-24 |
| 26 | WP-26 Performance, scalability and reliability measurement | D. Non-functional | High | 23 | WP-05..WP-09 (features), WP-12 (report generation); decision DEC-25. | DEC-25 |
| 27 | WP-27 Held by decision: voice and video, SMS and WhatsApp, mobile OTP, SSO (no work) | D. Non-functional | Low | 9 | Not scheduled. | None |
| 28 | WP-28 Backup, disaster recovery and recovery procedures | D. Non-functional | Medium | 3 | WP-33 (document set); decision DEC-26. | DEC-26 |
| 29 | WP-29 Usability, accessibility and responsive behaviour | D. Non-functional | Medium | 9 | WP-30 (browser suites); decision DEC-27. | DEC-27 |
| 30 | WP-30 Browser E2E coverage of the SRS screen lists by portal | D. Non-functional | High | 67 | WP-05..WP-09, WP-13..WP-15, WP-17. | None |
| 31 | WP-31 Role workflow verification (TPO, officer, coordinator, faculty, principal, student) | E. Closure | Medium | 55 | WP-02, WP-05..WP-09 (each workflow rides on module data). | None |
| 32 | WP-32 Acceptance, release, objectives and traceability closure | E. Closure | Medium | 177 | All feature and verification packages (this is the last engineering step). | DEC-28 |
| 33 | WP-33 Release deliverables and documentation | E. Closure | Medium | 19 | Feature packages (documentation reflects final behaviour); WP-28 for recovery procedures. | None |
| 34 | WP-34 Student-data retention, deletion and data-protection compliance (decision-blocked) | E. Closure | High | 3 | Decision DEC-29; legal review. Nothing to implement now. | DEC-29 |
| 35 | WP-35 Organisational process cases (product owner and team responsibilities) | E. Closure | Low | 25 | Owner input; not engineering. | DEC-30 |
| 36 | WP-36 Future scope and decided-not-now (no work) | E. Closure | Low | 10 | Not scheduled. | None |

### Milestones

* **M-A Foundation and security (WP-01 to WP-04):** Fix the harness, create fixtures, prove isolation and handler scoping, test XSS, prompt injection and sessions, close the Super Admin items. Gate: no isolation leak open; DEC-01 and DEC-02 answered.
* **M-B Verify what exists (WP-05 to WP-11):** Data-specific tests for M01 to M21 and AI/integration verification. Ready now once M-A fixtures exist. Gate: every defect found is fixed with a regression test.
* **M-C Build under approved decisions (WP-12 to WP-25):** Reports first (they read data verified in M-B), then roles (Interviewer, Trainer, Alumni, scopes), then AI gaps, history, async, coding, landing, small partials. Gate: each package's decisions answered before it starts.
* **M-D Non-functional and screens (WP-26 to WP-30):** Measure performance against approved thresholds, drill recovery locally, accessibility and device sessions, browser coverage of the screen lists.
* **M-E Closure (WP-31 to WP-36):** Role workflows, traceability closure, documents, process cases, and the held, future and decision-blocked items recorded as such.

Complexity (Low, Medium, High) counts: Low 5, Medium 17, High 14.

## 8. Decision register (needed before the dependent package can start)

| # | Decision needed | Package | Cases | Note |
|---|---|---|---|---|
| DEC-01 | DECIDED 2026-11-12: the original decision is retained. Platform administrator accounts are created by script only; no public registration; no API or screen creates, invites or re-enables an account; existing accounts may be deactivated through the approved functionality; at least one active administrator must remain. Implemented and tested (the A-18 add/invite API and screen were removed). | WP-04 (done) | SA-TC-003, SA-TC-018, SRS-UI-TC-076 | RESOLVED |
| DEC-02 | Platform audit completeness: record refused and failed platform actions and the real outcome of institution actions? | WP-04 | SA-TC-052, SA-TC-053 follow-ups | Security |
| DEC-03 | Staff bulk upload (SRS 1.2): only students import in bulk today; are staff invited one at a time acceptable? | WP-05 | M01-TC-008 | SRS 5 module 1 |
| DEC-04 | Monitoring and error tracking: is an external error-tracking or alerting service required beyond the in-app monitoring (SA-TC-008 stays Blocked by the Vercel Observability decision)? | WP-11 | SRS-NFR-TC-019, SRS-NFR-TC-020 | SRS 9 |
| DEC-05 | Report formats per report and which of the ten missing downloads are required (A-10; the proposal was PDF and Word for narrative reports, PDF, Excel and CSV for tabular). | WP-12 | SRS-REPORT-TC-001 to 018 | SRS 11 |
| DEC-06 | Interviewer: access mechanism (account or one-time link), duration, what they may see, MFA (A-03, A-05). | WP-13 | ROLE-INT-TC-001..006, ROLE-PERM-TC-008 | SRS 3.10 |
| DEC-07 | Interview scheduling: time slots with a calendar or a window with a last day (A-09). | WP-13 | SRS-UI-TC-044, SRS-REL-TC-034 | SRS 6 |
| DEC-08 | Trainer: one Faculty/Trainer portal with two roles (A-02). | WP-14 | ROLE-TRN-TC-001..008 | SRS 3.7, 4 |
| DEC-09 | Alumni: build only the seven SRS functions, and how external identities are verified (A-04). | WP-15 | ROLE-ALM-TC-001..006 | SRS 3.11 |
| DEC-10 | Are campus-level and batch-level staff scopes required, and are they compatible with 'no editable permission rules' (scope assignment is data, not rules)? | WP-16 | ROLE-PERM-TC-003, ROLE-PERM-TC-005 | SRS 3 permission principle |
| DEC-11 | Record SRS-DATA role, permission and user-role mapping entities as satisfied by the fixed role model (plan change), and who assigns administrative permissions, Principal or Head TPO (A-01). | WP-16 | SRS-DATA-TC-011/012/013, ROLE-PRN-TC-008, SRS-REL-TC-004 | Preserved decision: no custom roles |
| DEC-12 | Employer portal scope and company self-registration (A-20). | WP-17 | ROLE-EMP-TC-008..012, SRS-UI-TC-050/051 | SRS 3.9, 6 |
| DEC-13 | Which AI evaluations count as 'important' for model and prompt version retention (A-12). | WP-18 | SRS-AI-TC-045 | SRS 8 |
| DEC-14 | Document classification, quality checks and duplicate detection: build now, and by which method. | WP-19 | SRS-AI-TC-003/005/006 | SRS 8 |
| DEC-15 | Are rule-based plans and recommendations acceptable for the Partial AI items, and is AI question generation and revision planning required now? | WP-20 | SRS-AI-TC-013/014/015/021/022/025/039, M07-TC-039 | SRS 8 |
| DEC-16 | JD and eligibility change history: required now? | WP-21 | SRS-DATA-TC-095 | SRS 7 |
| DEC-17 | Entities held as JSON or derived values: accept, or create tables (A-11). | WP-21 | 20 SRS-DATA Partial cases | SRS 7 |
| DEC-18 | Asynchronous AI and job retry: acceptable architecture for the target host. | WP-22 | SRS-NFR-TC-002/003/021 | SRS 9 |
| DEC-19 | Coding and SQL: sandbox (build or buy) or accept reading-based marking (A-15). | WP-23 | M14-TC-006/007/028/029, SRS-INT-TC-010, SRS-REL-TC-031 | SRS 5 module 14, 10 |
| DEC-20 | Landing page content (A-17) and whether the /design showcase may exist in production. | WP-24 | SRS-STRUCT-TC-001 | SRS 4 |
| DEC-21 | Resource targets JD and mock interview directly, or through campaigns and tests (A-13). | WP-25 | M07-TC-035, M07-TC-038 | SRS 5 module 7.3 |
| DEC-22 | GitHub integration depth: public commit counts, or private repositories and authorisation. | WP-25 | M08-TC-011, SRS-INT-TC-009 | SRS 10 |
| DEC-23 | Video conferencing: create meetings (which provider) or keep meeting links. | WP-25 | M06-TC-011, SRS-INT-TC-007 | SRS 10 |
| DEC-24 | ERP/SIS, university systems and external LMS: a named target and API are needed (A-08). Without one these cannot be built or tested. | WP-25 | SRS-INT-TC-001/002/011 | SRS 10 |
| DEC-25 | Expected load and response-time thresholds (A-06). | WP-26 | SRS-NFR-TC-001, 024..039 | SRS 9 |
| DEC-26 | Backup and recovery: authorise a hosted-environment drill, or accept a local drill and documentation for now. | WP-28 | SRS-NFR-TC-018/023, SRS-SECURITY-TC-008 | SRS 9 |
| DEC-27 | Native mobile application: required, or is a responsive web app with a manifest accepted. | WP-29 | SRS-STRUCT-TC-009 | SRS 4 |
| DEC-28 | Configurable workflows: readiness weights are fixed; acceptable or configurable. | WP-32 | SRS-PRINC-TC-009 | SRS 17 |
| DEC-29 | Student-data retention, deletion and anonymisation, and a data-protection legal assessment (A-07): requires a separate approval; none is built. | WP-34 | SRS-SECURITY-TC-011/013/014 | Preserved decision |
| DEC-30 | RESOLVED by DEC-31 (2026-11-12): the 25 organisational SRS-PROC cases and the release documents may be handled during Gate 6 when they do not represent missing application functionality. | WP-35 (moved to Gate 6) | SRS-PROC-TC-001..025 | RESOLVED |
| DEC-31 | DECIDED 2026-11-12: Gate 4 is complete when all approved in-scope application functionality is implemented and verified, the relevant automated tests pass, and unresolved critical functional defects are addressed. Organisational and process cases and release documentation may be handled during Gate 6 if they do not represent missing application functionality. | All | All non-passing cases (SRS-PROC and SRS-DELIV may move to Gate 6 when they are not missing functionality) | RESOLVED |

### Fixtures register

| # | Fixture | Needed by |
|---|---|---|
| FX-01 | Seeded data in every module for two institutions (A and B) and every role, with cross-institution counterparts | WP-01, WP-02, WP-05..WP-09, WP-17, WP-30, WP-31 |
| FX-02 | Fault-injection seam and clock or token-expiry control (absent from production builds) | WP-01, WP-03, WP-04, WP-22 |
| FX-03 | Recorded-response mock AI providers and hostile-text corpus for prompt injection | WP-03, WP-07, WP-08, WP-10, WP-18, WP-19, WP-20 |
| FX-04 | Production-mode server plus flood harness (rate limits on) and cron due-work seeding | WP-01, WP-04 |
| FX-05 | Large synthetic datasets and a concurrency harness (g3-07 builds 30,201 students already) | WP-01, WP-26 |
| FX-06 | Test accounts for new roles (Interviewer, Trainer, Alumni, company recruiters) created through scripts | WP-13, WP-14, WP-15, WP-17 |
| FX-07 | Sandbox runtime or external-system stubs (coding sandbox, ERP/LMS, meeting provider) | WP-23, WP-25 |
| FX-08 | Local backup and restore target (second Docker Postgres) for a recovery drill | WP-28 |
| FX-09 | Real devices and assistive technology for manual accessibility sessions | WP-29, WP-30 |

## 9. Cases that cannot be completed without a product decision or additional fixtures

Full per-case list with the blocker class is in `gate-4-test-inventory.csv` (column 'Blocker class').

**Needs product decision (124):** M01-TC-008; M06-TC-011; M07-TC-035, 038-039; M08-TC-011; M14-TC-006-007, 028-029; M21-TC-038; ROLE-ALM-TC-001-006; ROLE-EMP-TC-008-012; ROLE-FAC-TC-008; ROLE-INT-TC-001-006; ROLE-PERM-TC-003, 005, 008, 011, 017-019; ROLE-PRN-TC-008; ROLE-TRN-TC-001-008; SA-TC-003; SRS-AI-TC-003, 005-006, 013-015, 021-022, 025, 039, 045; SRS-DATA-TC-011-013, 022-023, 057-058, 065, 067, 071, 073-076, 078-079, 081-082, 094-095; SRS-FLOW-TC-025-026; SRS-INT-TC-001-002, 007, 009-011; SRS-NFR-TC-002, 018-021, 023; SRS-PRINC-TC-009; SRS-REL-TC-004, 031, 034, 046, 054; SRS-REPORT-TC-001-013, 016-018; SRS-SECURITY-TC-008; SRS-STRUCT-TC-001, 005, 008-009; SRS-UI-TC-044, 046, 050-051, 068, 073

**Needs browser test build (3):** SA-TC-038-040

**Needs fixtures (devices, assistive technology) (8):** SRS-NFR-TC-010-017

**Needs decision (thresholds) and fixtures (23):** SRS-NFR-TC-001, 004-009, 024-039

**Blocked on decision and legal review (3):** SRS-SECURITY-TC-011, 013-014

**Held by decision (9):** M01-TC-002, 004; M15-TC-021, 037; M19-TC-003; M20-TC-003-004; SRS-INT-TC-004-005

**Future scope / preserved (10):** SA-TC-005, 008; SRS-INT-TC-012; SRS-REL-TC-057-062; SRS-UI-TC-080

**Process (owner) (25):** SRS-PROC-TC-001-025

## 10. Work packages in detail

Each package lists: exact case IDs, SRS references, existing implementation, missing implementation, dependencies, security implications, required automated tests, required browser or end-to-end tests, acceptance criteria, complexity, decisions and fixtures. 'Evidence basis' says whether I verified the statement in code in this assessment or it is carried from the Gate 1 audit and checklist.

### 1. WP-01 Test harness repair, fixtures and refreshed baselines

| | |
|---|---|
| Status | **Completed 2026-11-12, awaiting your review.** The cases below that are still not Pass are explained in section 12. |
| Phase and kind | A. Foundation; Foundation |
| Complexity | **Medium** |
| Cases not yet passing | 0 (Not Run 0, Blocked 0) |
| Test case IDs | none |
| SRS references | SRS 14 (acceptance testing and QA); 9 (reliability); 3.1 (platform security) |
| Dependencies | None. Everything below depends on it. |
| Decisions required | None |
| Fixtures required | FX-01, FX-02, FX-03, FX-04, FX-05 |
| Evidence basis | Verified in this review (runner and results) plus reported in results section 6 |

**Existing implementation.** Local Docker stack (tests/e2e/stack, guard:local); 14 Gate 3/4 API suites (g3-01..08, g4-04..09) and DB suites that all pass; ~820 unit assertions; mock AI providers in g4 suites; mail sink. Old numbered E2E suites 03-14 (logs dated 2026-11-11) cover M1-M4 and M18 helpers; 4 of them hold 10 stale assertions (06: 5, 07: 2, 08: 2, 11: 1) verified by hand as out-of-date tests.

**Missing implementation.** (a) tests/e2e/run.mjs cannot start on Windows (spawns npx without a shell); suites 03-14 not re-run since 2026-11-11. (b) 10 stale assertions in suites 06/07/08/11 and the stale placement-flow.spec.ts selector. (c) 3 lint errors outside feature code (hooks/use-mobile.ts, scripts/list-routes.mjs, scripts/seed-demo.ts). (d) Seeded per-module data so cross-institution probes have records to probe (12 Blocked cases). (e) Fault-injection seam for a forced mid-transaction failure (SA-TC-025). (f) Clock control or token-revocation check for session expiry (SA-TC-033). (g) Production-mode server plus flood harness for rate limits (SA-TC-034). (h) Cron routes run against seeded due work for a suspended institution (SA-TC-030). (i) Evidence-mapping rules so already-run assertions are tied to case IDs only after review.

**Security implications.** Test-only changes; must keep the local-only guard (REQUIRE_LOCAL_DB, guard:local:check). The fault and clock seams must not exist in production builds (compile-time or env-guarded and covered by a test). No change to application behaviour to make an old test pass.

**Required automated tests.** Re-run suites 03-14 on the current build and refresh logs; update the 4 stale suites after reading each failing assertion; harness self-tests (runner starts on Windows; seam is absent in a production build); regenerate the report and confirm no case is promoted without an assertion.

**Required browser or end-to-end tests.** Fix or replace placement-flow.spec.ts (the 'Add department' selector); keep tests/web/platform-*.spec.ts green.

**Acceptance criteria.** Runner starts and runs all numbered suites on Windows; suites 03-14 re-run with 0 unexplained failures; lint shows 0 errors; each of SA-TC-025/030/033/034 has an executable test or a documented, approved reason it cannot; fixtures create data in every module for institutions A and B.

### 2. WP-02 Tenant isolation and access-control completion

| | |
|---|---|
| Status | **Completed 2026-11-12, awaiting your review.** The cases below that are still not Pass are explained in section 12. |
| Phase and kind | A. Foundation; Security |
| Complexity | **High** |
| Cases not yet passing | 6 (Not Run 0, Blocked 1) |
| Test case IDs | ROLE-PERM-TC-010-014, 016 |
| SRS references | SRS 9 (role-based access, institution isolation); 3 (permission principle, role matrices); 6; 14 |
| Dependencies | WP-01 (fixtures). |
| Decisions required | None |
| Fixtures required | FX-01 |
| Evidence basis | Verified: matrix counts from the code today; results and g3 suites reviewed |

**Existing implementation.** Route-level authorization wrappers (route/studentRoute/recruiterRoute/platformRoute) with deny-by-default for faculty and principal; read-only route matrix (725 endpoints, 449 staff). g3-02 sweep: 654 protected endpoints refuse anonymous callers, student/staff/recruiter/platform cross-portal probes and 792 wrong-role probes all refused; principal write refusals (255 probes); g3-04 tenant isolation across 33 collections that held data (59 probes).

**Missing implementation.** Cross-institution probes for the 12 modules that had no seeded records (M06, M07, M09, M10, M12, M13, M14, M15, M16, M17, M19, M21). The ROLE-PERM per-role matrix cases (9-16) and individual-student/company-specific access (6, 7) have no run of their own. The handler-level rules that the matrix cannot show (department scope, own records: 32 handlers narrow in source, 221 may in shared code) are not exercised per role. Several SRS-SECURITY cases are covered in substance by g3-02 but not mapped (15, 18, 21, ROLE-PERM-TC-020).

**Security implications.** This is the main confidentiality control. Any failure is a data-leak class defect and is fixed before further work. Tests must create two institutions with records in every module and assert 403/404 and no data in both directions for every role.

**Required automated tests.** Per-role, per-module read/write/delete probes across institutions A and B using the generated route list; department-scope tests for the coordinator on every handler flagged 'handler' or 'shared'; company-specific recruiter access; individual-student access; map the g3-02/g3-04 assertions to the cases they already prove (reviewed, not bulk-promoted).

**Required browser or end-to-end tests.** None required; one smoke per portal showing a refused cross-institution URL renders a safe error page.

**Acceptance criteria.** All 12 Blocked cross-institution cases executed with 0 leaks; every ROLE-PERM and SRS-SECURITY case in scope Pass or Fail-with-defect; any defect found is fixed with a regression test.

### 3. WP-03 Security verification: sessions, XSS, prompt injection, files, privacy controls

| | |
|---|---|
| Status | Not started |
| Phase and kind | A. Foundation; Security |
| Complexity | **High** |
| Cases not yet passing | 8 (Not Run 7, Blocked 1) |
| Test case IDs | SRS-NFR-TC-022; SRS-SECURITY-TC-003, 005, 009-010, 025, 027, 041 |
| SRS references | SRS 9 (secure sessions, encryption, consent, data visibility, secure file handling); 8 (AI rules: protect personal data); 14 |
| Dependencies | WP-01 (clock/session seam, Playwright baseline); WP-02 recommended first. |
| Decisions required | None (SRS-SECURITY-TC-003 needs the hosted configuration reviewed by the owner) |
| Fixtures required | FX-02, FX-03 |
| Evidence basis | Reported in results section 4 'Not covered yet' and Gate 1; not re-verified beyond the Gate 3/4 suites |

**Existing implementation.** Supabase JWT sessions with inactive-user and inactive-college rejection; platform second-step sign-in; request ids; error bodies free of stack/SQL (g3-02); suspended-institution token surfaces closed (G3-SEC-01); signed links for private documents; personality and voice consent; AI global switch and per-purpose switches (Gate 4.4); marksheet AI reading is off until an institution enables it.

**Missing implementation.** Browser-level stored-XSS check on every page that renders user text (SRS-SECURITY-TC-027, Blocked); AI prompt-injection tests with hostile text in JDs, resumes, answers and documents (SRS-SECURITY-TC-041); session-expiry and logout/revocation behaviour for staff and student sessions (SRS-SECURITY-TC-025, -005); secure upload handling beyond the suites already run (type, size, content sniffing, path, malware boundaries: SRS-NFR-TC-022); informed-consent flows and data-visibility controls exercised end to end (SRS-SECURITY-TC-009, -010); encryption in transit/at rest is provided by hosting and cannot be proven on the local stack (SRS-SECURITY-TC-003).

**Security implications.** Highest-value remaining security work after isolation. Prompt-injection tests must use mocked providers (no paid calls, no real student data). Encryption evidence for hosting is a document/configuration review, not a local test.

**Required automated tests.** Session expiry/revocation API tests; upload fuzz set (wrong type, oversize, double extension, polyglot PDF, path traversal names); mocked-AI injection corpus asserting no tool/data exfiltration, no instruction following from user text, and human-review labels preserved; consent and visibility matrix tests.

**Required browser or end-to-end tests.** Playwright: stored-XSS payloads entered through each text field that is later rendered (profile, projects, JD notes, discussion, support requests, announcements) and asserted inert in staff, student and recruiter views; logout and expired-session redirects.

**Acceptance criteria.** No executable payload renders; no AI output follows injected instructions in the corpus; sessions expire and revoked tokens are refused; hosting encryption item is closed by a reviewed configuration statement marked as such (not 'Pass' from a local run).

### 4. WP-04 Super Administrator portal closure and audit completeness

| | |
|---|---|
| Status | Not started |
| Phase and kind | A. Foundation; Platform |
| Complexity | **Medium** |
| Cases not yet passing | 18 (Not Run 15, Blocked 3) |
| Test case IDs | SA-TC-001-003, 038-040; SRS-FLOW-TC-029; SRS-STRUCT-TC-002; SRS-UI-TC-074-079, 081-084 |
| SRS references | SRS 3.1 (Super Administrator); 4; 6 (Super Admin Portal screens); 12 (workflow 8: administrator oversight); 9 (audit logs) |
| Dependencies | WP-01; WP-03 for session/rate-limit items (SA-TC-033/034 sit in WP-01 harness, executed here). |
| Decisions required | DEC-02 (audit failed/refused actions); DEC-01 is resolved |
| Fixtures required | FX-02, FX-04 |
| Evidence basis | Verified in this review (pages, endpoints, results) |

**Existing implementation.** 12 platform pages and 44 platform endpoints: institutions (search, filter, detail, edit, usage, staff roles), analytics, audit viewer, monitoring and job history, AI configuration and usage, support requests, access (read-only matrix, platform administrators), system configuration, integrations, policy and retention. 55 of 67 SA cases Pass (API/database evidence); 6 browser specs for governance plus earlier platform specs.

**Missing implementation.** (a) SA-TC-001/002/003 are umbrella cases never executed. (b) 10 SRS-UI Super Admin screen cases (SRS-UI-TC-074 to 079 and 081 to 084), SRS-STRUCT-TC-002 and SRS-FLOW-TC-029 still carry stale Gate 1 notes ('no such platform screen') although the screens now exist; they need executing. (c) SA-TC-038/039/040: /platform page states, create-and-suspend flow, accessibility and responsiveness have no browser run. (d) Audit completeness: refused or failed platform actions are not audited and an institution action is always logged as succeeded (Gate 1 4.1 limitation). (e) DEC-01 (decided 2026-11-12): accounts stay script-created; the A-18 add/invite API and screen were removed and tested. SA-TC-008 stays Blocked (Vercel Observability decision) and SA-TC-005/SRS-UI-TC-080 stay future scope: no work.

**Security implications.** Platform administrators see every institution. Verify MFA at every route, no cross-tenant write paths other than documented, no secrets in any response (already swept), audit before/after on every change. DEC-01 is applied: no API or screen creates an administrator (tested live and by a unit test).

**Required automated tests.** Execute SA-TC-001/002/003 as composed scenarios over the existing APIs; add audit-of-refusals tests if approved; session expiry and rate-limit cases from WP-01.

**Required browser or end-to-end tests.** Playwright for /platform: loading, empty, error and stale states; create and suspend institution; keyboard and 375 px layout with an accessibility scan.

**Acceptance criteria.** All SRS-UI Super Admin cases and SRS-STRUCT-TC-002 executed with recorded evidence; SA-TC-038/039/040 browser tests pass; audit completeness decision implemented and tested or explicitly deferred; SA-TC-008, SA-TC-005, SRS-UI-TC-080 untouched.

### 5. WP-05 Foundations: authentication, institution and student registration (M01-M03)

| | |
|---|---|
| Status | Not started |
| Phase and kind | B. Verify existing modules; Verification |
| Complexity | **Medium** |
| Cases not yet passing | 31 (Not Run 31, Blocked 0) |
| Test case IDs | M01-TC-001, 005, 007-008; M02-TC-003-004, 006-009, 011-012; M03-TC-001, 004-009, 014, 016, 018-019, 021, 026-032 |
| SRS references | SRS 5 modules 1, 2, 3 (login and registration, user management, institution structure, student registration, academic profile, documents, profile completion) |
| Dependencies | WP-01, WP-02. |
| Decisions required | DEC-03 (staff bulk upload) |
| Fixtures required | FX-01 |
| Evidence basis | Verified from results and suites |

**Existing implementation.** Invitations, sign-in, email OTP, MFA for administrators, roles, institution structure, student import with preview, profile sections, document upload with review, corrections. Old suites 10, 12, 13, 14 pass (117, 44, 100, 50) and 13 Pass cases in M01, 8 in M02, 19 in M03.

**Missing implementation.** Data-specific execution of the remaining M01 (3), M02 (8) and M03 (19) cases. M01-TC-008 staff bulk upload (Partial: only students import in bulk; staff are invited one at a time). M01-TC-002/004 (mobile OTP, SSO) are on hold and not in this package.

**Security implications.** Invitation tokens, OTP, MFA enrolment, role changes, document access. Verify token single-use and expiry, lockout, enumeration resistance, signed document links.

**Required automated tests.** Re-run suites 10, 12, 13, 14 on the current build and map reviewed assertions to the remaining cases; new API tests for the cases they do not reach.

**Required browser or end-to-end tests.** Playwright: invite-accept-onboarding path, student profile completion, document upload and review.

**Acceptance criteria.** All in-scope M01-M03 cases Pass or Fail-with-defect; staff bulk upload either built under DEC-03 or recorded as not required.

### 6. WP-06 Student development: assessment, roadmap, learning, resources, projects, internships, resume (M04-M10)

| | |
|---|---|
| Status | Not started |
| Phase and kind | B. Verify existing modules; Verification |
| Complexity | **High** |
| Cases not yet passing | 174 (Not Run 174, Blocked 0) |
| Test case IDs | M04-TC-001-029; M05-TC-001-015; M06-TC-001-010, 012-027; M07-TC-001-034, 036-037, 040-047; M08-TC-001-010, 012-018; M09-TC-001-016; M10-TC-001-025; SRS-REL-TC-044-045 |
| SRS references | SRS 5 modules 4, 5, 6, 7, 8, 9, 10 |
| Dependencies | WP-05 (students and profiles must exist); WP-01 fixtures. |
| Decisions required | None |
| Fixtures required | FX-01 |
| Evidence basis | Verified from results; counts exact |

**Existing implementation.** Instruments and scoring, Student 360 reading, roadmap, courses and live-session links, programmes, resource library with approval and recommendations, projects with mentor-link review, internships with feedback links, resume engine with PDF/Word and ATS checks. Unit tests cover rules; suites 07 and 08 hold 4 stale assertions; 1 to 2 Pass cases per module today.

**Missing implementation.** Execution of 172 not-yet-passing module cases (M04 29, M05 15, M06 26, M07 44, M08 17, M09 16, M10 25) plus SRS-REL-TC-044 and 045 (skill tracking, study planner), with data-specific API and browser tests; module cross-links (M8 to M10, M5 to M6 and M7). Partial items handled in their own packages: M06-TC-011 and M08-TC-011 (WP-26), M07-TC-035/038 (WP-26), M07-TC-039 (WP-20).

**Security implications.** Mentor and feedback links are public tokens: single purpose, expiry, rate limit and suspended-institution refusal (G3-SEC-01) must be re-asserted. Personality results private to the student. AI marking of descriptive answers must never expose other students' data.

**Required automated tests.** API suites per module with seeded data; data-connection checks from the checklist section 3; unit rules retained.

**Required browser or end-to-end tests.** Playwright journeys: take an assessment, follow a roadmap, complete a course lesson, submit a project, an internship cycle, build and download a resume.

**Acceptance criteria.** All in-scope cases Pass or Fail-with-defect; every defect fixed with a regression test; cross-institution probes for M06, M07, M09, M10 run (from WP-02).

### 7. WP-07 Recruitment and placement: JD, matching, campaigns, placement management (M11, M12, M13, M18)

| | |
|---|---|
| Status | Not started |
| Phase and kind | B. Verify existing modules; Verification |
| Complexity | **High** |
| Cases not yet passing | 139 (Not Run 139, Blocked 0) |
| Test case IDs | M11-TC-001-030; M12-TC-001-019, 021; M13-TC-001-063; M18-TC-001-026 |
| SRS references | SRS 5 modules 11, 12, 13, 18; SRS 12 (workflow JD to placement) |
| Dependencies | WP-05, WP-06 (student evidence feeds matching); WP-01. |
| Decisions required | None |
| Fixtures required | FX-01, FX-03 |
| Evidence basis | Verified from results; counts exact |

**Existing implementation.** JD upload, AI parsing with review, matching with explanations, preparation campaigns, drives, companies, rounds, offers, approvals, attendance, blocking rules, history. Old suites 03, 04, 05 pass (41, 54, 71). 0 to 2 Pass cases per module today (M12 has none).

**Missing implementation.** 139 Not Run cases (M11 30, M12 20, M13 63, M18 26) and the end-to-end workflow from JD to placement. Mocked-AI integration tests for JD parsing, matching and campaign plans.

**Security implications.** Recruiter and company-specific access; offer and approval authorisation; blocking rules; AI output must not auto-publish a JD (human review) and must not invent achievements.

**Required automated tests.** API suites with seeded companies, drives and students; mocked-AI integration tests; unit rules retained.

**Required browser or end-to-end tests.** Playwright: JD upload to approval, matching board and shortlist export, campaign creation to student plan, drive to offer.

**Acceptance criteria.** All in-scope cases Pass or Fail-with-defect; JD-to-placement scenario (SRS-FLOW) passes end to end on seeded data.

### 8. WP-08 Practice engines: mock tests, mock interviews, discussions, readiness (M14, M15, M17, M19)

| | |
|---|---|
| Status | Not started |
| Phase and kind | B. Verify existing modules; Verification |
| Complexity | **High** |
| Cases not yet passing | 102 (Not Run 102, Blocked 0) |
| Test case IDs | M14-TC-001-005, 008-027, 030-049, 051; M15-TC-001-020, 022-036; M17-TC-001-012; M19-TC-001-002, 004-010 |
| SRS references | SRS 5 modules 14, 15, 17, 19; SRS 8 (assessment and interview intelligence) |
| Dependencies | WP-06 (students, resources), WP-07 for job-linked practice; WP-01. |
| Decisions required | None for existing behaviour (voice redesign stays on hold) |
| Fixtures required | FX-01, FX-03 |
| Evidence basis | Verified from results; counts exact |

**Existing implementation.** Test engine with question types and AI marking of open answers, interview engine with Claude evaluation, discussion simulator, readiness engine with snapshots. Unit tests cover rules; 1 or 0 Pass cases each.

**Missing implementation.** 102 Not Run cases (M14 46, M15 35, M17 12, M19 9) plus 4+2+1 Partial cases handled elsewhere (coding/SQL in WP-23, voice/video on hold in WP-27). Concurrency of test submissions.

**Security implications.** Anti-cheating and answer privacy; AI evaluation cannot be influenced by injected text (WP-03); interview and discussion transcripts personal data; consent for voice (browser dictation only, nothing stored).

**Required automated tests.** Mocked-AI integration tests for marking, interview and discussion evaluation; concurrency tests for simultaneous submissions; readiness calculation versus independent SQL.

**Required browser or end-to-end tests.** Playwright: take a timed test, run a text interview, run a discussion, view readiness.

**Acceptance criteria.** All in-scope cases Pass or Fail-with-defect; cross-institution probes for M14, M15, M17, M19 run.

### 9. WP-09 Communication and dashboards: notifications, dashboards, analytics (M20, M21)

| | |
|---|---|
| Status | Not started |
| Phase and kind | B. Verify existing modules; Verification |
| Complexity | **Medium** |
| Cases not yet passing | 52 (Not Run 52, Blocked 0) |
| Test case IDs | M20-TC-001-002, 005-017; M21-TC-001-037 |
| SRS references | SRS 5 modules 20, 21; SRS 6 (dashboards) |
| Dependencies | WP-05..WP-08 for source data; WP-01. |
| Decisions required | None |
| Fixtures required | FX-01 |
| Evidence basis | Verified from results; counts exact |

**Existing implementation.** In-app and email notifications, preferences, reminders, calendar feeds, delivery log; dashboards per role; SMS and WhatsApp blocked server-side (hold enforced and tested).

**Missing implementation.** 52 Not Run cases (M20 15, M21 37). Dashboard numbers compared with independent SQL; reminder timing; quiet hours; email delivery through the mail sink. M21-TC-038 employer dashboard moves to WP-22.

**Security implications.** Notification content must not leak across institutions or to unintended students; dashboard queries respect department scope; the SMS/WhatsApp hold must be re-asserted in the regression.

**Required automated tests.** Dashboard-versus-SQL comparisons per role; notification rule and delivery tests with the mail sink; hold regression (channelhold tests).

**Required browser or end-to-end tests.** Playwright: each role's dashboard renders; notification centre read/unread; preference changes.

**Acceptance criteria.** All in-scope cases Pass or Fail-with-defect; no SMS or WhatsApp request is ever made.

### 10. WP-10 AI services verification with mocked providers (existing AI requirements)

| | |
|---|---|
| Status | Not started |
| Phase and kind | B. Verify existing modules; Verification |
| Complexity | **Medium** |
| Cases not yet passing | 38 (Not Run 38, Blocked 0) |
| Test case IDs | SRS-AI-TC-001-002, 004, 007-012, 016-020, 023-024, 026-038, 040-044, 046-049 |
| SRS references | SRS 8 (AI functional requirements, services 1 to 8 and implementation rules) |
| Dependencies | WP-06..WP-08 (features exist per module); WP-03 for injection. |
| Decisions required | None |
| Fixtures required | FX-03 |
| Evidence basis | Verified from results and AI suites |

**Existing implementation.** Shared AI gateway with administrator-managed providers, global and per-purpose switches, daily limits, usage statistics and health (Gate 4.4); Student 360, JD parsing, matching, test analysis, interviews, discussions, resume suggestions; correction requests; human-review labels.

**Missing implementation.** 38 existing AI cases never executed (SRS-AI-TC-001, 002, 004, 007-012, 016-020, 023, 024, 026-038, 040-044, 046-049), run with mocked providers: grounding in evidence, verified versus claimed data, labelling AI content, no invented achievements, protection of personal data. Partial and missing AI cases are in WP-18, WP-19, WP-20.

**Security implications.** No real student data to providers in tests; assert what is sent to the provider (minimal data), that keys never appear in logs or responses, and that limits and switches block calls before any request.

**Required automated tests.** Recorded-response mock providers; prompt-content assertions; label and review-state assertions; limit and switch regression (existing g4-04/05 suites).

**Required browser or end-to-end tests.** Playwright: AI label visible on AI text; staff correction of an AI mark.

**Acceptance criteria.** All in-scope SRS-AI cases Pass or Fail-with-defect.

### 11. WP-11 Existing integrations and monitoring re-baseline

| | |
|---|---|
| Status | Not started |
| Phase and kind | B. Verify existing modules; Verification |
| Complexity | **Low** |
| Cases not yet passing | 7 (Not Run 7, Blocked 0) |
| Test case IDs | SRS-INT-TC-003, 006, 008, 013-014; SRS-NFR-TC-019-020 |
| SRS references | SRS 10 (email, calendar, AI providers, cloud storage); 9 (monitoring, error tracking) |
| Dependencies | WP-01. |
| Decisions required | DEC-04 (is external alerting or an error-tracking service required beyond in-app monitoring) |
| Fixtures required | None |
| Evidence basis | Verified: monitoring built; results section 5c |

**Existing implementation.** SMTP with dry-run, calendar feeds and .ics, AI providers, Supabase Storage with signed links; in-app monitoring and job history and durable error records (Gate 4.3) with 170 integration assertions; integration status dashboard.

**Missing implementation.** Five existing SRS-INT cases never executed (email SRS-INT-TC-003, calendar 006, cloud storage 008, AI model providers 013, authorised APIs and provider terms 014). SRS-NFR-TC-019/020 (monitoring, error tracking) still carry the Gate 1 note 'JSON logs and a health endpoint; no tracking service' although in-app monitoring now exists; they need re-assessment and mapping to g3-08, with the external alerting question recorded. SA-TC-008 stays Blocked by decision.

**Security implications.** No secrets in monitoring responses (already swept); alerting destinations must not leak personal data.

**Required automated tests.** Map reviewed g3-08 and g4 evidence; add calendar and storage integration tests with local stack and mocks.

**Required browser or end-to-end tests.** None beyond the existing platform monitoring specs.

**Acceptance criteria.** SRS-INT existing cases and SRS-NFR-TC-019/020 resolved with evidence; whether external alerting is required is recorded as a decision.

### 12. WP-12 Report downloads and export formats (M16 plus ten missing reports)

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **High** |
| Cases not yet passing | 50 (Not Run 50, Blocked 0) |
| Test case IDs | M16-TC-001-028; SRS-FLOW-TC-026; SRS-REPORT-TC-001-020; SRS-UI-TC-046 |
| SRS references | SRS 11 (reporting and exports: 20 listed reports; PDF, Excel and CSV where appropriate); 5 module 16; 6 (TPO screens: final readiness report); 12 (workflow 5) |
| Dependencies | WP-05..WP-09 (data modules verified so reports can be compared with the database); WP-02 (reports must respect scope); decision DEC-05. |
| Decisions required | DEC-05 (format per report, A-10) |
| Fixtures required | FX-01 |
| Evidence basis | Verified in code today (report infrastructure and CSV usage) |

**Existing implementation.** ReportDoc rendering to PDF, Word and JSON (lib/reportDoc.ts, reportRoutes.ts, reportBuilders.ts); endpoints for test, interview, discussion, student performance and group reports, placement PDF, NIRF Excel, scheduled report emails, student/offer/application exports (Excel), resume PDF/Word. CSV appears only in the import helper and the historical-import route (verified in code today).

**Missing implementation.** Downloads for student profile, academic performance, career assessment, career roadmap, course completion, skill gap, project, internship, preparation campaign and job readiness reports (SRS-REPORT-TC-002-009, 013, 016); report downloads for resume (010), JD analysis (011), candidate matching (012), placement drive (017) and company hiring (018); CSV and format policy (SRS-REPORT-TC-001); SRS-UI-TC-046 final readiness report; SRS-FLOW-TC-026. Execution of the 28 Not Run M16 cases (M16-TC-029, the Blocked cross-institution case, is in WP-02).

**Security implications.** Reports contain the most concentrated personal data. Enforce role and department scope, institution isolation, personality results private to the student (existing rule), no data from other institutions, signed or authenticated downloads only, no PII in filenames or logs, and audit of exports.

**Required automated tests.** Each report generated for seeded data and compared field by field with independent SQL; format validity (PDF opens, Excel cell values, CSV encoding); role and scope matrix per report; large-report timing.

**Required browser or end-to-end tests.** Playwright: request and download each report from its screen; scheduled report email.

**Acceptance criteria.** Every listed report downloads in the approved format(s) with data equal to the database; refused for out-of-scope roles and institutions; the 20 SRS-REPORT cases (none passes today), the 28 M16 cases, SRS-UI-TC-046 and SRS-FLOW-TC-026 resolved.

### 13. WP-13 Interviewer role and portal, interview scheduling

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **High** |
| Cases not yet passing | 11 (Not Run 11, Blocked 0) |
| Test case IDs | ROLE-INT-TC-001-006; ROLE-PERM-TC-008, 018; SRS-REL-TC-034; SRS-STRUCT-TC-008; SRS-UI-TC-044 |
| SRS references | SRS 3.10 (Interviewer); 3 permission principle (temporary access); 4 (Interviewer Portal); 6; 13 release 3 (interview scheduling); 9 (MFA for privileged accounts) |
| Dependencies | WP-02 (isolation and authorisation foundation), WP-07 (drives and rounds); decisions DEC-06, DEC-07. |
| Decisions required | DEC-06 (access mechanism and MFA, A-03/A-05); DEC-07 (time slots versus windows, A-09) |
| Fixtures required | FX-01, FX-06 |
| Evidence basis | Verified in code today (role enum, panels, slots, token routes) |

**Existing implementation.** Staff-managed interview panels and time slots (InterviewPanel, InterviewSlot; app/api/drives/[id]/panels and slots with reschedule), drive feedback, one-time token links for external mentors (project review, internship feedback). No Interviewer role, login or portal (verified: the Role enum has five roles).

**Missing implementation.** Interviewer identity and access, assigned schedule, authorised candidate view, conducting interviews, evaluation forms, feedback, selection recommendation (ROLE-INT-TC-001-006), the role permission matrix (ROLE-PERM-TC-018), SRS-STRUCT-TC-008, temporary access (ROLE-PERM-TC-008), interview scheduling as time slots if required (SRS-UI-TC-044, SRS-REL-TC-034).

**Security implications.** New external-facing identity with access to candidate information: least privilege, time-boxed access, scope limited to assigned candidates only, MFA decision, no listing of other candidates, audit of every view and submission, revocation, rate limiting, token or account lifecycle.

**Required automated tests.** Authorisation matrix for the new role on every route; assigned-only visibility; expiry and revocation; evaluation submission idempotence and audit; tenant isolation.

**Required browser or end-to-end tests.** Playwright: interviewer sees only assigned slots, opens an authorised candidate, submits an evaluation and recommendation; expired access refused.

**Acceptance criteria.** All ROLE-INT cases, ROLE-PERM-TC-008/018 and SRS-STRUCT-TC-008 Pass; no interviewer can see an unassigned candidate; the 'no custom roles' decision still holds (a fixed, SRS-defined role only).

### 14. WP-14 Training Coordinator / Trainer role

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **Medium** |
| Cases not yet passing | 14 (Not Run 14, Blocked 0) |
| Test case IDs | ROLE-FAC-TC-008; ROLE-PERM-TC-017; ROLE-TRN-TC-001-008; SRS-REL-TC-046; SRS-STRUCT-TC-005; SRS-UI-TC-068, 073 |
| SRS references | SRS 3.7 (Training Coordinator / Trainer); 4 (Faculty / Trainer Portal); 6 (batch management, feedback and mentoring); 13 release 4 (training management) |
| Dependencies | WP-02; WP-06 (learning modules verified); decision DEC-08. |
| Decisions required | DEC-08 (one Faculty/Trainer portal with two roles, A-02) |
| Fixtures required | FX-06 |
| Evidence basis | Verified in code today (role enum) |

**Existing implementation.** Capabilities exist for placement staff and faculty: programmes, journeys, members, progress, courses, live sessions, resources and attendance; counselling slots and mentor notes for faculty. No Trainer role (verified).

**Missing implementation.** A Trainer role and scope, trainer-specific permission matrix (ROLE-PERM-TC-017), the eight Trainer functions (ROLE-TRN-TC-001-008 including a training report), SRS-STRUCT-TC-005, SRS-UI-TC-068/073, SRS-REL-TC-046, faculty mentoring session record (ROLE-FAC-TC-008).

**Security implications.** A fixed new role must be deny-by-default on every existing route (add to the matrix and sweeps); scope to assigned programmes and batches only; no access to placement data, personality results or personal documents.

**Required automated tests.** Matrix and sweep regeneration including the new role; scope tests; report content versus SQL.

**Required browser or end-to-end tests.** Playwright: trainer creates a programme and batch, schedules a class, marks attendance, views progress, downloads the training report.

**Acceptance criteria.** All ROLE-TRN cases, ROLE-PERM-TC-017, SRS-STRUCT-TC-005, SRS-UI-TC-068/073, SRS-REL-TC-046 and ROLE-FAC-TC-008 Pass; existing roles unchanged.

### 15. WP-15 Alumni / Industry Mentor role

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **Medium** |
| Cases not yet passing | 8 (Not Run 8, Blocked 0) |
| Test case IDs | ROLE-ALM-TC-001-006; ROLE-PERM-TC-019; SRS-REL-TC-054 |
| SRS references | SRS 3.11 (Alumni / Industry Mentor, seven functions); 13 release 5; 3 permission principle |
| Dependencies | WP-02; WP-06 (projects and internships verified); decision DEC-09. |
| Decisions required | DEC-09 (build only the seven functions; verification of external identities, A-04) |
| Fixtures required | FX-06 |
| Evidence basis | Verified in code today |

**Existing implementation.** External mentors review projects and internships through one-time links with no account; no alumni profile, mentorship offers or career sessions.

**Missing implementation.** Professional profile, mentorship offers, career sessions, industry guidance, support for internships and opportunities (ROLE-ALM-TC-001-005), project feedback through an account (ROLE-ALM-TC-006), ROLE-PERM-TC-019, SRS-REL-TC-054.

**Security implications.** External accounts with public-facing profiles: identity verification, what students may see, consent and privacy of both sides, abuse reporting, scope to the institution, no access to student data beyond what a mentee shares.

**Required automated tests.** Role matrix and isolation tests; profile visibility rules; mentorship request lifecycle; audit.

**Required browser or end-to-end tests.** Playwright: create profile, offer mentorship, student requests, session, feedback.

**Acceptance criteria.** All ROLE-ALM cases, ROLE-PERM-TC-019 and SRS-REL-TC-054 Pass; only the seven SRS functions exist.

### 16. WP-16 Staff access scopes (campus, batch) and role-model alignment

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **High** |
| Cases not yet passing | 7 (Not Run 7, Blocked 0) |
| Test case IDs | ROLE-PERM-TC-003, 005; ROLE-PRN-TC-008; SRS-DATA-TC-011-013; SRS-REL-TC-004 |
| SRS references | SRS 3 permission principle (institution, department, batch, individual, company-specific, temporary access); 3.2 (assign administrative permissions); 7 (identity: role, permission, user-role mapping) |
| Dependencies | WP-02; WP-13..WP-15 so the final role set is known; decisions DEC-10, DEC-11. |
| Decisions required | DEC-10 (campus and batch scope needed?); DEC-11 (record role and permission tables as satisfied by fixed roles); A-01 |
| Fixtures required | FX-01 |
| Evidence basis | Verified in code today (no tables; departmentId only) |

**Existing implementation.** Staff scope is college and department (User.departmentId); five fixed roles plus extra roles; read-only matrix; platform administrators assign existing roles. No Role or Permission tables (verified).

**Missing implementation.** Campus-level and batch-level staff scope (ROLE-PERM-TC-003, -005); who assigns administrative permissions, Principal or Head TPO (ROLE-PRN-TC-008, A-01); SRS-REL-TC-004 'role management partly covered'; SRS-DATA-TC-011/012/013 expect role, permission and user-role tables, which conflicts with the preserved decision of fixed roles and no editable permission rules.

**Security implications.** Scope data (which campus or batch a staff user may see) must be enforced in every query, not only the UI. Must not become editable permission rules. Privilege-escalation tests extend the existing guards.

**Required automated tests.** Scope enforcement tests on every list and detail route a scoped user can reach; escalation tests.

**Required browser or end-to-end tests.** Playwright: a batch-scoped coordinator sees only their batch.

**Acceptance criteria.** Decision recorded; if approved, scope assignment is data (not rules), enforced and tested; SRS-DATA-TC-011/012/013 recorded as satisfied-by-fixed-roles via a plan change if approved.

### 17. WP-17 Employer / recruiter portal verification and gaps

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Verification and build |
| Complexity | **Medium** |
| Cases not yet passing | 15 (Not Run 15, Blocked 0) |
| Test case IDs | M21-TC-038; ROLE-EMP-TC-002-012; SRS-FLOW-TC-025; SRS-UI-TC-050-051 |
| SRS references | SRS 3.9 (Employer / Company Administrator); 4; 6 (Employer Portal, 14 screens); 12 (workflow 4) |
| Dependencies | WP-02, WP-07; decision DEC-12. |
| Decisions required | DEC-12 (employer scope and company self-registration, A-20) |
| Fixtures required | FX-01, FX-06 |
| Evidence basis | Verified in code today (page and endpoint counts); detail never inspected |

**Existing implementation.** Recruiter portal: 3 pages and 11 endpoints (drives, jobs, candidates); companies created by placement staff; recruiters invited. Never inspected in depth in Gate 1 (A-20).

**Missing implementation.** Inspection and tests for ROLE-EMP-TC-008-012 (preparation resources, assessments, interviews, candidate reports, selection and offers: Unverified), 6 existing ROLE-EMP cases, SRS-UI-TC-050/051 company self-registration and profile (Partial), the 14 Employer Portal screen cases, M21-TC-038 hiring conversion, SRS-FLOW-TC-025. Several may reveal that required functions do not exist; those become findings.

**Security implications.** Company-specific access: a recruiter must see only their own company's drives and only candidates released to them; no student personal data beyond approved fields; invitation and registration abuse controls.

**Required automated tests.** Recruiter matrix and company-specific isolation; field-level exposure tests; invitation lifecycle.

**Required browser or end-to-end tests.** Playwright: recruiter signs in, sees drives and shortlisted candidates, records selection.

**Acceptance criteria.** Each case classified Pass, Fail-with-defect, or Missing with an approved scope decision; company isolation proven.

### 18. WP-18 AI evaluation provenance: model and prompt version retention

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **Medium** |
| Cases not yet passing | 1 (Not Run 1, Blocked 0) |
| Test case IDs | SRS-AI-TC-045 |
| SRS references | SRS 8 AI implementation rules (retain model and prompt versions for important evaluations) |
| Dependencies | WP-10 (AI behaviour verified first); decision DEC-13. Additive migration. |
| Decisions required | DEC-13 (which evaluations count as important, A-12) |
| Fixtures required | FX-03 |
| Evidence basis | Verified in schema today |

**Existing implementation.** Model name stored only for the AI provider configuration, daily usage statistics, document extraction and the Student 360 report (verified in the schema). AI marks of descriptive answers, interview evaluations and discussion evaluations do not record which model or prompt produced them.

**Missing implementation.** A recorded model identifier and prompt version for each important evaluation (SRS-AI-TC-045); scope of 'important' (A-12).

**Security implications.** Additive schema change on tables holding student evaluations; must not expose prompt text to students; provenance fields are metadata only; migration tested with rollback on the local stack.

**Required automated tests.** Evaluation writes include model and prompt version; old rows tolerate null; migration and rollback test; no prompt text in API responses.

**Required browser or end-to-end tests.** Staff view shows 'produced by model X, prompt v N' on an AI mark if approved.

**Acceptance criteria.** Each approved evaluation type stores provenance; SRS-AI-TC-045 Pass; migration reversible.

### 19. WP-19 Document intelligence extensions

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **Medium** |
| Cases not yet passing | 3 (Not Run 3, Blocked 0) |
| Test case IDs | SRS-AI-TC-003, 005-006 |
| SRS references | SRS 8 service 1 (document classification, quality checks, duplicate detection) |
| Dependencies | WP-05 (documents verified), WP-10; decision DEC-14. |
| Decisions required | DEC-14 (build now, and with which provider or local method) |
| Fixtures required | FX-03 |
| Evidence basis | Reported in checklist section 5; extraction route verified present |

**Existing implementation.** Marksheets read by an AI vision model with staff review before anything is verified; the feature is off until an institution switches it on (aiDocumentReading); OCR and extraction cases exist.

**Missing implementation.** Document classification, quality checks and duplicate detection (SRS-AI-TC-003, 005, 006).

**Security implications.** Documents are personal and academic records sent to a provider: keep the opt-in, minimise what is sent, no storage of provider copies, duplicate detection must not reveal another student's document, hashing rules.

**Required automated tests.** Mocked-provider tests; duplicate detection within and across institutions (must not cross); quality-check thresholds on fixtures.

**Required browser or end-to-end tests.** Playwright: upload a blurry or duplicate document and see the flag and review path.

**Acceptance criteria.** Three SRS-AI cases Pass under the approved design; isolation intact.

### 20. WP-20 AI-generated learning content: question generation, revision planning, AI-written plans

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **High** |
| Cases not yet passing | 8 (Not Run 8, Blocked 0) |
| Test case IDs | M07-TC-039; SRS-AI-TC-013-015, 021-022, 025, 039 |
| SRS references | SRS 8 services 3 and 5 and 8 (question generation, revision planning, learning and resource recommendations, preparation plans, next actions, grammar); 5 module 7 (AI resource recommendations) |
| Dependencies | WP-10, WP-18 (provenance first so generated content is traceable); decision DEC-15. |
| Decisions required | DEC-15 (are rules acceptable for the Partial AI items; is AI question generation required now) |
| Fixtures required | FX-03 |
| Evidence basis | Reported in checklist section 5 |

**Existing implementation.** Plans and recommendations are rules over the student's evidence; AI is used for tagging and some marking; no question generation; resource recommendations capped at five with reasons.

**Missing implementation.** Question generation and revision planning (SRS-AI-TC-013, 015); decide whether rule-based plans and recommendations satisfy the Partial items (SRS-AI-TC-014, 021, 022, 025, 039, M07-TC-039) or AI-written versions are required.

**Security implications.** Generated questions must be reviewed before use (human control), clearly labelled, grounded, no leakage of other students' data, cost limits through the existing AI limits and switches.

**Required automated tests.** Mocked-provider tests; review-state gate before publishing; label assertions; limit enforcement.

**Required browser or end-to-end tests.** Playwright: staff generates questions, reviews and publishes; student sees a revision plan.

**Acceptance criteria.** Approved items Pass; rule-based items either accepted by decision (recorded) or rebuilt.

### 21. WP-21 JD and eligibility change history; data-model conformance

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build and verification |
| Complexity | **Medium** |
| Cases not yet passing | 92 (Not Run 92, Blocked 0) |
| Test case IDs | SRS-DATA-TC-001-010, 014-095 |
| SRS references | SRS 7 (core entities; history of JD changes and eligibility changes); 11.2 and 11.3 (JD review) |
| Dependencies | WP-07 (JD module verified); decisions DEC-16, DEC-17. |
| Decisions required | DEC-16 (JD/eligibility history required now); DEC-17 (derived or JSON entities acceptable, A-11) |
| Fixtures required | None |
| Evidence basis | Verified in schema today |

**Existing implementation.** Audit log records that a JD or eligibility rule changed and who changed it, but not the earlier content (verified: no JD version tables). Many SRS entities are held as fields, JSON or derived values rather than their own tables (skills, evidence, candidate match, interview questions and responses and others).

**Missing implementation.** Old versions of JDs and eligibility rules viewable or restorable (SRS-DATA-TC-095); a decision whether the 18 Partial SRS-DATA entities need tables (A-11; three SRS-DATA cases, 011/012/013, sit in WP-16); a schema-inspection suite for the 75 existing SRS-DATA cases.

**Security implications.** Version history stores earlier content that may contain personal or confidential company data: same access rules as the live record, retention interaction (not student-data deletion), audit on restore.

**Required automated tests.** Automated schema-conformance checks mapped to entities; version write and restore tests; migration with rollback.

**Required browser or end-to-end tests.** Playwright: edit a JD twice, view history, restore.

**Acceptance criteria.** History available per the approved scope; SRS-DATA cases classified Pass, accepted-by-decision (derived or JSON) or built.

### 22. WP-22 Asynchronous AI work and job retry

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **High** |
| Cases not yet passing | 3 (Not Run 3, Blocked 0) |
| Test case IDs | SRS-NFR-TC-002-003, 021 |
| SRS references | SRS 9 (long-running AI and document processing asynchronous with progress; retry for failed background jobs) |
| Dependencies | WP-01; WP-10; decision DEC-18 (architecture). |
| Decisions required | DEC-18 (deployment target and acceptable approach; hosting constraints) |
| Fixtures required | FX-02 |
| Evidence basis | Verified: no queue dependency |

**Existing implementation.** AI calls run in the request with time limits and a spinner; jobs are safe to re-run (stable item keys); message delivery retried by the sweep; job history and durable errors (Gate 4.3). No queue library (verified).

**Missing implementation.** Queue or deferred execution with progress for long AI and document work (SRS-NFR-TC-002, -003) and a retry mechanism for failed background jobs (SRS-NFR-TC-021).

**Security implications.** Queued payloads hold personal data: encryption and retention of job payloads, per-institution isolation of results, idempotency, no secrets in job records, poison-message handling.

**Required automated tests.** Failure and retry tests, concurrency and idempotency, progress states, isolation of results.

**Required browser or end-to-end tests.** Playwright: start a long operation, see progress, reload, get the result.

**Acceptance criteria.** Approved design implemented; the three cases Pass; failure of the queue cannot lose or duplicate student-affecting actions.

### 23. WP-23 Coding and SQL execution environment

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **High** |
| Cases not yet passing | 6 (Not Run 6, Blocked 0) |
| Test case IDs | M14-TC-006-007, 028-029; SRS-INT-TC-010; SRS-REL-TC-031 |
| SRS references | SRS 5 module 14 (coding and SQL tests); 10 (coding assessment environments); 13 release 3 (coding assessment) |
| Dependencies | WP-08; decision DEC-19. Do not start without an approved sandbox design. |
| Decisions required | DEC-19 (build a sandbox, buy a service, or accept reading-based marking, A-15) |
| Fixtures required | FX-07 |
| Evidence basis | Reported in checklist section 5 |

**Existing implementation.** Coding and SQL answers are marked by an AI reading them; nothing is executed (checklist; AI marking path in the interview and test engines).

**Missing implementation.** Execution of submitted code or SQL against test cases in a sandbox (M14-TC-006, 007, 028, 029; SRS-INT-TC-010; SRS-REL-TC-031).

**Security implications.** Remote code execution is the highest-risk feature in the product: isolated runtime, resource and time limits, no network, no host access, per-submission isolation, abuse and cost controls. Option to keep reading-based marking instead.

**Required automated tests.** Sandbox escape and resource-exhaustion tests; correctness on a reference corpus; isolation between submissions and institutions.

**Required browser or end-to-end tests.** Playwright: write code, run tests, see results.

**Acceptance criteria.** Either a reviewed sandbox design is implemented and attacked successfully in tests without escape, or the decision records reading-based marking as accepted.

### 24. WP-24 Public landing page

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build |
| Complexity | **Low** |
| Cases not yet passing | 1 (Not Run 1, Blocked 0) |
| Test case IDs | SRS-STRUCT-TC-001 |
| SRS references | SRS 4 (Public Website / Landing Page) |
| Dependencies | None technically; decision DEC-20. |
| Decisions required | DEC-20 (landing content, A-17; production use of /design) |
| Fixtures required | None |
| Evidence basis | Verified in code today |

**Existing implementation.** The home route redirects to the sign-in screen (verified: app/page.tsx renders HomeRedirect). A /design route exposes a UI-kit showcase page.

**Missing implementation.** A public landing page (SRS-STRUCT-TC-001); content is undefined in the SRS (A-17). Confirm whether /design should exist in production.

**Security implications.** Public pages must expose no tenant data, no internal routes or build details; rate limit contact forms if any; review the /design showcase for production exposure.

**Required automated tests.** Route and exposure checks; no data fetches.

**Required browser or end-to-end tests.** Playwright: landing renders, links to sign-in, 375 px layout.

**Acceptance criteria.** SRS-STRUCT-TC-001 Pass under approved content; /design disposition recorded.

### 25. WP-25 Small partial items: resource targets, GitHub, video conferencing, ERP and external LMS

| | |
|---|---|
| Status | Not started |
| Phase and kind | C. Build missing features; Build or decide |
| Complexity | **Medium** |
| Cases not yet passing | 9 (Not Run 9, Blocked 0) |
| Test case IDs | M06-TC-011; M07-TC-035, 038; M08-TC-011; SRS-INT-TC-001-002, 007, 009, 011 |
| SRS references | SRS 5 module 7.3 (resource assignment: JDs, mock interviews); module 8 (GitHub); module 6 (live sessions); 10 (video conferencing, GitHub, ERP/SIS, university systems, external LMS) |
| Dependencies | WP-06 for the resource and project items; decisions DEC-21 to DEC-24. |
| Decisions required | DEC-21 (resource targets, A-13); DEC-22 (GitHub depth); DEC-23 (meeting creation provider); DEC-24 (ERP/SIS target and external LMS, A-08) |
| Fixtures required | FX-07 |
| Evidence basis | Verified in code today for GitHub and meeting link; rest reported |

**Existing implementation.** Resources assign to students, departments, batches, groups, skill gaps and mock-test takers, and reach JDs through campaign plans; GitHub commit counts for public repositories only (lib/projectService.ts); live sessions carry a meeting link and attendance; students arrive by CSV import.

**Missing implementation.** Direct resource targets JD and mock interview (M07-TC-035, 038); GitHub beyond public counts (M08-TC-011, SRS-INT-TC-009); creation of meetings (M06-TC-011, SRS-INT-TC-007); ERP/SIS and university system integration (SRS-INT-TC-001, 002) and external LMS (SRS-INT-TC-011) cannot be built or tested without a named target (A-08).

**Security implications.** Every outbound integration needs credential storage, scope minimisation and failure isolation; ERP data is personal data: field mapping, consent and reconciliation. Without a target, no work and no test is possible.

**Required automated tests.** Per item once decided; mocks for external systems.

**Required browser or end-to-end tests.** Per item once decided.

**Acceptance criteria.** Each item built under a recorded decision, or recorded as not required or blocked on a named target.

### 26. WP-26 Performance, scalability and reliability measurement

| | |
|---|---|
| Status | Not started |
| Phase and kind | D. Non-functional; Verification |
| Complexity | **High** |
| Cases not yet passing | 23 (Not Run 23, Blocked 0) |
| Test case IDs | SRS-NFR-TC-001, 004-009, 024-039 |
| SRS references | SRS 9 (performance 2 to 3 seconds, scalability, reliability and failure behaviour) |
| Dependencies | WP-05..WP-09 (features), WP-12 (report generation); decision DEC-25. |
| Decisions required | DEC-25 (expected load and thresholds, A-06) |
| Fixtures required | FX-05 |
| Evidence basis | Verified: g3-07 and g3-08 timings |

**Existing implementation.** Platform analytics and monitoring timings measured on a 376-institution, 30,201-student dataset (g3-07, g3-08); failure injection for database, storage, SMTP and AI in the monitoring suite; indexes and bounded cleanups.

**Missing implementation.** Measurements for large student lists, bulk import, large report generation, dashboard loading, search, pagination, concurrent sign-ins, applications and test submissions, AI timeouts, provider failures, scheduled job failures and N+1 queries (SRS-NFR-TC-001, 004-009, 024-039). Thresholds depend on expected load, which the SRS does not define (A-06).

**Security implications.** Load tests run only on the local stack with synthetic data; failure injection must not touch hosted services; confirm that failure modes fail closed (no authentication bypass).

**Required automated tests.** Seeded large-dataset benchmarks with recorded medians and maxima; concurrency harness; failure-injection reuse from g3-08.

**Required browser or end-to-end tests.** Playwright traces for dashboard load time and a pagination walk.

**Acceptance criteria.** Measured numbers recorded for every listed operation; pass or fail only against thresholds approved in DEC-25; defects such as missing indexes fixed with regression timings.

### 27. WP-27 Held by decision: voice and video, SMS and WhatsApp, mobile OTP, SSO (no work)

| | |
|---|---|
| Status | Not started |
| Phase and kind | D. Non-functional; Held |
| Complexity | **Low** |
| Cases not yet passing | 9 (Not Run 9, Blocked 0) |
| Test case IDs | M01-TC-002, 004; M15-TC-021, 037; M19-TC-003; M20-TC-003-004; SRS-INT-TC-004-005 |
| SRS references | SRS 5 modules 1, 15, 19, 20; 10 (SMS gateways, WhatsApp Business) |
| Dependencies | Not scheduled. |
| Decisions required | Preserved decisions; lifting any needs a new approval |
| Fixtures required | None |
| Evidence basis | Verified: hold enforced and tested in the A-18 review |

**Existing implementation.** Voice is browser dictation with a microphone check and consent; no audio or video stored; SMS and WhatsApp adapters exist and are blocked server-side by a code constant (hold enforced and tested); OTP is by email only.

**Missing implementation.** Nothing to build while the holds stand: mobile-number OTP (M01-TC-002), SSO (M01-TC-004), SMS and WhatsApp (M20-TC-003/004, SRS-INT-TC-004/005), voice redesign (M15-TC-021, M15-TC-037, M19-TC-003).

**Security implications.** The SMS/WhatsApp block must stay in every regression run. No change to voice handling (no audio stored) without a new decision.

**Required automated tests.** Hold regression only (channelhold unit and database tests).

**Required browser or end-to-end tests.** None.

**Acceptance criteria.** Cases remain Not Run (held); hold regression stays green.

### 28. WP-28 Backup, disaster recovery and recovery procedures

| | |
|---|---|
| Status | Not started |
| Phase and kind | D. Non-functional; Verification and documentation |
| Complexity | **Medium** |
| Cases not yet passing | 3 (Not Run 3, Blocked 0) |
| Test case IDs | SRS-NFR-TC-018, 023; SRS-SECURITY-TC-008 |
| SRS references | SRS 9 (backup and disaster recovery, recovery procedures); 15 (backup and recovery procedures) |
| Dependencies | WP-33 (document set); decision DEC-26. |
| Decisions required | DEC-26 (authorise or defer a hosted-environment drill; accept local drill meanwhile) |
| Fixtures required | FX-08 |
| Evidence basis | Reported in checklist and production checklist |

**Existing implementation.** Relies on Supabase backups; the production checklist asks for a drill; no in-app backup or restore.

**Missing implementation.** A tested restore drill and written procedures (SRS-NFR-TC-018, 023, SRS-SECURITY-TC-008, SRS-DELIV-TC-016). A drill on the hosted project is not permitted in this work; a local restore of the Docker database can prove the procedure and timings only.

**Security implications.** Backups contain all tenant data: restore only into isolated environments, encrypt and control access, test that restore does not resurrect deleted or retention-cleaned rows unexpectedly, no hosted access without approval.

**Required automated tests.** Local backup and restore drill with row-count and checksum comparison; restore-time measurement.

**Required browser or end-to-end tests.** None.

**Acceptance criteria.** Procedure written and exercised locally; hosted verification explicitly marked as requiring approved access and not claimed.

### 29. WP-29 Usability, accessibility and responsive behaviour

| | |
|---|---|
| Status | Not started |
| Phase and kind | D. Non-functional; Verification |
| Complexity | **Medium** |
| Cases not yet passing | 9 (Not Run 9, Blocked 0) |
| Test case IDs | SRS-NFR-TC-010-017; SRS-STRUCT-TC-009 |
| SRS references | SRS 9 (usability, mobile-responsive, accessible colour contrast and keyboard navigation); 4 (mobile-responsive student application) |
| Dependencies | WP-30 (browser suites); decision DEC-27. |
| Decisions required | DEC-27 (is a native app required, or is responsive web with a manifest accepted) |
| Fixtures required | FX-09 |
| Evidence basis | Reported in checklist; platform phone-width verified |

**Existing implementation.** Responsive components, labelled controls, a manifest for the student portal; phone-width checks on the new platform screens (6 browser tests).

**Missing implementation.** Never tested on devices or with assistive tools (SRS-NFR-TC-011, 015; SA-TC-040 is owned by WP-04 but shares this method); the other usability cases (SRS-NFR-TC-010, 012, 013, 014, 016, 017); native app (SRS-STRUCT-TC-009: only a responsive web app and manifest exist).

**Security implications.** Accessibility work must not weaken error messages (no information leakage); no new public pages.

**Required automated tests.** Automated accessibility scans (axe) per screen; contrast checks.

**Required browser or end-to-end tests.** Playwright at 375, 768 and 1280 px per portal; keyboard-only paths; manual screen reader and device sessions (cannot be automated).

**Acceptance criteria.** Zero critical automated findings on in-scope screens; manual session notes recorded; native app decision recorded.

### 30. WP-30 Browser E2E coverage of the SRS screen lists by portal

| | |
|---|---|
| Status | Not started |
| Phase and kind | D. Non-functional; Verification |
| Complexity | **High** |
| Cases not yet passing | 67 (Not Run 67, Blocked 0) |
| Test case IDs | SRS-UI-TC-001-043, 045, 047-049, 052-067, 069-072 |
| SRS references | SRS 6 (key user interface and screen requirements: Student, TPO, Employer, Faculty/Trainer, Super Admin portals); 4 |
| Dependencies | WP-05..WP-09, WP-13..WP-15, WP-17. |
| Decisions required | None |
| Fixtures required | FX-01, FX-09 |
| Evidence basis | Verified from case counts |

**Existing implementation.** Playwright specs for platform audit, analytics, monitoring, AI, institution and governance screens; older specs for earlier modules (one stale).

**Missing implementation.** Screen-level cases not yet run: Student Portal 27, TPO Portal 21, Employer Portal 14 (some in WP-17), Faculty/Trainer 10 (some in WP-14), Super Admin 11 (in WP-04), plus one general screens case. Many are satisfied by the module browser journeys planned in WP-05 to WP-09.

**Security implications.** Screens must hide actions the role cannot perform and must not rely on hidden controls for security (API enforcement already tested); no cross-role data in rendered pages.

**Required automated tests.** None beyond what the screens call.

**Required browser or end-to-end tests.** One Playwright spec per portal covering each listed screen's states (loading, empty, error, populated) and role differences.

**Acceptance criteria.** Every SRS-UI case in scope Pass or recorded against the package that owns the missing screen.

### 31. WP-31 Role workflow verification (TPO, officer, coordinator, faculty, principal, student)

| | |
|---|---|
| Status | Not started |
| Phase and kind | E. Closure; Verification |
| Complexity | **Medium** |
| Cases not yet passing | 55 (Not Run 55, Blocked 0) |
| Test case IDs | ROLE-FAC-TC-002-007; ROLE-HOD-TC-002-003, 005-007; ROLE-PO-TC-001-004, 006-010; ROLE-PRN-TC-001-004, 006-007; ROLE-STU-TC-001-004, 006-014; ROLE-TPO-TC-001-002, 004-005, 007-013; SRS-STRUCT-TC-003-004, 006-007, 010 |
| SRS references | SRS 3.2 to 3.8 (role responsibilities); 3 permission principle; 4 (institution admin portal); 12 |
| Dependencies | WP-02, WP-05..WP-09 (each workflow rides on module data). |
| Decisions required | None |
| Fixtures required | FX-01 |
| Evidence basis | Verified from case counts |

**Existing implementation.** Fixed roles with route-level and handler-level rules; many suites cover pieces of these workflows; Principal is read-only by design.

**Missing implementation.** Role-by-role workflow cases never executed end to end: ROLE-TPO 11, ROLE-PO 9, ROLE-HOD 5, ROLE-FAC 6, ROLE-PRN 6, ROLE-STU 13, plus SRS-STRUCT-TC-003, -004, -006, -007, -010.

**Security implications.** Each workflow is also a negative test: what the role must not do. Principal remains read-only; faculty see only what the faculty routes allow.

**Required automated tests.** Scenario tests per role composed from module API calls.

**Required browser or end-to-end tests.** One Playwright scenario per role.

**Acceptance criteria.** All in-scope ROLE cases Pass or Fail-with-defect.

### 32. WP-32 Acceptance, release, objectives and traceability closure

| | |
|---|---|
| Status | Not started |
| Phase and kind | E. Closure; Verification |
| Complexity | **Medium** |
| Cases not yet passing | 177 (Not Run 177, Blocked 0) |
| Test case IDs | SRS-ACCEPT-TC-001-054; SRS-DEF-TC-001-006; SRS-FLOW-TC-001-024, 027-028, 030; SRS-OBJ-TC-001-014; SRS-PRINC-TC-001-011; SRS-REL-TC-001-003, 005-030, 032-033, 035-043, 047-053, 055-056, 063; SRS-VISION-TC-001-015 |
| SRS references | SRS 1 (vision, objectives, definitions); 13 (release plan); 14 (acceptance testing); 17 (design principles); 12 (end-to-end workflows) |
| Dependencies | All feature and verification packages (this is the last engineering step). |
| Decisions required | DEC-28 (configurable workflow weights, SRS-PRINC-TC-009) |
| Fixtures required | None |
| Evidence basis | Verified from case counts |

**Existing implementation.** Plan cases written for acceptance criteria, release items, objectives and principles; most map onto features verified in other packages.

**Missing implementation.** SRS-ACCEPT 54, SRS-REL 50 (the other 13 release items are traced in WP-06, 13, 14, 15, 16, 23 and 36), SRS-FLOW 27 (three are traced in WP-04, 12 and 17), SRS-OBJ 14, SRS-VISION 15, SRS-DEF 6, SRS-PRINC 10, and SRS-PRINC-TC-009 (Partial: configurable workflows, readiness weights fixed). Close by tracing each to the passing cases that prove it, and by running the end-to-end workflow scenarios.

**Security implications.** None new; confirm the traced security cases are Pass, not merely mapped.

**Required automated tests.** Traceability report generated from the results; workflow scenarios.

**Required browser or end-to-end tests.** End-to-end scenarios already built in WP-05 to WP-09.

**Acceptance criteria.** Every case here is Pass by traced evidence, or its dependency is open and stated; no case is promoted without an assertion.

### 33. WP-33 Release deliverables and documentation

| | |
|---|---|
| Status | Not started |
| Phase and kind | E. Closure; Documentation |
| Complexity | **Medium** |
| Cases not yet passing | 19 (Not Run 19, Blocked 0) |
| Test case IDs | SRS-DELIV-TC-001-019 |
| SRS references | SRS 15 (development deliverables); 16 (responsibilities) |
| Dependencies | Feature packages (documentation reflects final behaviour); WP-28 for recovery procedures. |
| Decisions required | None |
| Fixtures required | None |
| Evidence basis | Verified from docs folder and case counts |

**Existing implementation.** Generated route list (docs/ROUTES.md), README, in-app help, production checklist, local environment guide, AI configuration, monitoring, platform analytics and governance documents; the test plan and results.

**Missing implementation.** Product architecture document, UI/UX wireframes, AI integration documentation, administrator manuals, technical handover and backup/recovery procedures (six SRS-DELIV cases with no document at all: 001, 002, 009, 014, 015, 016); design system, API documentation, security documentation and user manuals, and the test-cases deliverable (five Partial: 003, 005, 010, 012, 013); eight more existing-class SRS-DELIV cases still to be verified.

**Security implications.** Security documentation must not contain secrets; API documentation must not publish internal-only routes as supported.

**Required automated tests.** Docs-versus-code checks: route list regenerates cleanly, permission matrix in sync (existing tests).

**Required browser or end-to-end tests.** None.

**Acceptance criteria.** Each deliverable exists, is reviewed by the product owner, and matches the code at release.

### 34. WP-34 Student-data retention, deletion and data-protection compliance (decision-blocked)

| | |
|---|---|
| Status | Not started |
| Phase and kind | E. Closure; Decision-blocked |
| Complexity | **High** |
| Cases not yet passing | 3 (Not Run 3, Blocked 0) |
| Test case IDs | SRS-SECURITY-TC-011, 013-014 |
| SRS references | SRS 9 (data retention policies, data deletion workflows, applicable Indian data protection compliance) |
| Dependencies | Decision DEC-29; legal review. Nothing to implement now. |
| Decisions required | DEC-29 (separate approval for student-data deletion/anonymisation; legal assessment) |
| Fixtures required | None |
| Evidence basis | Preserved decision; Gate 1 A-05 |

**Existing implementation.** Retention for three operational tables only (Gate 4 A-18). Consent, correction requests and an access log exist. No breach process, retention schedule, deletion workflow or grievance contact.

**Missing implementation.** SRS-SECURITY-TC-011, 013, 014. By standing decision, no student-data deletion or anonymisation functionality is built without a separate approved decision; compliance cannot be claimed without a legal assessment (A-07).

**Security implications.** Deletion of student records is irreversible and affects placement history, audit and reports; any future design needs legal input, soft-delete options, audit and restore rules.

**Required automated tests.** None until approved.

**Required browser or end-to-end tests.** None until approved.

**Acceptance criteria.** Cases stay Blocked on decision until an approved design exists; no compliance claim is made.

### 35. WP-35 Organisational process cases (product owner and team responsibilities)

| | |
|---|---|
| Status | Not started |
| Phase and kind | E. Closure; Process |
| Complexity | **Low** |
| Cases not yet passing | 25 (Not Run 25, Blocked 0) |
| Test case IDs | SRS-PROC-TC-001-025 |
| SRS references | SRS 16 (product owner and developer responsibilities, change management) |
| Dependencies | Owner input; not engineering. |
| Decisions required | DEC-30 (does Gate 4 completion include organisational cases or are they a Gate 5/release activity) |
| Fixtures required | None |
| Evidence basis | Verified from case counts |

**Existing implementation.** Cases are document-review cases about responsibilities; not software behaviour.

**Missing implementation.** Evidence from the organisation: approvals, validations, pilot testing records, change records (SRS-PROC-TC-001-025).

**Security implications.** None.

**Required automated tests.** None.

**Required browser or end-to-end tests.** None.

**Acceptance criteria.** Each case closed by a reviewed document or recorded as not applicable by the owner.

### 36. WP-36 Future scope and decided-not-now (no work)

| | |
|---|---|
| Status | Not started |
| Phase and kind | E. Closure; Future / preserved |
| Complexity | **Low** |
| Cases not yet passing | 10 (Not Run 9, Blocked 1) |
| Test case IDs | SA-TC-005, 008; SRS-INT-TC-012; SRS-REL-TC-057-062; SRS-UI-TC-080 |
| SRS references | SRS 3.1 (subscriptions and billing, if applicable); 10 (payment gateway); 13 release 6 (future enhancements); 3.1 monitor application performance |
| Dependencies | Not scheduled. |
| Decisions required | Preserved decisions |
| Fixtures required | None |
| Evidence basis | Preserved decisions |

**Existing implementation.** Not built by decision; SA-TC-008 is Blocked under the Vercel Observability decision.

**Missing implementation.** Nothing: SA-TC-005, SRS-UI-TC-080, SRS-INT-TC-012, SRS-REL-TC-057 to 062, SA-TC-008.

**Security implications.** None while unbuilt.

**Required automated tests.** None.

**Required browser or end-to-end tests.** None.

**Acceptance criteria.** Remain Not Run or Blocked exactly as recorded; any change needs a new approval.

## 11. Proposed Gate 4 exit criteria and limits of this assessment

**Decided (DEC-31, 2026-11-12):** Gate 4 is complete when all approved in-scope application functionality is implemented and verified, the relevant automated tests pass, and unresolved critical functional defects are addressed. Organisational and process cases (SRS-PROC) and release documentation (SRS-DELIV) may be handled during Gate 6 if they do not represent missing application functionality. The registers above are read with this definition: a case that is only an organisational or documentation case does not hold Gate 4 open, and a missing application function does.

Limits of this assessment:

* It reconciles the plan, results, checklist, change log and Gate 1 to Gate 4 reports with the code at a structural level (routes, schema, roles, pages, report framework). It did not run the application or any test; status counts are those in `full-application-test-results.csv`.
* Statements carried from the Gate 1 audit and checklist and not re-checked here are marked 'Reported' in the CSV. The 14 stale notes were found by matching note text, not by running the cases.
* Complexity is Low, Medium or High as requested; it reflects scope, security exposure and dependency depth, not a time estimate. Case counts show size.
* Assignment of a case to exactly one package is by its primary owner; some cases also depend on a second package (for example report cases need the module data verified first). Dependencies are stated per package.
* The 'Ready to execute' count is the number of cases whose feature exists. Executing a case can still reveal a defect or a missing function, which becomes a finding with its own regression test.
* Nothing here approves, schedules or starts any work. I stopped after the assessment and await your approval before implementing the next package.

## 12. Completion record: WP-01 and WP-02 (2026-11-12, awaiting your review)

Only these two packages were started. Evidence is in the results report (G3-SYS-19 to 22, G4-F01 to F06) and in the suites named below; every case status in this document comes from recorded assertions.

### 12.1 Where the cases of these two packages stand now

| Case | Status now | Why |
|---|---|---|
| SA-TC-025 | Pass | Pass: forced failure after the rows were written leaves nothing behind (g4-10) |
| SA-TC-030 | Pass | Pass after a defect was found and fixed (scheduled reports for a suspended institution) |
| SA-TC-033 | Pass | Pass: expired, tampered, revoked, deactivated (g4-10) |
| SA-TC-034 | Pass | Pass: production rate limits and flood guard (g4-10) |
| M06-TC-028 | Pass | see the results report |
| M07-TC-048 | Pass | see the results report |
| M09-TC-017 | Pass | see the results report |
| M10-TC-026 | Pass | see the results report |
| M12-TC-020 | Pass | see the results report |
| M13-TC-064 | Pass | see the results report |
| M14-TC-050 | Pass | see the results report |
| M15-TC-038 | Pass | see the results report |
| M16-TC-029 | Pass | see the results report |
| M17-TC-013 | Pass | see the results report |
| M19-TC-011 | Pass | see the results report |
| M21-TC-039 | Pass | see the results report |
| ROLE-PERM-TC-006 | Pass | see the results report |
| ROLE-PERM-TC-007 | Pass | see the results report |
| ROLE-PERM-TC-009 | Pass | Pass: every SRS 3.1 function is reachable within the approved A-18 scope (read-only where decided; accounts script-created by DEC-01) |
| ROLE-PERM-TC-010 | Fail | Fail: SRS 3.2 lists 'Monitor training activities' (no principal route) and 'Assign administrative permissions' (the Head TPO assigns, A-01); the principal's 14 routes are exactly the read-only set |
| ROLE-PERM-TC-011 | Blocked | Blocked: every SRS 3.3 function is reachable; 'and nothing else' is an owner decision (447 routes) |
| ROLE-PERM-TC-012 | Fail | Fail: SRS 3.4 'Manage assigned departments or batches' has no implementation; 'nothing else' is an owner decision |
| ROLE-PERM-TC-013 | Fail | Fail: SRS 3.5 'Assign faculty mentors', 'Review departmental training', 'Monitor project and internship activities', 'Support placement preparation' are refused to a coordinator; department scoping itself passes |
| ROLE-PERM-TC-014 | Fail | Fail: SRS 3.6 course creation, resource upload, assignments, student progress, feedback and mentoring sessions are not available to Faculty |
| ROLE-PERM-TC-015 | Pass | Pass: every SRS 3.8 function probed is reachable; staff and platform routes are refused |
| ROLE-PERM-TC-016 | Fail | Fail: SRS 3.9 company profile edit, JDs, eligibility, AI-parsed requirements, preparation resources and assessments have no recruiter route (the portal has 11) |
| ROLE-PERM-TC-020 | Pass | Pass: the live guards equal the declared guards for 701 routes and methods x 10 identities |
| SRS-SECURITY-TC-015 | Pass | see the results report |
| SRS-SECURITY-TC-018 | Pass | see the results report |
| SRS-SECURITY-TC-020 | Pass | see the results report |
| SRS-SECURITY-TC-021 | Pass | see the results report |
| SRS-SECURITY-TC-033 | Pass | see the results report |

### 12.2 Findings from the work (none hidden)

* **G4-F02 (Medium, FIXED):** The scheduled-reports job e-mailed a suspended institution's due report and advanced its schedule. Fixed; before/after evidence kept in `tests/gate3/results/evidence/`.
* **G4-F03 (High for accuracy, FIXED):** The A-18 permission matrix was wrong for routes whose options are imported (91 coordinator routes over-reported, 23 Faculty routes under-reported). No access was wider than the code allowed; the description was wrong. Generator fixed, unit-tested; the live check now finds no difference.
* **G4-F01 (Medium, OPEN, needs your approval to fix):** Student 360 weak subjects are always empty for real records (reads score/marks/percentage; the snapshot stores marksObtained/maxMarks). Outside WP-01/02, so not changed; suite 06 keeps the failing assertion.
* **G4-F05 (SRS gaps, owner decisions):** Role capability gaps listed in 12.1. They are incomplete role workflows (WP-31 and the role packages), not access leaks.
* **G4-F04 (Low, OPEN):** Settings dropdown lists are not refreshed after adding a department in the same visit.
* **G4-F06 (documented limit):** A revoked session is still accepted for up to 60 seconds by a server that had cached the token.

### 12.3 Remaining limitations of these two packages

* ROLE-PERM-TC-009 to 016 compare the code with the SRS function lists by mapping each function to the nearest route; the mapping is my judgement and can be questioned. 'Nothing else' cannot be shown by automation because the SRS does not say its lists are exhaustive.
* Encryption at rest and in transit (SRS-SECURITY-TC-003) and the hosted configuration are not testable on the local stack and are not part of these packages.
* The live matrix test sends malformed bodies only to mutating routes it knows parse a body or carry an id; 18 write calls by allowed identities were skipped as unsafe (no body check, no id).
* Cross-institution isolation was proven for the 12 modules with minimal seeded records: it shows the access checks hold for those routes, not that every possible field of every response is free of other-tenant data.
* Fixtures are synthetic and local. Test institutions are removed after each suite; platform-admin sign-ins created by earlier suites remain in the local Auth store.

# Existing Code vs Docs: Gap Analysis and Implementation Plan

Scope of the check: `applciation/` (Next.js 16, Prisma 7, Supabase) read against `stundentfeatures.md`, `placementfeatures.md`, the SRS, and the Superset walkthrough (`superset-analysis-and-phased-flow.md`).

**How "built" was judged:** a route, page, model or library file exists and its logic was read at a glance. I did **not** run the app, typecheck or the ~900 e2e checks, so "built" means "present in code", not "verified working".

---

## 1. What the code is

- ~530 tracked files, **319 API endpoints** (`docs/ROUTES.md`), ~100 Prisma models, 19 migrations, three logins (staff, student, recruiter) over Supabase Auth, per-college tenancy, modules switched per college.
- Roles in code: `TPO_ADMIN`, `PLACEMENT_OFFICER`, `DEPARTMENT_COORDINATOR`. Recruiter is a separate login.
- Staff UI (~25 areas) and student UI (22 pages) exist, built from shadcn components.
- Tests: unit scoring test, e2e suites 03 to 09, two Playwright flows.

**Conclusion:** the code already implements almost all of `stundentfeatures.md` and `placementfeatures.md`. The SRS "intelligence" layer (JD analysis, matching, skill gaps, campaigns, readiness, roadmap, LMS) is almost entirely absent. So the plan is "complete, fix and verify the base, then build the SRS layer on top", not "build from the start".

---

## 2. Student feature spec vs code

| Spec section | Code status | Evidence |
|---|---|---|
| 1 Account and access (invite, sign-in, sign out everywhere, PWA, blocked / module-off messages) | Built | invites routes, `student/privacy` global sign-out, `manifest.ts`, `sw.js`, module gating in `lib/api/guards.ts` |
| 2 Dashboard | Built | `student/page.tsx`, `api/student/me` |
| 3.1 Profile sections, draft / submit / verify / lock, changes requested | Built | `StudentSection`, `pendingData` for verified edits, `section-review.tsx` |
| 3.2 Personality test with consent, retake, sharing, deletion | Built | `psychometrics*`, `student/personality`, `PsychAccessLog` |
| 3.3 Participation status and requests | Built | `participation-requests` |
| 3.4 Full view and PDF | Built | `student/overview`, `resume.pdf` |
| 4.1 to 4.4 Drives, apply, track, offers | Built | `student/drives`, `lib/ops/apply.ts`, `offers`, resume snapshot migration |
| 4.5 Job alerts, 4.6 Calendar with .ics | Built | `job-alerts`, `calendar/page.tsx` |
| 5 Attendance QR, 6 Blocking | Built | `attendance/*`, `blocking/*`, `student/blocks` |
| 7 Preparation (AI mock interview, resources, experiences, counselling) | Built | `lib/mockInterview.ts` calls the Claude API; `prep/*` |
| 8 Resume tools, shareable link | Partly | `lib/resume.ts` is a completeness checklist, not a generator; showcase link and PDF exist |
| 9 Assessments with timer, practice tests | Built | `student/assessments/*`, `studentAssessments.ts` |
| 10 Events and learning | Built | `events`, `learning` |
| 11 to 13 Notifications, help, privacy | Built | notifications, tickets, FAQs, privacy page, access log |
| 15 Deferred (push, SMS, SSO, ERP, multi-campus, retention) | Not built (deliberate) | listed in README "Not built" |

**Staff spec** (`placementfeatures.md`) maps the same way: onboarding, verification queue, 360 view, companies, drives, offers, approvals, attendance, blocking, analytics, NAAC/NIRF, communications, tickets, settings, audit, and add-on modules all have routes and pages. Not built: SMS / WhatsApp / push, SSO / MFA, ERP, multi-campus, data retention, in-app backup.

### Doc and code drift to fix
1. `README` says AI mock interviews are "not built (decided)", but the code has them. Either the decision changed or the README is stale. Confirm and update.
2. README "Known limitations": profile sections other than Academics accept **free-form JSON**; the real shape lives only in `lib/web/sections.ts` (UI). This is the biggest data-quality risk and the main blocker for matching.
3. PDFs use built-in fonts, so non-Latin characters print as `?` (matters for Indian-language names).
4. `AGENTS.md` and `README` aside, there is no spec for the Home "next action" panel the SRS asks for; the current Home is a status view.

---

## 3. SRS vs code

| SRS module | Status | Notes |
|---|---|---|
| 1 Auth and users | Partly | Email auth and invites yes. Phone OTP, SSO, MFA, login history: no |
| 2 Institution | Partly | College, department, program, academic year, batch: yes. Campus, semester entity, faculty allocation: no |
| 3 Student profile and documents | Partly | Sections and documents yes. **OCR extraction: no**. Skills have no level or evidence. No guardians, accomplishments, languages with proficiency, volunteering |
| 4 Career assessments | Partly | Personality instrument exists (`psychometrics.ts`). RIASEC, DISC, aptitude categories, 360 career profile: no |
| 5 Career roadmap | None | No model |
| 6 LMS | Partly | `LearningProgramme` and steps exist; no courses, lessons, quizzes, certificates |
| 7 Resource management | Partly | `PrepResource` exists. No metadata set, approval workflow, assignment to JD / group / skill gap, effectiveness |
| 8 Projects and portfolio | None | Projects are free text in a section |
| 9 Internships | Built | `Internship`, work logs, evaluations (PPO tracking not checked) |
| 10 Dynamic resume | Partly | PDF export and checklist yes. Templates, JD tailoring, ATS check, version history, claimed-vs-evidenced skills: no |
| 11 JD upload and AI parsing | **None** | `Drive.description` is free text; no requirement entity |
| 12 AI matching | **None** | Eligibility is numeric rules only (`lib/eligibility.ts`: CGPA, 10th, 12th, backlogs, department / batch / program, placed) |
| 13 Preparation campaigns | **None** | No campaign, invitation, individual plan |
| 14 Mock test engine | Partly | Banks, papers, schedules, attempts, practice tests exist. Not tied to a JD; no coding / SQL types checked |
| 15 AI mock interview | Partly | Text interview with feedback (5 questions, one topic). No JD link, voice / video, learning vs assessment mode, previous-attempt comparison |
| 16 Reports | Partly | Placement, NIRF, resume PDF yes. Mock test, interview, skill-gap, readiness reports: no |
| 17 Job readiness | Minimal | `/api/student/readiness` just counts verified sections, assessment average, drives attended, mock interview average. Not the two-score model |
| 18 Placement management | Built | Drives, rounds, results, offers, joining; status history via `ApplicationEvent` |
| 19 GD simulator | None | |
| 20 Notifications | Partly | In-app and email yes; SMS, WhatsApp, calendar push no |
| 21 Dashboards | Built for staff and student; principal and employer dashboards partly (recruiter portal) |

SRS roles not in code: Super Admin, Institution Admin, HOD (close to department coordinator), Faculty / Mentor, Trainer, Interviewer, Alumni.

---

## 4. Items the Superset walkthrough adds that the code lacks

| Superset behaviour | In code? |
|---|---|
| Identity fields from a trusted source and locked | No (typed by student / imported) |
| Per-entry verified ticks, change-request history | Section-level status and pending revisions; no per-field tick |
| Placement enrolment per season with Placed status | No season entity; `Student.isPlaced` flag only |
| Offer caps per category, level and season | Partly (blocking policies, one offer rule); no category / level caps |
| NOC request after offer | No |
| Accomplishments split (certification, test scores, patents, scholarships) | No |
| Skills with proficiency level; languages with proficiency | No (plain tags) |
| Guardians, positions of responsibility, volunteering | No |
| Applicable-courses list on each job | Via program / department ids; student-facing readability not checked |

---

## 5. Implementation plan (phases)

Phases follow dependencies: data quality, then structure, then intelligence.

### Phase A: Verify and stabilise (small)
- Run `typecheck`, `lint`, `test:unit`, `test:e2e` (throwaway DB only), `check:exposure`; record the baseline.
- Reconcile README with code (mock interviews, routes, modules).
- Fix PDF fonts for non-Latin names.
- **Exit:** a green baseline we can regress against.

### Phase B: Typed profile and evidence
- Replace free-form JSON with typed, Zod-validated shapes per section, with a migration of existing data.
- Skills: name, level, source (self / project / certificate / assessment), evidence link.
- Add accomplishments (certification, test score, award, etc.), languages with proficiency, positions of responsibility, guardians, volunteering as list sections.
- Per-item verification state where useful; keep section-level review.
- OCR-assisted marksheet extraction as a *suggestion* the student confirms and staff verify (SRS 3.3).
- **Exit:** every profile field is typed, validated, and usable by matching.

### Phase C: Structured job requirements (JD) and student-facing clarity
- New `DriveRequirement` (skill / qualification, mandatory vs preferred, weight, min level) plus selection-process fields.
- Manual entry first; then JD upload (PDF / DOCX / paste) with AI extraction, **TPO review and approval before publish** (SRS rule).
- Student drive page shows requirements and, separately, eligibility reasons (already exists) so mandatory eligibility never mixes with the match score.
- **Exit:** a published drive has reviewed, structured requirements.

### Phase D: Matching and skill gaps
- Explainable score per student per drive (configurable weights), evidence per skill, "missing / partial / matched".
- TPO shortlist view: rank, compare, filter; student view: "why I match, what I'm missing".
- Rules: eligibility stays a hard filter; personality data is never an input; every recommendation stores its inputs and model version.
- **Exit:** the candidate-result display in SRS section 12 works end to end.

### Phase E: Preparation campaigns
- Campaign from an approved drive: selected candidates, dates, owner, trainers, resources, milestones.
- Student invitation (accept / decline / ask for help), individual prep plan (AI-drafted, TPO-editable), resource assignment, progress dashboard and "falling behind" list.
- Reuse `PrepResource`, `LearningProgramme` and notifications; extend resources with the SRS metadata and approval status.
- **Exit:** SRS Release 2 acceptance list.

### Phase F: Job-specific tests, interviews and readiness
- Link `AssessmentPaper` to a drive / campaign; add coding and SQL question types as needed.
- Upgrade AI interview: JD-aware, learning vs assessment mode, longer sessions, comparison with earlier attempts, consent text. Needs the **data-sharing decision** (below).
- Two scores: Career Readiness Index and Job-Specific Readiness, explainable, never promised as selection.
- Reports: mock test, interview, skill gap, readiness (PDF / online).
- **Exit:** SRS Release 3.

### Phase G: Resume and portfolio
- Templates, JD-tailored version, ATS check, version history, student approval, "claimed vs evidenced" skills.
- Projects as first-class records (team, milestones, GitHub link, faculty review), portfolio generation.
- **Exit:** SRS Release 5 core.

### Phase H: Development layer
- Career assessments beyond personality (RIASEC, aptitude), 360 career profile, four-year roadmap with semester milestones, LMS (courses, lessons, quizzes, certificates), AI tutor, study planner.
- New roles: Faculty / Mentor, Trainer.
- **Exit:** SRS Release 4.

### Phase I: Institution scale and compliance
- Multi-campus, SSO / MFA, ERP sync, data-retention and deletion workflows, SMS / WhatsApp / push, scheduled backups, principal dashboard, alumni mentors, interviewer portal, GD simulator.
- **Exit:** SRS Release 6.

**Parallelism:** G (resume) depends only on B, so it can run next to C to F. H depends on B and partly F.

---

## 6. Decisions needed before Phase B/C

1. **AI data sharing.** The code already sends students' interview answers to the Claude API. README flagged this as undecided. Confirm consent wording and whether answers may leave the college's boundary, since JD parsing, matching, prep plans and tutoring will all use AI.
2. **Which AI model and where it runs** (cost, latency, a fallback if the key is missing; the code already returns "AI not configured").
3. **Role model.** Keep three staff roles for now and add Faculty / Trainer in Phase H, or generalise roles first?
4. **Season model.** Superset tracks placement enrolment per season. Do you want a `PlacementSeason` entity before multi-year analytics grow, or is `Batch` enough?
5. **Matching weights.** Start with the SRS illustrative weights (30 / 20 / 15 / 10 / 10 / 10 / 5) or let each college set them from day one?
6. **Existing data.** Is there production data in the profile JSON that Phase B must migrate, or is this still a dev database?

---

## 7. Suggested next step
Start Phase A (baseline), then detail Phase B: typed section schemas, migration approach and acceptance checks. I will not change code until you confirm the phase order.

# SRS vs application code: module checklist

Source of requirements: `SOFTWARE REQUIREMENTS SPECIFICATION Placement (1).docx`, plus the Placement Officer / Student workflow audit you pasted.
Scope: Placement Officer (staff portal) and Student portal only. Employer, Faculty, Interviewer, Alumni and Super Admin portals are out of scope here.

## How to use this file

Every line is unticked. **You tick `[x]` once you have tested it and agree it is done.**
The **Code** column is my reading of the source code, not a test result:

| Mark | Meaning |
|---|---|
| ⏸ On hold | You decided to defer it. Kept in the backlog, not dropped. |
| ✅ Built | The feature exists in the code (UI and API) and matches the requirement. |
| 🟡 Partial | Something exists but it is smaller than the requirement. The note says what is missing. |
| ❌ Missing | Nothing in the code for it. |

Your own rule applies: a module counts as complete only when its screens, backend and links to other modules have been tested. The Code mark does not replace that. The one exception is the invitation and student onboarding work, which has automated tests (`tests/e2e/10-student-invitations.mjs`, `tests/e2e/11-intelligence.mjs`).

Last checked against the code: 2026-11-10 (all modules; sections 2, 3 and 5 re-checked, the per-module lines were written as each module was built).

## Summary (generated from the lines below)

| Module | Lines | ✅ Built | 🟡 Partial | ❌ Missing | ⏸ On hold | You ticked it done |
|---|---|---|---|---|---|---|
| M1 – Authentication and User Management | 17 | 15 | 0 | 0 | 2 | [ ] |
| M2 – Institution Management | 13 | 13 | 0 | 0 | 0 | [ ] |
| M3 – Student Registration and Profile | 19 | 19 | 0 | 0 | 0 | [ ] |
| M4 – Student Assessment and Career Profiling | 21 | 21 | 0 | 0 | 0 | [ ] |
| M5 – Career Roadmap and Student Development | 10 | 8 | 2 | 0 | 0 | [ ] |
| M6 – Learning Management System | 11 | 8 | 3 | 0 | 0 | [ ] |
| M7 – Resource Management System | 9 | 7 | 2 | 0 | 0 | [ ] |
| M8 – Project Management and Portfolio | 7 | 6 | 1 | 0 | 0 | [ ] |
| M9 – Internship Management | 7 | 7 | 0 | 0 | 0 | [ ] |
| M10 – Dynamic Resume Engine | 9 | 9 | 0 | 0 | 0 | [ ] |
| M11 – Job Description Management and AI Analysis | 7 | 7 | 0 | 0 | 0 | [ ] |
| M12 – AI Candidate Matching Engine | 8 | 8 | 0 | 0 | 0 | [ ] |
| M13 – Job-Specific Preparation Campaign | 8 | 8 | 0 | 0 | 0 | [ ] |
| M14 – Mock Test Engine | 10 | 10 | 0 | 0 | 0 | [ ] |
| M15 – AI Mock Interview Engine | 7 | 6 | 1 | 0 | 0 | [ ] |
| M16 – Report Generation | 5 | 5 | 0 | 0 | 0 | [ ] |
| M17 – Job Readiness Engine | 5 | 5 | 0 | 0 | 0 | [ ] |
| M18 – Placement Management | 13 | 13 | 0 | 0 | 0 | [ ] |
| M19 – Group Discussion and Communication Simulator | 9 | 8 | 1 | 0 | 0 | [ ] |
| M20 – Notification Centre | 10 | 9 | 1 | 0 | 0 | [ ] |
| M21 – Dashboards and Analytics | 8 | 7 | 1 | 0 | 0 | [ ] |
| **Total** | **213** | **199** | **12** | **0** | **2** | |

## Cross-module findings worth reading first

Rewritten 2026-11-10 after Modules 6 to 21 were built. The earlier findings (no LMS, projects as a text field, only two AI features, three staff roles, no readiness score) are no longer true.

1. **Every module M1 to M21 now has code.** Remaining non-built lines are listed in the summary table and in section 5. Nothing here has been run in a browser by me: "Built" means the code, build and unit tests agree, not that you have tested it.
2. **Four things are built but not proven against a live service:** SMS and WhatsApp sending (Twilio-style adapter, needs your account and approved WhatsApp templates), the AI features (they need `ANTHROPIC_API_KEY` and `GROQ_API_KEY`), email (needs SMTP), and the hourly reminder job (needs the scheduler; it is now in `vercel.json`).
3. **No end-to-end browser tests exist for Modules 6 to 21.** The Playwright suites (`tests/e2e`, 12 files) cover the older modules. The newer modules have unit tests for their rules only.
4. **Coding and SQL answers are read by the AI, never run.** There is no code execution environment.
5. **Section 5 below lists SRS requirements that are not part of any module list and are missing or partial**: several of the section 11 reports, AI question generation, model and prompt version retention, data retention and deletion, public landing page, interviewer, trainer and alumni portals, ERP integration.

---

## 1. Module checklist

### M1 – Authentication and User Management

**Placement Officer side**
- [ ] Invite students by email — ✅ Built: single invite and bulk invite, single-use hashed link, expiry, resend, revoke, copy link (`/staff/students/invite`, `lib/invitations/`)
- [ ] Bulk upload users from Excel/CSV — ✅ Built: student import with preview and row errors (`/staff/students/import`). Staff accounts are invited one at a time.
- [ ] Add staff users individually and invite by email — ✅ Built (`/staff/settings` → Staff)
- [ ] Activate or deactivate accounts — ✅ Built: students and staff; deactivating blocks the login
- [ ] Assign roles — ✅ Built (Phase 1): three roles, and a person can hold several (main role plus extras); permissions are the union, and a coordinator who is also an officer or admin is not limited to one department
- [ ] Reset access — ✅ Built (Phase 1): admin sends a password-reset email to staff, officers do so for students, admin removes a staff member's authenticator app (lost phone); all audited
- [ ] View login history — ✅ Built (Phase 1): every sign-in session is recorded (time, method, 2-step, device, address); admins see staff history, officers see student history, everyone sees their own. Failed sign-in attempts are not recorded (Supabase does not tell the app).
- [ ] Account actions recorded in audit logs — ✅ Built (`/staff/audit`, `AuditLog`)

**Student side**
- [ ] Accept college invitation and activate account — ✅ Built: `/invite`, email confirmation, password rules, single use
- [ ] Email and password login — ✅ Built
- [ ] Mobile number and OTP login — ⏸ On hold (decision): the OTP option is by email only
- [ ] Institutional single sign-on / Google OAuth — ⏸ On hold (decision)
- [ ] Password recovery — ✅ Built (`/forgot-password`)
- [ ] Multi-factor authentication for privileged accounts — ✅ Built (Phase 1): authenticator-app (TOTP) for administrators. Once set up it is always enforced on the server; admins can require it for every administrator (refused until the person turning it on has their own). Settings → Security, and My security page.
- [ ] A student is linked to an institution — ✅ Built: every student belongs to a college
- [ ] A user cannot open a portal that is not theirs — ✅ Built: staff, student and recruiter APIs refuse each other's tokens

**Connection**
- [ ] M1 creates an authenticated student record linked to the existing invited record (no duplicate) — ✅ Built and tested

### M2 – Institution Management

Re-checked 2026-11-09 against the SRS list (institution registration, university association, campus, department, programme, branch, academic year, batch, semester, faculty allocation, student import, institution-specific configuration, multiple institutions without mixing data, the hierarchy). "Tested": **unit** = `tests/unit/institution.test.mts` (passing); **E2E written** = `tests/e2e/13-institutions.mjs` exists but I have not run it; I have not clicked these screens through in the app. Nothing below is ticked: that is yours to do.

**Placement Officer side**
- [ ] Institution registration and profile — ✅ Built: a platform administrator (separate sign-in, mandatory two-step verification) registers a new institution with its first admin, modules and settings in one audited step (`/platform`, `lib/provision.ts`); the college's own admin edits name, logo and brand colour. Tested: unit; E2E written.
- [ ] University association — ✅ Built: managed universities per college, programmes link to one (`/api/settings/universities`, `Program.universityId`); the old free-text name is kept in step. Tested: unit.
- [ ] Campus management — ✅ Built (`Settings → Campuses`).
- [ ] Departments, programmes, branches — ✅ Built (branches belong to a programme).
- [ ] Academic years, batches, semesters — ✅ Built, with checks that they fit together, and a read-only integrity report.
- [ ] Faculty allocation — ✅ Built: a FACULTY role with a profile, allocation to departments, programmes and batches, and a mentor per student; faculty reach only their own students and are refused everywhere else by default. Tested: unit; E2E written.
- [ ] Student import — ✅ Built (preview, column mapping, row errors, confirm, error download, template).
- [ ] Institution-specific configuration — ✅ Built: required profile sections, invitation expiry, declaration text, offer rules, approvals, security, modules.
- [ ] Multiple institutions without mixing data — ✅ Built: every record carries a college id, queries are scoped to it, and a second college can now be created from the platform portal. One login belongs to one college.
- [ ] Hierarchy Institution → Campus → Department → Programme → Batch → Semester → Student — ✅ Built.

**Student side**
- [ ] Student sees their assigned institution, department, programme, batch (read-only) — ✅ Built: wizard step 1, with "Request a correction".
- [ ] Student does not re-enter institution, programme or batch — ✅ Built.

**Connection**
- [ ] M2 structure feeds M3 (invitation form, import, mapping rules) — ✅ Built.

### M3 – Student Registration and Profile

Re-checked 2026-11-09 after the seven-phase M3 build. "Tested" says how each line was checked: **unit** = `npm run test:unit` (11 suites, 164 checks, all passing), **live** = clicked through on the dev server against the real database, **E2E written** = in `tests/e2e/` but not run (the local Docker stack is not used on request). Nothing below is ticked: that is yours to do.

**Placement Officer side**
- [ ] Register/invite a student with name, institution, campus, department, programme, branch, batch, admission number, years — ✅ Built. Tested: earlier E2E (M2); wizard now also shows academic year and semester.
- [ ] View student profiles — ✅ Built. Tested: live (student page, Education and Documents tabs).
- [ ] Verify academic details — ✅ Built: section review, "Verify profile", request corrections, reject; semester results and backlogs are verified with the Academics section, qualifications with Education history. Tested: unit (records reach the verified snapshot only once verified); staff approval not clicked live.
- [ ] Verify documents — ✅ Built: view in page, verify, reject with reason, reopen. Note: department coordinators may approve sections (spec rule 6) but the document review route allows only TPO admin and placement officer, so a coordinator cannot complete a student. Decide which is right.
- [ ] Original documents stay available to authorised users — ✅ Built: private storage, short-lived links; removing or replacing a document archives it and keeps the file; staff "Show removed and replaced versions" with "Open original". Tested: live (history view), unit (upload checks); replace/archive itself E2E written, not run.
- [ ] Changes to verified records are tracked — ✅ Built: edits to verified sections, qualifications and semesters wait as pending revisions; every change, document read and accepted AI suggestion is audited. Tested: unit.
- [ ] Dashboard with invitation, completion and verification counts and filters — ✅ Built. "Completion" now means the student's part (submitted or verified) and counts required marksheets; `verifiedPercent` is returned beside it. Tested: unit; staff list/summary not checked live.

**Student side**
- [ ] Personal information (DOB, contact, address) — ✅ Built; phone, DOB, gender and address sync to the student record on approval; name stays institution-controlled. Tested: unit.
- [ ] 10th, 12th/PUC, diploma, degree details — ✅ Built: education records. Tested: live (staff Education tab).
- [ ] Semester-wise marks — ✅ Built: semesters with subject marks, percentage worked out from marks, SGPA 0–10. Tested: live (invalid SGPA refused, semester saved and removed), unit.
- [ ] Backlog history — ✅ Built: per-subject backlogs with every attempt kept, cleared-in semester required. Tested: live (add, clear, remove), unit.
- [ ] Academic achievements — ✅ Built: optional Achievements section (category, level, date, issuer, position, link, proof upload), same staff review, on the resume and showcase once verified. Tested: live (future date refused, draft saved, student stayed verified), unit.
- [ ] Upload PDF/image documents, several, categorised — ✅ Built; contents checked (type from bytes, PDFs with scripts or passwords refused, duplicates refused). Tested: live (script PDF and fake PDF refused), unit.
- [ ] Replace a document — ✅ Built: one-step replace for students (also after verification) and staff; the old version is kept. Tested: unit; E2E written, not run.
- [ ] Verification status per document — ✅ Built. Tested: live.
- [ ] Profile completion %, missing information, missing documents, next action — ✅ Built: one calculation (`lib/profileCompletion.ts`) used everywhere; one recommended next action. Tested: live (profile page and home), unit.
- [ ] AI OCR suggests profile updates from documents — ✅ Built on Groq (`qwen/qwen3.8-27b`): photos, text PDFs and scanned PDFs; suggestions and flags (name, document type, confidence); accepting a suggestion only fills the draft, never verifies; off until an admin switches it on. Tested: unit, and one synthetic marksheet read correctly through the real Groq pipeline; not yet clicked through in the app.
- [ ] Save progress and continue later — ✅ Built.

**Connection**
- [ ] M3 → M4/M5: verified academic data is available to assessments, intelligence and drives — ✅ Built: structured records regenerate the same section keys (cgpa, tenthPercentage, twelfthPercentage, activeBacklogs, semesters) only on verification, so eligibility, intelligence, resume and showcase read verified data as before.

### M4 – Student Assessment and Career Profiling

Re-checked 2026-11-09 after the seven-phase M4 build. "Tested" says how each line was checked: **unit** = `npm run test:unit` (15 suites, 207 checks, all passing), **Groq** = run once against the real Groq API with synthetic input, **not live** = built and type-checked but not yet clicked through in the app (the two M4 migrations, `20261109150000_assessment_history` and `20261109160000_instrument_attempts`, were not applied when this was written). No E2E script has been run. Nothing below is ticked: that is yours to do.

**Placement Officer side**
- [ ] Assign assessments to departments/batches — ✅ Built: schedules (`/staff/assessments`). Each paper now carries a category (what it measures).
- [ ] Question management — ✅ Built: question banks and papers, plus **ready-made banks** (aptitude, digital literacy, communication, three technical banks) imported in one click, editable and extendable. Tested: unit (content checks, arithmetic spot-checks); not live.
- [ ] Time limits, automated scoring, negative marking — ✅ Built.
- [ ] Reassessment rules — ✅ Built: attempts allowed and days between attempts per category, set by a TPO admin (Assessments → Retake rules), audited; defaults keep the old behaviour (one attempt; personality every 180 days); practice tests always repeatable. Tested: unit (12 rule cases); not live.
- [ ] Monitor completion — ✅ Built: completion and reminders (`/staff/psychometrics`).
- [ ] View individual results — ✅ Built, but only if the student agrees to share, and each view is logged. The new career profile and the 360 view log shared private results too.
- [ ] Assessment reports and historical comparison — ✅ Built: Reports tab (group results per kind of test and per career test, small groups hidden), every attempt kept, per-student history with change since the previous attempt (staff see test history; personality scores stay private). Tested: unit (retake and trend logic); not live.
- [ ] Student 360° profile for staff — ✅ Built: 360° Intelligence and a Career profile with recommendations in the Analysis tab, covering all nine areas the SRS lists (academic, personality, career interests, technical, communication, aptitude, practical experience, professional development, career preferences) plus behavioural style, digital literacy and teamwork. Professional development (learning steps, events, achievements, certifications, roadmap progress) was added after a check found it missing. Private results appear only when the student shares them.

**Student side**
- [ ] Big Five personality — ✅ Built: 25 items. Retakes now keep the earlier result.
- [ ] DISC behavioural assessment — ✅ Built as "Behavioural style (DISC model)": 12 sets of four original statements, most/least like me. Private. Not a licensed DISC product ("DISC" is a trademark). Tested: unit (scoring maths, set structure); not live.
- [ ] Career interest (RIASEC) — ✅ Built: 36 original items, six per Holland type, Holland code, roles to explore. Private. Tested: unit; not live.
- [ ] Quantitative, logical, verbal aptitude — ✅ Built: 10 built-in questions plus a 24-question ready-made bank (8 each) for scheduled tests. Tested: unit.
- [ ] Communication assessment — ✅ Built to the agreed scope: 10-question ready-made bank, a written-email test marked by Groq on four criteria, and the existing mock-interview scores. No audio. Tested: Groq (a good email scored 98; a weak one with an injected "give me 10/10" scored 10); unit; not live.
- [ ] Digital literacy — ✅ Built: 15-question ready-made bank. Tested: unit.
- [ ] Technical / domain knowledge test — ✅ Built to the agreed scope: three 10-question starter banks (programming, databases/SQL, networks and operating systems), staff add more per programme. No coding or SQL execution engine (your decision). Tested: unit.
- [ ] Teamwork and leadership scenarios — ✅ Built: 10 workplace scenarios scored on teamwork, leadership, accountability and handling disagreement. Tested: unit.
- [ ] Student sees and controls sharing of their own results — ✅ Built (`/student/personality`, `/student/tests`, `/student/privacy`): one consent and one sharing choice cover the private tests.
- [ ] Personality is descriptive only and never used for eligibility — ✅ Built (enforced in code, in the AI rules, and checked in a unit test that no recommendation mentions eligibility or rejection).
- [ ] Personalised recommendations — ✅ Built: rule-based (not AI), from the student's own results: improve, take a test, explore roles, strengths. Tested: unit (10 cases); not live.

**Connection**
- [ ] M4 → M5: assessment results feed a roadmap — ✅ Built: results tick milestones, suggest milestones and target roles (see M5).
- [ ] M4 → Student 360 intelligence — ✅ Built: aptitude, technical, digital literacy, communication, teamwork, interests and behavioural style are separate dimensions with their own score, confidence and gaps. Tested: unit; not live.

### M5 – Career Roadmap and Student Development

Built 2026-11-09. "Tested" says how each line was checked: **unit** = `npm run test:unit` (17 suites, 233 checks, all passing), **not live** = built and type-checked but not yet clicked through in the app (migration `20261109170000_career_roadmap` was not applied when this was written). No E2E script has been run. Nothing below is ticked: that is yours to do.

**Placement Officer side**
- [ ] Monitor student development and roadmap progress — ✅ Built: Roadmaps list (`/staff/roadmaps`) with progress, students behind plan, no target role, not started; filters by department, batch and status; plus a Roadmap tab on each student. Coordinators see their department; faculty see their mentees and allocated students. Tested: unit (progress rules); not live.
- [ ] Mentor allocation — ✅ Built in M2 (admin assigns students to a faculty mentor); M5 adds what a mentor does with it: read the mentee's roadmap, confirm milestones, leave notes the student sees. A faculty member who is not the mentor can read but not comment. Tested: unit (permission rules); not live.
- [ ] Career roadmap report — ✅ Built: print or save as PDF from the roadmap (student, mentor and staff views). Tested: not live.

**Student side**
- [ ] Four-year personalised roadmap with yearly goals — ✅ Built, scaled to the programme: the four themes in the SRS (discover, build, specialise, prepare) are spread over the programme's own semesters, so an MCA (4 semesters, 2 years) and a B.Tech (8 semesters, 4 years) each get a sensible plan. 25 standard milestones. Tested: unit (generation for 1 to 10 semesters, determinism, placement within themes); not live.
- [ ] Semester-wise milestones — ✅ Built: every milestone sits in a semester, with progress, what is behind from earlier semesters, and what is up next. Tested: unit.
- [ ] Learning recommendations from assessments — 🟡 Partial: weak assessment results become suggested roadmap milestones (with the reason), and courses (M6) and study material (M7) are recommended from weak areas on their own pages; the roadmap's own suggestion list still points at practice in general rather than naming courses. Tested: unit.
- [ ] Goal setting, career role selection, roadmap changes, achievement tracking — ✅ Built: career goal sentence, goals with dates (open, achieved, dropped), target role with ideas from the student's interests and stated preferences, add, move, skip and remove milestones, and a history of every change with who made it. Many milestones tick themselves from real activity (assessments taken, achievements verified, internships completed, practice interviews, drives applied and attended, profile and resume verified). Tested: unit (auto-tracking rules, change rules); not live.
- [ ] Learning journeys (a step list a programme follows) — 🟡 Partial: unchanged; exists as a staff-defined journey for a training programme. A step done in a learning programme now also ticks a roadmap milestone.

**Connection**
- [ ] M4 → M5: assessment results feed the roadmap — ✅ Built: results tick milestones, create suggested milestones, and suggest target roles. Tested: unit; not live.
- [ ] M5 → M6/M7 (goals to courses and resources) — ✅ Built: courses and study material are recommended from the target role and assessment results.

### M6 – Learning Management System

**Placement Officer side**
- [ ] Create, edit, publish, archive courses with modules and chapters — ✅ Built (`/staff/courses`): draft, publish (blocked until every lesson is complete), archive (enrolled students keep access), reorder, optional audience by department/batch, self-enrol or staff-enrol only. Tested: unit (rules); not live.
- [ ] Upload videos/documents, external links — ✅ Built: MP4/WebM video up to 50 MB, PDF/PNG/JPEG up to 10 MB (type read from the bytes), or an external link; download only when the teacher allows it. Not live-tested.
- [ ] Assignments and quizzes inside courses — ✅ Built: assignments take text and/or a file, are graded with marks and feedback or sent back, late work is flagged; quizzes are multiple choice with a pass mark and optional attempt limit, the answer key is withheld until the student passes or runs out of attempts. Tested: unit (marking, limits); not live.
- [ ] Live sessions — 🟡 Partial: a scheduled session with a meeting link (shown 15 minutes before) and staff-marked attendance that finishes the lesson. No video conferencing of its own.
- [ ] Certificates — ✅ Built: issued automatically when a student finishes every required lesson (if the course gives one), numbered, printable (`/student/courses/:id/certificate`). Issued when work is handed in, not when it is graded.
- [ ] Training programmes with members and step progress — 🟡 Partial: `/staff/learning` (programmes, journeys, members, progress)
- [ ] Learning analytics (enrolment, completion, gaps, engagement) — ✅ Built (course Analytics tab): enrolment, completion, progress, quiz averages, hardest questions, where students stop, assignments waiting, stalled students (14 days idle). Per course only; no college-wide learning dashboard yet (M21).

**Student side**
- [ ] Browse and enrol in courses, view lessons, assignments, quizzes, ask questions — ✅ Built (`/student/courses`): search, join, lesson player, quizzes, hand in work, questions answered by staff, leave and rejoin keeping progress. Not live-tested.
- [ ] See assigned programme and tick off steps — 🟡 Partial: `/student/learning`
- [ ] AI tutor — ✅ Built: students in a course ask the tutor about the course or current lesson (Groq, the same service as other AI features). It sees the lesson text, never quiz questions or the answer key, will not do assignments, ignores instructions in the student's text. Checked live with synthetic text (on-topic answer, off-topic and injection attempt refused). Student screen not live-tested.

**Connection**
- [ ] M6 → M21 course progress; M6 → M10 completed courses update the resume — ✅ Built: college-wide learning figures on `/staff/courses` (learners, completion, active/stalled, by department, busiest courses); the generated resume PDF gets a "Courses completed" block; finishing a course ticks the roadmap. Not shown on the main analytics dashboard (M21) itself.

### M7 – Resource Management System

**Placement Officer side** (`/staff/resources`)
- [ ] Upload files (PDF, DOCX, PPT, images, video, audio) — ✅ Built: PDF, Word (.docx), PowerPoint (.pptx), PNG/JPEG, MP4/WebM video up to 50 MB, MP3/M4A/WAV/OGG audio. The type is read from the file's bytes; macro files, old .doc/.ppt and scripted PDFs are refused. Tested: unit; not live.
- [ ] Links, question banks, coding practice links — ✅ Built: external video links, websites, question banks, sample tests, coding practice links and company material are resource types. (The scored question banks under Assessments are separate.)
- [ ] Metadata (subject, topic, skill, job role, company, difficulty, language, duration, version, expiry, visibility) — ✅ Built, all of them, plus uploaded-by. "Suggest tags with AI" fills category, subject, topic, skills, roles and difficulty for staff to check.
- [ ] Review / approve workflow — ✅ Built: draft, send for review, admin approves or rejects (with a reason), archive and restore; the admin can approve their own draft. A new file on an approved resource is a new version and needs approving again (students lose access in the meantime). Earlier versions are kept.
- [ ] Assign to students, groups, JDs, skill gaps, tests — 🟡 Partial: a student, department, batch, preparation group (learning programme), everyone with a skill gap, or the takers of a mock test, with a due date and note; students are told. Not built: JDs (M11) and mock interviews as targets.
- [ ] Completion tracking and effectiveness analysis — ✅ Built: opened, finished (tied to the version), 1-5 rating and feedback per student; per resource reach, completion, ratings, and a completer-vs-others assessment comparison shown only with 5+ on each side and labelled as a link, not proof; library overview of most used, best and worst rated, unused, expiring.
- [ ] AI resource recommendations — 🟡 Partial: a list of at most five from weak assessment areas, target role, skills, language and the hours the student has, avoiding hard material for weak students, each with its reason. These are rules, not a language model; AI is used only for tagging.

**Student side** (`/student/resources`)
- [ ] Open the resource list — ✅ Built: "For you", "Assigned to me", and the open library, with search and filters.
- [ ] See only assigned materials — ✅ Built: students see approved, unexpired resources that are assigned to them or marked open to every student; staff-only and unapproved ones never reach them.

### M8 – Project Management and Portfolio

**Placement Officer and faculty side** (`/staff/projects`)
- [ ] Project repository, problem statements, allocation, teams, milestones, tasks — ✅ Built: problem statements with skills, kind (individual, team, interdisciplinary), team size, audience by department/batch, guide, industry partner, dates and a milestone template every team gets; staff allocate students to teams or students form them; student-proposed projects are approved or rejected; tasks are kept by the team. Team rules (size, two departments for interdisciplinary) are checked. Tested: unit (rules); not live.
- [ ] Faculty and industry mentor review, evaluation — ✅ Built: a five-point rubric (0-10 each) with comments from the faculty guide or staff; industry mentors, who have no account, get a one-time link (14 days, emailed when email is set up, otherwise shown to copy). Individual marks let one student's result differ from the team's. Faculty and staff count 60% and industry 40% of the result when both review; the admin or guide publishes it, and students see scores only then.
- [ ] Monitor projects — ✅ Built (Monitor tab): proposals waiting, teams behind schedule, work waiting for a final review, members with little recorded work. Faculty see only projects they guide.

**Student side** (`/student/projects`, `/student/portfolio`)
- [ ] List projects in the profile — ✅ Built: real project records (role, team, result) alongside the existing profile text section.
- [ ] Create team projects, submit work, GitHub integration, documentation, presentations — ✅ Built: start or join teams, plan with milestones and tasks, progress updates, PDF/Word/PowerPoint documentation and presentation uploads (up to 20 MB, type read from the file), GitHub repository link with commits read from the public API (checked live), submit for review. Only public repositories; the GitHub username is stated by the student and not verified. Not live-tested in the app.
- [ ] Portfolio generation — ✅ Built: a printable portfolio from submitted projects (students can hide any), also added to the shareable profile data and the resume PDF ("College project work"). The public profile API carries it; there is no public web page for it yet.

**Connection**
- [ ] M8 → M10 / M12 project evidence — 🟡 Partial: submitted projects feed the resume PDF, the shareable profile and the roadmap's projects milestone. M12 (candidate matching) does not exist yet to use them.

Each member's recorded work (tasks finished, updates, files, commits, capped) is shown separately from the team result, with a flag for under half a fair share. It measures activity, not quality.

### M9 – Internship Management

Before this work the module was only a staff-allotted record with weekly logs and evaluations; the earlier "built" marks on posting, applications and PPO were too generous. It now covers the whole SRS flow.

**Placement Officer, faculty mentor side** (`/staff/internships`)
- [ ] Post internships, approve applications, track participation — ✅ Built: postings with company, mode, stipend, openings, skills, dates, deadline and eligibility rules (CGPA, 10th/12th, backlogs, department, batch, programme, placed students); a posting opens only once the company has confirmed it; applications go through college approval and then the company's decision (recorded by staff), which creates the internship. Students can also submit an internship they found themselves with the offer letter; the college approves it alone. Tested: unit (eligibility, approval steps); not live.
- [ ] Mentor allocation, attendance, deliverables — ✅ Built: a faculty mentor (defaults to the student's own mentor) and the company mentor; schedule with working days and hours; students mark attendance for the last 7 working days and the mentor or staff verify or correct it (leave is not counted against the student); tasks with PDF/Word/PowerPoint or link deliverables, approved or sent back; a final-report task is created automatically. Faculty see only the internships they mentor.
- [ ] Performance evaluation — ✅ Built: faculty and company evaluations out of 100, mentor feedback, and a one-time link (21 days, no account) for the company's mentor to evaluate and recommend a pre-placement offer.
- [ ] Certificate upload and completion — ✅ Built: the student uploads the certificate (PDF/image, type read from the file) and staff verify or reject it; completing needs the end date reached, an evaluation, no log waiting and every task approved (attendance under 75% and an unverified certificate are warnings); the admin can override with a written reason that is kept.
- [ ] PPO tracking — ✅ Built: status none, expected, offered, accepted or declined with a link to the offer record, notes, and conversion figures in the Overview tab.

**Student side** (`/student/internships`)
- [ ] Apply, log weekly work, see status — ✅ Built: open internships with the rules checked and the gaps shown, applications and their status, attendance, tasks and final report, weekly logs, feedback, certificate and any offer. Not live-tested.

**Connection**
- [ ] M9 → M10: completed internships appear on the resume — ✅ Built: the resume PDF has a "College internship records" block (and the shareable profile data carries them); the student-written Internships section is still separate.

### M10 – Dynamic Resume Engine

**Placement Officer side**
- [ ] Monitor resume availability and readiness — ✅ Built: readiness by department (now also how many students have an approved resume), and each student's approved resumes with PDF and Word downloads on the student page (Resumes tab). The college-format PDF used by recruiters and the shareable profile now comes from the same engine.

**Student side** (`/student/resume`)
- [ ] Single master profile as the source — ✅ Built: the master career profile is built live from profile sections, college projects, internships, completed courses, assessments (never personality or interests) and achievements, so it updates itself when a course, project or internship is finished or a certification, hackathon or publication is added. Tested: unit.
- [ ] PDF export — ✅ Built.
- [ ] DOCX export — ✅ Built (Word file with headings, bullets and tab-aligned dates; no tables, so recruiters' software can read it).
- [ ] Multiple templates and resume types — ✅ Built: four templates (plain ATS, classic, modern in the college colour, compact) and seven kinds (master, technical, management, internship, fresher, project-based, company-specific), each choosing its own sections, order and limits; a company-specific resume takes the company, role and job description and moves matching skills and projects first.
- [ ] AI content suggestions — ✅ Built: a summary and rewrites of a project or internship, written only from the student's own records; anything the AI adds that the records do not contain (a number, tool or name) is flagged for the student, and nothing is saved until they use it. Also a match against the job description and hints for online applications. Checked live with synthetic text, including an injected instruction (ignored).
- [ ] Version history, student approval — ✅ Built: each resume is a numbered version; a draft follows the live profile, approving freezes it, an approved one never changes (copy it to edit), one can be the main resume, and old ones are archived, not deleted.
- [ ] Distinguish claimed from verified skills — ✅ Built: each skill is verified (staff checked the list), backed by records (a project, course, internship, assessment of 60%+ or achievement, with what backs it shown) or claimed. Resumes can use only checked material, and mark backed skills with *.
- [ ] Automatic update when a course, project, internship or certification is completed — ✅ Built, in two parts: the master profile updates at once; an approved resume stays as approved but is flagged "N new items in your profile" with the list, so the student makes an updated copy. Approved resumes are never rewritten behind the student's back.

Changes in behaviour: the old resume PDF printed the whole Personal details section (including date of birth and address); the new one never prints private details. Applications still snapshot the verified sections as before and do not use resume versions yet.

### M11 – Job Description Management and AI Analysis (`/staff/job-descriptions`)

**Placement Officer side**
- [ ] Create a job/drive manually — ✅ Built: drives as before, and job descriptions can be written by hand.
- [ ] Upload JD as PDF/DOCX/text — ✅ Built: upload a PDF (with a text layer), a Word .docx (macros refused) or a text file, paste text, or write it by hand. The type is read from the file's content. A scanned PDF cannot be read (paste the text instead).
- [ ] AI extraction of skills, qualifications, experience, selection process — ✅ Built: company, title, summary, employment type, location, salary, experience, required and preferred skills, qualifications, communication needs, marks and backlog rules, branches (matched to your departments and programmes) and selection rounds. Every requirement carries the words it came from; anything not found word for word in the document is flagged "Check" and blocks approval until looked at. Checked live with a made-up JD including an injected instruction (ignored). Needs the college's "AI document reading" setting on, because the text is sent to the AI provider.
- [ ] Edit extracted data, mark mandatory vs preferred, scoring weights — ✅ Built: every field is editable; each requirement is required or preferred with a weight 1-10; five scoring areas (skills, qualification, experience, assessments, communication) must add up to 100; the original text sits beside the form with "show in the document".
- [ ] Approval before publishing — ✅ Built, with a limit: staff send a draft for review, only the placement admin approves (approval needs every check settled), and a drive made from a job description cannot be published unless it is approved; an approved one is locked, and reopening is blocked once its drive is live. Drives created by hand without a job description, and recruiter-posted jobs, are not covered by this gate.

**Student side**
- [ ] View published opportunities and job requirements — ✅ Built: the drive page shows what the job needs (required and preferred) from the approved job description, the experience and selection process; the scoring weights are not shown.

**Connection**
- [ ] M11 → M12 structured job requirements — ✅ Built on the M11 side: each requirement is typed, required or preferred and weighted, with its share of the score worked out, plus rules and scoring weights. M12 (candidate matching) itself is not built yet.

### M12 – AI Candidate Matching Engine (`/staff/job-descriptions/:id/matches`, for an approved job description)

**Placement Officer side**
- [ ] Mandatory eligibility evaluation, separate from any score — ✅ Built: students who fail the rules are listed with the reason and are never scored or ranked; for a job description with a drive it is the drive's own evaluation (rules, exceptions, attendance blocks). The verdict on the job's required criteria (all met, needs review, required missing) is a third thing, also separate from the score.
- [ ] Matching score, ranking, configurable weights — ✅ Built: 0-100 from the SRS's seven parameters (technical skills 30, academic 20, projects 15, aptitude 10, communication 10, internship 10, certifications 5), weights set per job description and required to add up to 100. A parameter the job does not use (no skills listed) is left out and the rest scaled; a student's missing evidence earns zero rather than being ignored. Ranking: eligible first, then score, then required criteria met, CGPA, name. Tested: unit.
- [ ] Skills matched / partial / missing, explanation of the match — ✅ Built: each requirement is met, partly met, missing or needs a person, with what backs it. A skill backed by a project, course, internship, assessment or staff check earns full credit; only listed by the student earns half; named in a description 0.6; a related skill 0.4. Marks come only from staff-verified academics. The explanation is written from that evidence by rules, not by a language model, so it can be checked.
- [ ] Candidate comparison — ✅ Built: pick two to four students and compare score, criteria, each parameter, skills and projects side by side.
- [ ] Shortlisting by rounds — ✅ Built: existing round results, plus a shortlist from the ranking (eligible students only) that keeps each student's score and evidence at that moment, an optional notification, and an Excel export. It records and invites; selection stays with the drive's rounds and the people running them.
- [ ] Personality not used as a filter — ✅ Built: the engine reads no personality, interest or behavioural results (tested through the master profile, which excludes them).

**Student side**
- [ ] See relevant opportunities and match information — ✅ Built: on a drive with an approved job description, "How you match this job": score, skills matched, partly matched and missing, each requirement with its evidence, and the college's courses and study material for the gaps.

**Connection**
- [ ] Evidence from M3, M4, M8, M9, M10 compared to requirements — ✅ Built: the engine reads the master profile (profile sections, assessments, college projects, internships, courses, achievements) for every student; recruiters can open "why they match" with the same evidence for candidates the college shortlisted to their drive. Not live-tested.

### M13 – Job-Specific Preparation Campaign (`/staff/campaigns`, `/student/campaigns`)

**Placement Officer side**
- [ ] Create campaign from an approved JD; select, invite (bulk) and remove candidates — ✅ Built: a campaign starts from an approved job description (company, role and the drive link come from it). Candidates come from the M12 ranking (eligible only, filter by department and lowest score, compare two to four, add) or are added by hand (even if not eligible, marked "added by hand"). Groups with their own trainer. Invite everyone, a chosen few, or one at a time, once the campaign is active. Removing keeps the history. Tested: unit (planner, progress, invitation steps, dashboard).
- [ ] Campaign dashboard (invited, accepted, declined, ready, needing help) — ✅ Built: selected, invited (and waiting), accepted, declined, preparation started, resources completed, mock tests completed, mock interviews completed, needing support, ready for the final interview, falling behind, average progress, and match score at invitation against now; one row per student, with a "remind students behind" button (at most daily each).
- [ ] Assign trainers, tests, interviews, resources, milestones — ✅ Built: trainers on the campaign and per group (faculty trainers can follow candidates, edit plans, answer support requests and mark ready); mock tests chosen from the scheduled assessments; mock interviews with dates; study material for everyone; milestones; notification settings (email invitations, reminders).
- [ ] Record all campaign changes — ✅ Built: a History tab lists every change with who made it (also kept in the audit log for the main actions).

**Student side**
- [ ] Receive, accept or decline a campaign invitation; request support — ✅ Built: the invitation shows the company, the job's requirements, the preparation details, the skill gap report, the plan and the schedule; accept, decline (with a reason, can change their mind), ask for support and read the answer. Students see only their own plan.
- [ ] AI-made individual preparation plan — ✅ Built, with a note: the day-by-day plan is made by fixed rules from the student's skill gaps (required and missing skills first, then partly matched), the college's own courses and study material for each gap, the campaign's tests and interviews, an HR and a technical mock interview near the end, and revision on the last day. It is not written by a language model, so each item's reason can be seen; staff can edit, move, add, skip or remake it. Items too many for the window are marked optional.
- [ ] Skill gap report — ✅ Built: score, skills matched, partly matched and missing, and why, kept as it was at invitation.
- Progress updates itself: a finished course, completed study material, a submitted mock test or a completed mock interview ticks its plan item; study, practice and revision items are ticked by the student.

**Connection**
- [ ] M12 → M13 → M14/M15 — ✅ Built: campaigns use M12 matches and gaps, M6 courses, M7 material, scheduled tests linked to the job (M14) and AI mock interviews and discussions (M15, M19).

### M14 – Mock Test Engine

**Placement Officer side**
- [ ] Configure tests: duration, marks, negative marking, randomisation, start/end, attempts, result visibility — ✅ Built: paper builder (pick questions by bank, topic, difficulty), overall pass mark, per-section minimums, attempts allowed per schedule, four result-visibility levels. Option shuffling is not built (question order is shuffled)
- [ ] Related JD on a test — ✅ Built (paper links to an approved JD)
- [ ] Categories (aptitude, technical, programming, SQL, case study, company simulation) — ✅ Built: ten test categories and sections
- [ ] Question types — ✅ Built: single, multiple, true/false, fill blank, descriptive, coding, SQL, case study and scenario (shared context). Coding and SQL answers are marked by AI reading them against a model answer; **code is not executed**
- [ ] Marking of open answers — ✅ Built: AI suggests marks, staff "To mark" tab confirms or corrects; score is provisional until all are marked
- [ ] Proctoring — ✅ Built: violation counting and flagging (beyond the SRS)
- [ ] View results by schedule — ✅ Built

**Student side**
- [ ] Attempt assigned tests and practice tests — ✅ Built (`/student/assessments`), every question type
- [ ] Report: overall, section, topic, accuracy, time, question-wise, correct answers, explanations, weak topics — ✅ Built (time is per attempt; per-question time is not tracked). Staff-side cohort topic reports are not built
- [ ] AI improvement engine: gaps, materials, targeted exercises, reassessment date, next test, comparison — ✅ Built: study material and courses for weak topics, personal practice set, reassess date from the retake rule, next test, comparison with previous attempt

### M15 – AI Mock Interview Engine

**Placement Officer side**
- [ ] Configure or monitor mock interviews — ✅ Built: staff set up an interview (type, mode, difficulty, length, language, job role, optional JD, due date) for a department or batch, students are notified, and staff see started/finished counts, scores and weakest areas per student (Assessments > Interviews)
- [ ] Review interview reports — ✅ Built for assigned interviews: full transcript with the student's words separated from AI text, plus the report. A student's own practice interviews stay private and are never shown to staff (opening an assigned one is audited)

**Student side**
- [ ] Text mock interview for a role and topic, follow-up questions, scored feedback — ✅ Built (`/student/prep`)
- [ ] Types, difficulty, duration, language, JD-based — ✅ Built: eight types (HR, technical, domain, behavioural, managerial, situational, internship, company-specific), three difficulty levels, 10 to 45 minutes, nine languages. JD-based only through a staff assignment (so students cannot read JDs they were not given)
- [ ] Learning mode vs assessment mode — ✅ Built: learning gives hints and a coach's note with a stronger answer after each answer; assessment is timed (duration plus 2 minutes), no hints, evaluated at the end
- [ ] Voice or video, audio/video permission checks — 🟡 Partial: optional voice answers by browser speech-to-text with a microphone check and consent; speech becomes text on the student's device and no audio is recorded or stored. **Video is not built**; nothing is inferred from voice, accent or face
- [ ] Report with category scores and previous-attempt comparison — ✅ Built: nine categories (technical accuracy, relevance, clarity, structure, communication, problem solving, conceptual understanding, practical examples, behavioural), strengths, improvements, technical feedback, suggested answers, practice tasks, comparison with the previous interview of the same type. PDF/DOCX export belongs to M16

### M16 – Report Generation

**Placement Officer side**
- [ ] Student, batch and placement reports — ✅ Built: per-student performance report (student profile > Analysis), group report by department and/or batch (Reports > Test and interview results) with the topics the group finds hardest; placement PDF, NIRF Excel and scheduled emails already existed. Coordinators get only their department
- [ ] Mock test and mock interview reports — ✅ Built: full test report per attempt (student information, job role, test details, overall, topic and section scores, correct and incorrect answers, time, learning gaps, recommended materials, improvement plan) and full interview report (type, duration, questions, transcript, category scores, strengths, improvements, technical feedback, suggested answers, practice, previous-attempt comparison). Staff see interview reports only for interviews the placement office assigned
- [ ] PDF, DOCX and online dashboard — ✅ Built: every report downloads as PDF or Word and the same content is available as JSON for an online view. There is no separate on-screen dashboard page for the new reports beyond the existing result pages
- [ ] Separate student answers from AI comments — ✅ Built: every block is labelled (student's own words, AI-generated comment, staff comment, calculated by the system); AI text is shown in italics and colour

**Student side**
- [ ] View permitted personal assessment and performance reports — ✅ Built: test report, interview report and consolidated performance report with PDF/Word download. A test report shows only what the test's result visibility allows; personality results are never included

### M17 – Job Readiness Engine

**Placement Officer side**
- [ ] Review student readiness and gaps — ✅ Built: student profile > Analysis shows both measures part by part with evidence, gaps and what would raise them; a Readiness tab on each job's matching page and in each preparation campaign lists every student's job readiness beside their eligibility, weakest part and missing skills
- [ ] Career Readiness Index — ✅ Built: eight weighted parts (verified profile, verified academics, skills with evidence, assessments, mock interviews, projects and internships, learning activity, improvement); parts that cannot be measured are left out and shown as lower coverage
- [ ] Job-Specific Readiness Score — ✅ Built: skills the job asks for, mock tests (linked to the job, else general), mock interviews (assigned for the job, else general), project evidence, internship, preparation material completed, improvement; mandatory eligibility is a separate gate shown beside the score, never blended in, so an ineligible student is never shown as qualified

**Student side**
- [ ] View readiness progress — ✅ Built (`/student/prep` > Readiness): both measures, explained, with next steps and progress over time (one saved score per day)

**Connection**
- [ ] M3, M4, M6, M8, M9, M14, M15 → M17 → M18 — ✅ Built for the data M17 reads (verified profile, academics, skills, tests, interviews, projects, internships, courses, resources). Honest limits: weights are fixed (not college-configurable); personality, career-interest and behavioural-style results are never used; staff see interview scores only from assigned interviews, so a student's own score can differ from the staff view; readiness is not used to filter or rank for selection

### M18 – Placement Management

**Placement Officer side**
- [ ] Create drives, assign companies and roles, define eligibility — ✅ Built
- [ ] Select candidates, shortlist, schedule assessments and interviews — ✅ Built (rounds, panels, slots, reschedule)
- [ ] Track attendance — ✅ Built (QR/code check-in, excuses)
- [ ] Record results, manage offers, joining — ✅ Built (offer letters, joining proof)
- [ ] Status history with timestamps and who did it — ✅ Built (application events, timeline)
- [ ] Companies, CRM, recruiter accounts — ✅ Built
- [ ] Blocking policies for missed drives and placed students — ✅ Built (beyond the SRS)
- [ ] Historical placement import — ✅ Built

**Student side**
- [ ] Apply, withdraw, save drives — ✅ Built
- [ ] Attend interviews, book slots, see journey per round — ✅ Built
- [ ] Track and respond to offers, submit joining details — ✅ Built
- [ ] Placement status steps (job published, application received, eligibility checked, shortlisted, preparation assigned, mock test completed, mock interview completed, invited to interview, interview attended, selected, rejected, offer released, offer accepted, joined) — ✅ Built as a status worked out from the records the platform keeps (no duplicate status to drift): each step shows when it was reached and by whom; the student sees it on `/student/applications` (staff names appear as "Placement office"), staff see it per applicant under each drive > Placement status with counts per step. Limits: eligibility is checked automatically when the application is made, so it shares that time; an interview slot has no creation time so its date is its last change; steps for preparation use campaign progress and tests/interviews linked to the drive's job description
- [ ] Readiness information for placement review — ✅ Built: the drive's Placement status tab shows each applicant's job readiness beside their eligibility (not for coordinators), as coaching information, never a filter

### M19 – Group Discussion and Communication Simulator

**Placement Officer side**
- [ ] Set up and monitor sessions — ✅ Built: staff set up a group discussion, debate or presentation practice for a department or batch (Assessments > Discussions), students are notified and told staff will see their report; staff see started/finished counts, scores, weakest areas, full transcripts and a downloadable report. A student's own practice sessions stay private

**Student side** (`/student/prep` > Group discussion)
- [ ] AI-generated topics — ✅ Built: a curated neutral topic list that always works, plus fresh AI-written topics on request (falls back to the list if the AI is off)
- [ ] Multiple AI participants — ✅ Built: 2 to 4 AI participants in a group discussion, each with a distinct way of taking part (data-driven, sceptical, collaborative, practical, devil's advocate)
- [ ] Debate simulation and counterarguments — ✅ Built: the student argues for or against a motion and an AI opponent answers each argument with a specific counterargument
- [ ] Presentation practice — ✅ Built: the student presents, then an AI audience member asks follow-up questions
- [ ] Timed sessions — ✅ Built: 5 to 20 minutes plus two minutes for the last contribution; late contributions are not taken and the session is evaluated on what was said
- [ ] Voice-based discussions — 🟡 Partial: optional voice by browser speech-to-text with a microphone check and consent; speech becomes text on the student's device and no audio or video is recorded or stored. The AI participants reply in text, not speech
- [ ] Communication, listening and response evaluation, improvement recommendations — ✅ Built: scores out of 10 for clarity, content, structure, arguments and evidence, listening and response, handling counterarguments (or answering questions for a presentation) and language, plus strengths, improvements, a stronger version of up to five contributions, points that could have been raised, practice tasks, and counted participation facts. Evaluates words only; nothing is inferred from voice, accent, pace or appearance
- [ ] Reports and progress — ✅ Built: PDF and Word report with the student's words and AI text labelled apart, and comparison with the previous session of the same kind; scores also count toward the readiness "mock interviews and discussions" part (M17)

### M20 – Notification Centre

**Placement Officer side**
- [ ] Send announcements and messages — ✅ Built (`/staff/communications`, templates)
- [ ] Email — ✅ Built (SMTP); reminders for rounds, assessments and personality tests
- [ ] SMS and WhatsApp — 🟡 Built, **not tested against a live account**: a Twilio-style adapter (`lib/channels.ts`); the college switches each channel on (Communications > SMS and WhatsApp), the student opts in, nothing is sent 9 pm to 8 am except offers, every attempt or skip is logged with the reason. Needs `TWILIO_*` keys; WhatsApp free text only works inside the 24-hour window or with approved templates, and templates are not set up
- [ ] Notifications for submitted profiles, correction requests, approvals — ✅ Built, with an Open link to the right screen; staff can mute kinds they do not need (account and offer messages cannot be muted)
- [ ] Delivery log — ✅ Built: what went out by email, SMS or WhatsApp, and what was skipped and why

**Student side**
- [ ] In-app notifications and announcements — ✅ Built
- [ ] Email notifications — ✅ Built, plus an opt-in email copy of any kind of in-app message
- [ ] Calendar reminders — ✅ Built: one server-side calendar of drives, deadlines, rounds, interview slots, tests, preparation tasks, course assignments, assigned interviews and discussions and registered events; a private subscription link for Google, Apple or Outlook calendars (link shown once, can be replaced or switched off), and a one-off .ics download
- [ ] Manage notification preferences — ✅ Built: twelve kinds of message by app, email, SMS and WhatsApp; SMS and WhatsApp are off until switched on (their consent, with date); account and offer messages always show in the app
- [ ] Events for registration, campaign invitations, preparation reminders, course deadlines, test and interview scheduling — ✅ Built: test scheduled, interview slot booked or moved, and hourly reminders (tests opening or closing, course assignments, preparation tasks, assigned interviews and discussions) via `/api/notifications/reminders/run` (needs the scheduler, same as round reminders). Campaign invitations and registration already existed

### M21 – Dashboards and Analytics

**Placement Officer side**
- [ ] TPO dashboard: students, eligible students, opportunities, matching, readiness, results, placement stats — ✅ Built: the existing dashboard plus jobs and shortlisted candidates, preparation campaigns (students, progress, falling behind, ready), mock test results (attempts, average, pass rate), interviews and discussions (counts, averages, how many came from assignments) and a career readiness spread (bands and weakest parts, loaded on request from a fixed sample of up to 300 students)
- [ ] Analytics: placement overview, elimination analysis, per-drive stats, NIRF — ✅ Built
- [ ] Personality cohort analytics — ✅ Built (anonymised)
- [ ] Principal/Director dashboard — ✅ Built: a new read-only PRINCIPAL role (Settings > staff) that can reach only the institution dashboard, analytics and reports; every other route refuses it. Shows placement rate, packages, offers, departments and batches, placement by year, company engagement (visited, returning, top recruiters), training and learning, and preparation activity, with the placement PDF and NIRF downloads. No personality results or individual interview transcripts are shown
- [ ] Employer dashboard — 🟡 Partial: the recruiter portal shows drives and candidates (outside this audit's scope)

**Student side**
- [ ] Student dashboard: profile completion, learning progress, opportunities, applications, offers — ✅ Built (home page)
- [ ] Roadmap, today's tasks, skill development, career readiness — ✅ Built on the home page: today's dated items and late preparation, roadmap progress and next milestones, course progress, skill evidence, career readiness with next steps, mock test results, interviews and discussions, preparation campaigns. Skill development is the evidence-backed skills part of readiness, not a separate trend chart
- [ ] Full view of my own data — ✅ Built (`/student/overview`, privacy page and access log)

---

## 2. Role-wise responsibility check (from your audit)

### Placement Officer portal
- [ ] 1. Invite and manage students (M1, M3) — ✅ Built
- [ ] 2. Access assigned academic structure (M2) — ✅ Built (department coordinators are limited to their department)
- [ ] 3. Assign and monitor assessments (M4) — ✅ Built
- [ ] 4. Monitor career roadmaps (M5) — ✅ Built (`/staff/roadmaps`)
- [ ] 5. Monitor learning and training (M6, M7) — ✅ Built: courses, programmes and the resource library with usage figures
- [ ] 6. Track projects and internships (M8, M9) — ✅ Built (`/staff/projects`, `/staff/internships`)
- [ ] 7. Monitor student resumes (M10) — ✅ Built
- [ ] 8. Manage JDs and candidate matching (M11, M12) — ✅ Built
- [ ] 9. Manage preparation campaigns (M13) — ✅ Built (`/staff/campaigns`)
- [ ] 10. Assign and review assessments (M14, M15) — ✅ Built: tests, marking queue, assigned interviews and discussions with reports
- [ ] 11. Review reports and readiness (M16, M17) — 🟡 Partial: test, interview, discussion, student and group reports and readiness exist; several SRS section 11 reports are still missing (see section 5)
- [ ] 12. Manage placement drives (M18) — ✅ Built
- [ ] 13. Monitor communication and analytics (M19–M21) — ✅ Built, SMS and WhatsApp untested against a live account

### Student portal
- [ ] 1. Activate account (M1) — ✅ Built
- [ ] 2. Complete profile and documents (M3) — ✅ Built
- [ ] 3. Complete Student 360 assessments (M4) — ✅ Built: personality, aptitude, career interests, behavioural style, technical, digital literacy, communication, teamwork
- [ ] 4. View career roadmap (M5) — ✅ Built (`/student/roadmap`)
- [ ] 5. Access courses and resources (M6, M7) — ✅ Built (`/student/courses`, `/student/resources`)
- [ ] 6. Build projects and portfolio (M8) — ✅ Built
- [ ] 7. Participate in internships (M9) — ✅ Built
- [ ] 8. Build resume (M10) — ✅ Built
- [ ] 9. View jobs and matching information (M11, M12) — ✅ Built (gaps and match explanation through campaigns and readiness)
- [ ] 10. Complete preparation campaigns (M13) — ✅ Built (`/student/campaigns`)
- [ ] 11. Attempt mock tests and interviews (M14, M15) — ✅ Built
- [ ] 12. View performance reports (M16, M17) — ✅ Built (test, interview, discussion and performance reports; readiness)
- [ ] 13. Apply and participate in placement drives (M18) — ✅ Built
- [ ] 14. Practise group discussions (M19) — ✅ Built
- [ ] 15. Receive notifications and track progress (M20, M21) — ✅ Built

---

## 3. Data connections to verify

| # | Source → destination | What should flow | Code | Tick |
|---|---|---|---|---|
| 1 | M3 → M4 | Verified academic and profile information | ✅ Built: intelligence reads it | [ ] |
| 2 | M4 → M5 | Personality, aptitude, interests, career profile | ✅ Built: results tick milestones, suggest milestones and target roles | [ ] |
| 3 | M5 → M6 | Learning goals and recommended courses | ✅ Finishing a course ticks a roadmap milestone; courses are recommended from the target role, goal and weak assessment areas (`/student/courses`, with reasons) | [ ] |
| 4 | M5 → M7 | Recommended resources | 🟡 Resources are recommended from assessment results and target role; the roadmap itself does not list them | [ ] |
| 5 | M6 → M21 | Course progress and completion | ✅ Per-course analytics and a college-wide summary on the courses page | [ ] |
| 6 | M8 → M10 | Project information and portfolio evidence | ✅ Submitted projects feed the resume engine, the portfolio and matching | [ ] |
| 7 | M9 → M10 | Internship experience | ✅ Verified internships feed the resume engine and matching | [ ] |
| 8 | M3 + M6 + M8 + M9 → M10 | Resume information | ✅ One master profile reads profile sections, courses, projects, internships and assessments | [ ] |
| 9 | M11 → M12 | Structured job requirements | ✅ Reviewed, mandatory/preferred requirements and scoring weights | [ ] |
| 10 | M3 + M4 + M8 + M9 + M10 → M12 | Student evidence for matching | ✅ Matching reads the master profile with evidence | [ ] |
| 11 | M12 → M13 | Matched and eligible candidates | ✅ Campaigns are built from matches, with gaps kept as they were when invited | [ ] |
| 12 | M13 → M14 | Assigned job-specific tests | ✅ Tests can be linked to a job description and added to a campaign plan | [ ] |
| 13 | M13 → M15 | Assigned mock interview preparation | ✅ Plans include mock interviews; staff can assign interviews and discussions for a job | [ ] |
| 14 | M14 + M15 → M16 | Test and interview results | ✅ Test, interview, discussion, student and group reports | [ ] |
| 15 | M3 + M4 + M6 + M8 + M9 + M14 + M15 → M17 | Career readiness evidence | ✅ Career Readiness Index and Job-Specific Readiness Score | [ ] |
| 16 | M17 → M18 | Readiness information for placement review | ✅ Drive pipeline shows job readiness beside eligibility | [ ] |
| 17 | M18 → M20 | Placement notifications | ✅ Built | [ ] |
| 18 | All modules → M21 | Dashboard and analytics data | ✅ Student, placement office and principal dashboards | [ ] |
| 19 | M2 → M3 | Academic structure fills the student's assigned record | ✅ Built and tested | [ ] |
| 20 | M1 → M3 | Accepting an invitation activates the same student record | ✅ Built and tested | [ ] |

## 4. What I did not check

- Employer, Faculty/Trainer, Interviewer, Alumni and Super Admin portals.
- Whether any screen looks right in a browser. This file reads code and tests, not the running app.
- Non-functional requirements in the SRS beyond section 5 (performance, security hardening, data retention), except where noted.

## 5. SRS requirements outside the module list (added 2026-11-10)

The module checklist covers SRS section 5. These come from the other sections of the SRS (3 roles, 4 structure, 6 screens, 7 data, 8 AI, 9 non-functional, 10 integrations, 11 reports, 17 principles). Checked by reading the code and searching it; nothing was run. Marks mean the same as above.

### Section 11 – Reports and exports
The SRS asks for downloadable reports in PDF, Excel and CSV. What exists: placement report (PDF), NIRF data (Excel), scheduled report emails, student list, offers, applications and eligibility exports (Excel), test, interview, discussion, student performance and group reports (PDF and Word), resume (PDF and Word).
- [ ] Student profile report — ❌ Missing as a download (the profile is a screen and the resume is a separate file)
- [ ] Academic performance report — ❌ Missing as a download
- [ ] Career assessment report — ❌ Missing as a download (results are on screen; personality results are private to the student by design)
- [ ] Career roadmap report — ❌ Missing as a download
- [ ] Course completion report — ❌ Missing as a download (figures are on the Courses and Learning screens)
- [ ] Skill gap report — ❌ Missing as a download (gaps show on the matching and campaign screens)
- [ ] Project report, internship report — ❌ Missing as downloads
- [ ] Resume report — 🟡 Partial: the resume itself downloads; there is no report across students
- [ ] JD analysis report, candidate matching report — 🟡 Partial: the matching board shows everything and the shortlist exports to Excel; no PDF report
- [ ] Preparation campaign report — ❌ Missing as a download (the campaign dashboard is a screen)
- [ ] Mock test report, mock interview report — ✅ Built (PDF and Word)
- [ ] Job readiness report — ❌ Missing as a download (readiness is on screen); the "final readiness report" in the TPO screens list is the same gap
- [ ] Placement drive report, company hiring report — 🟡 Partial: per-drive analytics on screen and an applications export; no combined PDF per drive or per company
- [ ] Department placement report, institutional placement report — ✅ Built (Excel by department, placement PDF, NIRF)
- [ ] CSV as a format — 🟡 Partial: exports are Excel and PDF; CSV is only used in a few places

### Section 8 – AI requirements
- [ ] Document intelligence (OCR, extraction, quality, duplicates) — 🟡 Partial: marksheets are read by an AI vision model with review before anything is verified; no separate document classification, quality check or duplicate detection for uploaded documents
- [ ] Career, recruitment, assessment, interview and resume intelligence — ✅ Built (Student 360 reading, JD parsing, matching with explanations, test analysis and weak topics, interviews and discussions, resume suggestions and ATS checks)
- [ ] Learning intelligence: tutor, recommendations — ✅ Built. **Question generation — ❌ Missing** (questions are written by staff or imported from starter banks, not generated by AI). **Revision planning — ❌ Missing**
- [ ] Preparation intelligence — 🟡 Partial: individual plans, resource and assessment recommendations and next actions come from rules over the student's evidence; the AI is not used to write the plan
- [ ] Retain model and prompt versions for important evaluations — ❌ Missing: only the Student 360 reading stores the model name. AI marks of descriptive answers, interview evaluations and discussion evaluations do not record which model or prompt produced them
- [ ] Clearly identify AI-generated content, human review for consequential decisions, do not invent achievements — ✅ Built: reports label student words and AI text apart, AI marks can be corrected by staff, JD parsing needs review before publishing, prompts forbid inventing achievements and judging voice or appearance
- [ ] Correct inaccurate information — ✅ Built (correction requests, staff review)

### Section 9 – Non-functional
- [ ] Role-based access, institution data isolation, secure sessions, audit logs, MFA for administrators — ✅ Built
- [ ] Multi-factor for all privileged accounts — ✅ Built for administrators (authenticator app)
- [ ] Backup and disaster recovery — 🟡 Partial: relies on Supabase backups; there is no in-app backup, restore or tested recovery drill (the production checklist asks for one)
- [ ] Monitoring and error tracking — 🟡 Partial: JSON logs with request ids and a health endpoint; no error-tracking service or alerting is wired in
- [ ] Retry for failed background jobs — 🟡 Partial: jobs are safe to re-run (each item has a stable key) and delivery of messages is retried by the sweep; there is no job queue
- [ ] Long-running AI work asynchronously, with progress indicators — 🟡 Partial: AI calls run inside the request with a spinner and time limits; nothing is queued
- [ ] Data retention policies and data deletion workflows — ❌ Missing: nothing is deleted automatically and there is no student deletion or retention setting (the README says so)
- [ ] Informed consent for assessments and recordings — ✅ Built (personality consent, voice consent; no audio or video is recorded)
- [ ] Mobile-responsive, accessible, search and filters — 🟡 Partial: built with responsive components and labelled controls; not tested with a screen reader or on devices
- [ ] Encryption at rest and in transit, secure document storage — ✅ Provided by the hosting (Supabase and HTTPS); documents sit in private storage with signed links
- [ ] Applicable Indian data protection compliance — ❌ Not assessed: consent, correction and an access log exist, but there is no breach process, retention schedule, deletion workflow or grievance contact

### Section 10 – Integrations
- [ ] Email (SMTP), calendar (feeds and .ics), AI providers, cloud storage — ✅ Built
- [ ] SMS and WhatsApp — 🟡 Built, untested against a live account (see M20)
- [ ] GitHub — ✅ Built for team repositories (public commit counts)
- [ ] Video conferencing — 🟡 Partial: live sessions and events carry a meeting link; no creation of meetings
- [ ] Coding assessment environment — ❌ Missing: coding and SQL answers are marked by reading, not run
- [ ] College ERP / student information system, university systems — ❌ Missing: students arrive by CSV import only
- [ ] External LMS and learning providers, payment gateway — ❌ Missing (the payment gateway is only needed if subscriptions are introduced)

### Sections 3, 4 and 6 – Roles, structure, screens
- [ ] Super Administrator — 🟡 Partial: a separate platform portal registers institutions and protects platform admins with two-step sign-in; AI configuration is by environment variables, and there is no subscription, platform analytics or support monitoring screen
- [ ] Institution Administrator / Principal / Director — ✅ Built (read-only PRINCIPAL role and institution dashboard); "assign administrative permissions" stays with the Head TPO
- [ ] Head TPO, Placement Officer, Department Coordinator, Faculty / Mentor, Student, Employer (recruiter portal) — ✅ Built
- [ ] Training Coordinator / Trainer role — ❌ Missing as a separate role (training programmes and courses are run by placement staff and faculty)
- [ ] Interviewer role and Interviewer portal — ❌ Missing: panels and slots exist but an interviewer cannot log in, see a schedule or submit evaluation forms
- [ ] Alumni / Industry Mentor role — 🟡 Partial: external mentors can review projects and internships through a one-time link; no alumni profile, mentorship offers or career sessions
- [ ] Permission principle: institution, department, batch, individual, company-specific and temporary access — 🟡 Partial: college, department, individual and company-specific access exist and temporary links exist for mentors; there is no campus-level or batch-level access scope for staff
- [ ] Configurable roles and permissions — ❌ Missing: the roles and their permissions are fixed in code (no Role or Permission tables)
- [ ] Public website / landing page — ❌ Missing: the home page redirects to the sign-in screen
- [ ] Mobile-responsive student application — 🟡 Partial: the student portal is responsive and has a manifest; there is no native app
- [ ] Student, TPO and Employer screen lists in section 6 — ✅ Built for the student and placement portals (including the final readiness view on screen). "Mock interview scheduling" is assignments with a last day, not time slots

### Section 7 – Data and history
- [ ] Core entities — ✅ Built for the student, organisation, learning, practical experience, resume, recruitment, preparation, assessment, interview, placement and communication groups. Skills and skill evidence are derived from other records, not tables of their own; interview questions and responses are stored inside the interview record
- [ ] History of JD changes and eligibility changes — 🟡 Partial: the audit log records that a JD or an eligibility rule changed and who did it, but not the earlier content, so old versions cannot be viewed or restored
- [ ] History of score versions, preparation activities and placement status — ✅ Built (readiness snapshots, kept AI readings, plan items, status worked out from dated records)

### Section 17 – Design principles
- [ ] One student master profile, evidence-based skills, AI-assisted and human-controlled, reusable resources, continuous improvement, measurable outcomes — ✅ Followed (master profile feeds resume, matching, readiness; test and interview weak areas feed recommendations and practice sets)
- [ ] Configurable workflows — 🟡 Partial: many settings are per college (profile sections, approvals, reassessment rules, channels, modules); readiness and matching weights per job exist, readiness weights are fixed

## 6. Documents that were out of date (fixed 2026-11-10)

- This file: the summary counts, cross-module findings, role-wise lines and data connection rows still described the state before Modules 6 to 21.
- `README.md` listed SMS and WhatsApp, staff multi-factor sign-in and AI mock interviews as "not built", and said three scheduled jobs were needed.
- `vercel.json` did not schedule the new reminders job, so reminders and the message sweep would not have run on Vercel.
- `.env.example` had no entries for the SMS and WhatsApp keys.

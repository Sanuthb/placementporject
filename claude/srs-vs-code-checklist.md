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

Last checked against the code: 2026-11-08 (M3, M4 and M5 checked 2026-11-09).

## Summary (generated from the lines below)

| Module | Lines | ✅ Built | 🟡 Partial | ❌ Missing | ⏸ On hold | You ticked it done |
|---|---|---|---|---|---|---|
| M1 – Authentication and User Management | 17 | 15 | 0 | 0 | 2 | [ ] |
| M2 – Institution Management | 13 | 13 | 0 | 0 | 0 | [ ] |
| M3 – Student Registration and Profile | 19 | 19 | 0 | 0 | 0 | [ ] |
| M4 – Student Assessment and Career Profiling | 21 | 20 | 0 | 1 | 0 | [ ] |
| M5 – Career Roadmap and Student Development | 10 | 7 | 2 | 1 | 0 | [ ] |
| M6 – Learning Management System | 11 | 9 | 2 | 0 | 0 | [ ] |
| M7 – Resource Management System | 9 | 7 | 2 | 0 | 0 | [ ] |
| M8 – Project Management and Portfolio | 7 | 0 | 2 | 5 | 0 | [ ] |
| M9 – Internship Management | 7 | 4 | 3 | 0 | 0 | [ ] |
| M10 – Dynamic Resume Engine | 9 | 3 | 2 | 4 | 0 | [ ] |
| M11 – Job Description Management and AI Analysis | 7 | 2 | 3 | 2 | 0 | [ ] |
| M12 – AI Candidate Matching Engine | 8 | 3 | 2 | 3 | 0 | [ ] |
| M13 – Job-Specific Preparation Campaign | 8 | 0 | 0 | 8 | 0 | [ ] |
| M14 – Mock Test Engine | 9 | 3 | 4 | 2 | 0 | [ ] |
| M15 – AI Mock Interview Engine | 7 | 1 | 2 | 4 | 0 | [ ] |
| M16 – Report Generation | 5 | 0 | 3 | 2 | 0 | [ ] |
| M17 – Job Readiness Engine | 5 | 0 | 2 | 3 | 0 | [ ] |
| M18 – Placement Management | 12 | 11 | 0 | 1 | 0 | [ ] |
| M19 – Group Discussion and Communication Simulator | 1 | 0 | 0 | 1 | 0 | [ ] |
| M20 – Notification Centre | 9 | 5 | 3 | 1 | 0 | [ ] |
| M21 – Dashboards and Analytics | 8 | 3 | 4 | 1 | 0 | [ ] |
| **Total** | **202** | **110** | **37** | **53** | **2** | |

## Cross-module findings worth reading first

1. **Course-based LMS, projects, resource library with workflow, JD upload with AI parsing, candidate matching score, preparation campaigns, readiness score, group-discussion simulator, roadmap**: none of these exist as modules. M6, M7, M8, M11, M12, M13, M17, M19 and M5 are the main gaps, and several of them depend on each other (see section 3).
2. **Projects are only a text section** in the student profile (title, tools, link). There is no project record, no team, no milestone, no faculty review. So the M8 to M10 and M8 to M12 links cannot be real yet.
3. **AI is used in two places**: AI mock interviews (Claude, text only) and the Student 360 intelligence reading (Groq). Nothing else in the SRS's AI list (JD parsing, matching, resource recommendations, tutor, preparation plans, test improvement engine) exists.
4. **Only three staff roles exist** (Head TPO / admin, Placement Officer, Department Coordinator). Principal, Faculty, Trainer, Interviewer and Alumni roles do not exist in the staff portal.
5. **Login security gaps against M1**: no mobile OTP, no SSO, no multi-factor authentication for privileged accounts, no login-history screen.

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
- [ ] M4 → M5: assessment results feed a roadmap — ❌ Missing (no roadmap module yet; the recommendations are the data it will use).
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
- [ ] Learning recommendations from assessments — 🟡 Partial: weak assessment results become suggested milestones the student can add (with the reason), but they point at practice and preparation resources in general; there are no courses or resource library to recommend from yet (M6 and M7). Tested: unit.
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

**Placement Officer side**
- [ ] Project repository, problem statements, allocation, teams, milestones, tasks — ❌ Missing
- [ ] Faculty and industry mentor review, evaluation — ❌ Missing
- [ ] Monitor projects — ❌ Missing

**Student side**
- [ ] List projects in the profile — 🟡 Partial: a text section (title, tools, description, link)
- [ ] Create team projects, submit work, GitHub integration, documentation, presentations — ❌ Missing
- [ ] Portfolio generation — 🟡 Partial: a shareable public profile page with a revocable link (`/student/showcase`)

**Connection**
- [ ] M8 → M10 / M12 project evidence — ❌ Missing as real records (only the text section is read)

### M9 – Internship Management

**Placement Officer side**
- [ ] Post internships, approve applications, track participation — ✅ Built (`/staff/internships`)
- [ ] Mentor allocation, attendance, deliverables — 🟡 Partial: work logs are reviewed by staff; no mentor allocation or attendance
- [ ] Performance evaluation — ✅ Built
- [ ] Certificate upload and completion — 🟡 Partial: completion is tracked; no certificate upload
- [ ] PPO tracking — ✅ Built (offers carry a PPO flag)

**Student side**
- [ ] Apply, log weekly work, see status — ✅ Built (`/student/internships`)

**Connection**
- [ ] M9 → M10: completed internships appear on the resume — 🟡 Partial: the resume reads the self-entered Internships section, not the internship records

### M10 – Dynamic Resume Engine

**Placement Officer side**
- [ ] Monitor resume availability and readiness — ✅ Built (resume readiness by department; resume PDF on a student)
**Student side**
- [ ] Single master profile as the source — ✅ Built
- [ ] PDF export — ✅ Built
- [ ] DOCX export — ❌ Missing
- [ ] Multiple templates and resume types — ❌ Missing: one layout
- [ ] AI content suggestions — 🟡 Partial: a resume quality checklist with hints, not AI writing
- [ ] Version history, student approval — ❌ Missing
- [ ] Distinguish claimed from verified skills — 🟡 Partial: section verification status exists; skills are not individually evidenced
- [ ] Automatic update when a course, project, internship or certification is completed — ❌ Missing

### M11 – Job Description Management and AI Analysis

**Placement Officer side**
- [ ] Create a job/drive manually — ✅ Built (`/staff/drives/new`: role, package, eligibility rules, rounds)
- [ ] Upload JD as PDF/DOCX/text — 🟡 Partial: a document can be attached to a drive; no parsing
- [ ] AI extraction of skills, qualifications, experience, selection process — ❌ Missing
- [ ] Edit extracted data, mark mandatory vs preferred, scoring weights — ❌ Missing
- [ ] Approval before publishing — 🟡 Partial: drives have a publish step and an optional admin approval rule; recruiter-posted jobs have a review step (`recruiter-jobs`)

**Student side**
- [ ] View published opportunities and job requirements — ✅ Built (`/student/drives`, job alerts)

**Connection**
- [ ] M11 → M12 structured job requirements — 🟡 Partial: structured eligibility thresholds exist; no structured skill requirements

### M12 – AI Candidate Matching Engine

**Placement Officer side**
- [ ] Mandatory eligibility evaluation, separate from any score — ✅ Built (rules, exceptions, blocks, reasons per student, export)
- [ ] Matching score, ranking, configurable weights — ❌ Missing
- [ ] Skills matched / partial / missing, explanation of the match — ❌ Missing
- [ ] Candidate comparison — ❌ Missing
- [ ] Shortlisting by rounds — ✅ Built (round results, shortlist export)
- [ ] Personality not used as a filter — ✅ Built

**Student side**
- [ ] See relevant opportunities and match information — 🟡 Partial: students see only drives they are eligible for, with the reason if not; no match score

**Connection**
- [ ] Evidence from M3, M4, M8, M9, M10 compared to requirements — 🟡 Partial: the new Student 360 page compares verified marks to open drives' thresholds as a guide only

### M13 – Job-Specific Preparation Campaign

**Placement Officer side**
- [ ] Create campaign from an approved JD; select, invite (bulk) and remove candidates — ❌ Missing
- [ ] Campaign dashboard (invited, accepted, declined, ready, needing help) — ❌ Missing
- [ ] Assign trainers, tests, interviews, resources, milestones — ❌ Missing
- [ ] Record all campaign changes — ❌ Missing

**Student side**
- [ ] Receive, accept or decline a campaign invitation; request support — ❌ Missing
- [ ] AI-made individual preparation plan — ❌ Missing
- [ ] Skill gap report — ❌ Missing

**Connection**
- [ ] M12 → M13 → M14/M15 — ❌ Missing

### M14 – Mock Test Engine

**Placement Officer side**
- [ ] Configure tests: duration, marks, negative marking, randomisation, start/end, attempts, result visibility — 🟡 Partial: duration, marks, negative marking, schedule window and baseline/practice flag exist; pass criteria and attempt limits are limited
- [ ] Related JD on a test — ❌ Missing
- [ ] Categories (aptitude, technical, programming, SQL, case study, company simulation) — 🟡 Partial: question banks with tags and difficulty; no coding or SQL execution
- [ ] Question types — 🟡 Partial: single and multiple choice only
- [ ] Proctoring — ✅ Built: violation counting and flagging (beyond the SRS)
- [ ] View results by schedule — ✅ Built

**Student side**
- [ ] Attempt assigned tests and practice tests — ✅ Built (`/student/assessments`)
- [ ] Report: overall score, correct answers, explanations — 🟡 Partial: result and explanations; no topic-wise accuracy, time analysis or weak topics
- [ ] AI improvement engine: gaps, targeted exercises, next test — ❌ Missing

### M15 – AI Mock Interview Engine

**Placement Officer side**
- [ ] Configure or monitor mock interviews — ❌ Missing: students self-start; staff cannot configure or see them
- [ ] Review interview reports — ❌ Missing for staff

**Student side**
- [ ] Text mock interview for a role and topic, follow-up questions, scored feedback — ✅ Built (`/student/prep`, AI-powered)
- [ ] Types (HR, technical, behavioural, etc.), difficulty, duration, language, JD-based — 🟡 Partial: role and topic only
- [ ] Learning mode vs assessment mode — ❌ Missing
- [ ] Voice or video, audio/video permission checks — ❌ Missing
- [ ] Report with category scores and previous-attempt comparison — 🟡 Partial: summary, score, strengths, improvements, per-answer comments

### M16 – Report Generation

**Placement Officer side**
- [ ] Student, batch and placement reports — 🟡 Partial: placement PDF and NIRF report, scheduled reports by email, Excel exports; no per-student or per-batch report generator
- [ ] Mock test and mock interview reports — ❌ Missing for staff
- [ ] DOCX export — ❌ Missing (PDF and Excel exist)
- [ ] Separate student answers from AI comments — 🟡 Partial: done in the interview feedback; no formal report

**Student side**
- [ ] View permitted personal assessment and performance reports — 🟡 Partial: assessment results and personality results; no consolidated report

### M17 – Job Readiness Engine

**Placement Officer side**
- [ ] Review student readiness and gaps — 🟡 Partial: Student 360 intelligence shows scores, gaps and open-drive comparison; no readiness index
- [ ] Career Readiness Index — ❌ Missing as a defined measure
- [ ] Job-Specific Readiness Score — ❌ Missing

**Student side**
- [ ] View readiness progress — 🟡 Partial: a small summary (profile verified, assessments taken, drives attended, interviews done). It is a progress count, not an explainable score.

**Connection**
- [ ] M3, M4, M6, M8, M9, M14, M15 → M17 → M18 — ❌ Missing

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
- [ ] Placement status steps "Preparation assigned / Mock test completed / Mock interview completed" — ❌ Missing: those statuses do not exist because campaigns do not

### M19 – Group Discussion and Communication Simulator

- [ ] AI topics, multiple AI participants, voice discussion, debate, presentation practice, evaluation — ❌ Missing for both portals. (Group discussion exists only as a drive round type.)

### M20 – Notification Centre

**Placement Officer side**
- [ ] Send announcements and messages — ✅ Built (`/staff/communications`, templates)
- [ ] Email — ✅ Built (SMTP); reminders for rounds, assessments and personality tests
- [ ] SMS and WhatsApp — ❌ Missing
- [ ] Notifications for submitted profiles, correction requests, approvals — ✅ Built, with an Open link to the right screen

**Student side**
- [ ] In-app notifications and announcements — ✅ Built
- [ ] Email notifications — ✅ Built
- [ ] Calendar view of reminders — 🟡 Partial: a calendar page of drives, rounds and slots; no calendar-file or external calendar sync
- [ ] Manage notification preferences — 🟡 Partial: two switches (announcements, reminders)
- [ ] Events for registration, campaign invitations, preparation reminders, course deadlines — 🟡 Partial: registration, results, drive and offer updates exist; the campaign and course ones do not

### M21 – Dashboards and Analytics

**Placement Officer side**
- [ ] TPO dashboard: students, eligible students, opportunities, matching, readiness, results, placement stats — 🟡 Partial: students, drives, offers, attention items and analytics exist; matching, campaigns and readiness are not there
- [ ] Analytics: placement overview, elimination analysis, per-drive stats, NIRF — ✅ Built
- [ ] Personality cohort analytics — ✅ Built (anonymised)
- [ ] Principal/Director dashboard — ❌ Missing: no such role or view
- [ ] Employer dashboard — 🟡 Partial: the recruiter portal shows drives and candidates (outside this audit's scope)

**Student side**
- [ ] Student dashboard: profile completion, learning progress, opportunities, applications, offers — 🟡 Partial: home page covers profile, drives, applications, offers, notifications
- [ ] Roadmap, today's tasks, skill development, career readiness — 🟡 Partial: the roadmap exists (`/student/roadmap`) but is not on the home dashboard; no daily tasks or readiness score
- [ ] Full view of my own data — ✅ Built (`/student/overview`, privacy page and access log)

---

## 2. Role-wise responsibility check (from your audit)

### Placement Officer portal
- [ ] 1. Invite and manage students (M1, M3) — ✅ Built
- [ ] 2. Access assigned academic structure (M2) — ✅ Built (department coordinators are limited to their department)
- [ ] 3. Assign and monitor assessments (M4) — ✅ Built
- [ ] 4. Monitor career roadmaps (M5) — ✅ Built (`/staff/roadmaps`)
- [ ] 5. Monitor learning and training (M6, M7) — ✅ Built: courses, programmes and the resource library with usage figures
- [ ] 6. Track projects and internships (M8, M9) — 🟡 Partial: internships yes, projects no
- [ ] 7. Monitor student resumes (M10) — ✅ Built
- [ ] 8. Manage JDs and candidate matching (M11, M12) — 🟡 Partial
- [ ] 9. Manage preparation campaigns (M13) — ❌ Missing
- [ ] 10. Assign and review assessments (M14, M15) — 🟡 Partial
- [ ] 11. Review reports and readiness (M16, M17) — 🟡 Partial
- [ ] 12. Manage placement drives (M18) — ✅ Built
- [ ] 13. Monitor communication and analytics (M19–M21) — 🟡 Partial

### Student portal
- [ ] 1. Activate account (M1) — ✅ Built
- [ ] 2. Complete profile and documents (M3) — ✅ Built
- [ ] 3. Complete Student 360 assessments (M4) — ✅ Built: personality, aptitude, career interests, behavioural style, technical, digital literacy, communication, teamwork
- [ ] 4. View career roadmap (M5) — ✅ Built (`/student/roadmap`)
- [ ] 5. Access courses and resources (M6, M7) — ✅ Built (`/student/courses`, `/student/resources`)
- [ ] 6. Build projects and portfolio (M8) — 🟡 Partial: text section and shareable page
- [ ] 7. Participate in internships (M9) — ✅ Built
- [ ] 8. Build resume (M10) — 🟡 Partial
- [ ] 9. View jobs and matching information (M11, M12) — 🟡 Partial
- [ ] 10. Complete preparation campaigns (M13) — ❌ Missing
- [ ] 11. Attempt mock tests and interviews (M14, M15) — 🟡 Partial
- [ ] 12. View performance reports (M16, M17) — 🟡 Partial
- [ ] 13. Apply and participate in placement drives (M18) — ✅ Built
- [ ] 14. Practise group discussions (M19) — ❌ Missing
- [ ] 15. Receive notifications and track progress (M20, M21) — 🟡 Partial

---

## 3. Data connections to verify

| # | Source → destination | What should flow | Code | Tick |
|---|---|---|---|---|
| 1 | M3 → M4 | Verified academic and profile information | ✅ Built: intelligence reads it | [ ] |
| 2 | M4 → M5 | Personality, aptitude, interests, career profile | ✅ Built: results tick milestones, suggest milestones and target roles | [ ] |
| 3 | M5 → M6 | Learning goals and recommended courses | ✅ Finishing a course ticks a roadmap milestone; courses are recommended from the target role, goal and weak assessment areas (`/student/courses`, with reasons) | [ ] |
| 4 | M5 → M7 | Recommended resources | 🟡 Resources are recommended from assessment results and target role; the roadmap itself does not list them | [ ] |
| 5 | M6 → M21 | Course progress and completion | ✅ Per-course analytics and a college-wide summary on the courses page | [ ] |
| 6 | M8 → M10 | Project information and portfolio evidence | 🟡 Only the self-entered Projects text section | [ ] |
| 7 | M9 → M10 | Internship experience | 🟡 Resume reads the self-entered section, not internship records | [ ] |
| 8 | M3 + M6 + M8 + M9 → M10 | Resume information | 🟡 M3 only (profile sections) | [ ] |
| 9 | M11 → M12 | Structured job requirements | 🟡 Eligibility thresholds only | [ ] |
| 10 | M3 + M4 + M8 + M9 + M10 → M12 | Student evidence for matching | 🟡 Thresholds from M3; Student 360 page shows evidence but no matching | [ ] |
| 11 | M12 → M13 | Matched and eligible candidates | ❌ | [ ] |
| 12 | M13 → M14 | Assigned job-specific tests | ❌ | [ ] |
| 13 | M13 → M15 | Assigned mock interview preparation | ❌ | [ ] |
| 14 | M14 + M15 → M16 | Test and interview results | 🟡 Results exist in each module; no combined report | [ ] |
| 15 | M3 + M4 + M6 + M8 + M9 + M14 + M15 → M17 | Career readiness evidence | 🟡 Student 360 reads M3, M4, M9 data, mock interviews and tests; no readiness score | [ ] |
| 16 | M17 → M18 | Readiness information for placement review | ❌ | [ ] |
| 17 | M18 → M20 | Placement notifications | ✅ Built | [ ] |
| 18 | All modules → M21 | Dashboard and analytics data | 🟡 For the modules that exist | [ ] |
| 19 | M2 → M3 | Academic structure fills the student's assigned record | ✅ Built and tested | [ ] |
| 20 | M1 → M3 | Accepting an invitation activates the same student record | ✅ Built and tested | [ ] |

## 4. What I did not check

- Employer, Faculty/Trainer, Interviewer, Alumni and Super Admin portals.
- Whether any screen looks right in a browser. This file reads code and tests, not the running app.
- Non-functional requirements in the SRS beyond section 5 (performance, security hardening, data retention), except where noted.

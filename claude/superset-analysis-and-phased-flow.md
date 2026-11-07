# Superset Student Portal: Analysis and Phased Rework

Source: live walkthrough of `app.joinsuperset.com/students` (read-only, no data changed) compared with `SOFTWARE REQUIREMENTS SPECIFICATION Placement (1).docx`, `stundentfeatures.md` and `placementfeatures.md`. Personal values from the test account are deliberately left out.

---

## 1. What Superset's student side contains

### 1.1 Navigation (left rail)
Home · Job Profiles · My Profile · Interviews · Assessments · Events · Competitions · Resume · Launchpad (new) · Help. Header: settings, downloads, notifications, avatar.

### 1.2 Home
A feed of **announcement posts written by the placement officer**, one per opened job. Each post carries: company and role, "applicable courses" grouped by campus, eligibility (UG / 10th / 12th minimum %, backlog rule), hiring stages, application deadline. Students are told to go to Job Profiles to apply. Right rail has the college card and blog links. Home is a feed only; there is no task list, progress or "next action" panel.

### 1.3 My Profile: data collected
| Section | Fields collected |
|---|---|
| Basic details | Name, DOB, gender (**synced from Aadhaar, locked**), current college; phone, primary and personal email (verified ticks); summary; permanent and current address; extra questions (languages spoken and written, willing to work in city, shifts, own two-wheeler with licence); placement enrolments by season with status (Enrolled / Placed / Enrollment Closed); social profiles |
| Education | Current course: institution, department, degree, branch, current semester, roll number, pass-out batch, % or CGPA, marksheet upload. Previous: Class X and XII (board, school, year, %), plus diploma/UG where applicable. Each entry has its own verified tick |
| Internship & work | Title, company, dates, location, type, function, industry, stipend range, description |
| Skills, subjects, languages | Technical skills with level (Beginner / Intermediate / Advance); languages with proficiency; subjects |
| Positions of responsibility, Projects | Free-form entries (empty for this student) |
| Accomplishments | Awards, Certification, Competitions, Conferences & Workshops, Test Scores, Patents, Publications, Scholarships |
| Volunteering, Extra-curricular | Free-form entries |
| Resume, Docs, Write-ups | Uploaded resume PDFs, documents, write-ups |
| Guardians | Guardian details |

**Governance model:** once the profile is verified it is **locked**. Changes go through a "Change request" to the placement cell or Superset support, and the student sees their request history. Identity fields come from an external source (Aadhaar), not typed.

### 1.4 Job flow (the core)
1. Officer opens a job profile and posts it to the Home feed.
2. **Job Profiles** list has tabs *All Jobs* and *Applied Jobs*; filters for sector, position type, status; sort; search.
3. Each job shows one status badge: *Applied, Accepted, Not Selected, Applications closed, Not eligible*.
4. Job detail tabs:
   - **Job Description:** category, function, CTC, free text, required skills (optional and often blank), additional info, attached documents.
   - **Hiring Workflow:** a vertical timeline (Application → Online test → Technical → HR → Offer) with venue "to be announced". Completed steps turn green.
   - **Eligibility Criteria:** pass/fail with a rule list. The rules are placement-policy rules (max offers per category, per level and per placement season, attempt counts), shown beside the academic criteria.
   - **Documents and Certifications:** No Objection Certificate request, "only if the company asks".
5. After an offer: banner "upload signed copy of offer letter".
6. Interviews, Assessments, Events: calendar-style lists (Upcoming / Past), empty here.
7. Competitions: company-run contests with "Show Journey".

### 1.5 Resume
Template-based builder using templates the college enables; multiple resumes allowed; fills from the profile.

### 1.6 Launchpad (learning area)
Home, Job Profiles, Assessment, My Learning, My Badges, Guides, Placement Stories, Practice Test, Career Counselling, Resources. **Most items are greyed out and only Home, Job Profiles and Placement Stories were active**, which shows module gating by what the college bought.

### 1.7 Not inspected
Notifications, settings and Help were not opened.

---

## 2. Where Superset stops, and where your docs go further

| Area | Superset | Your SRS / feature docs |
|---|---|---|
| Job requirements | Free text; "Required skills" mostly empty | JD parsing to structured, TPO-approved requirements (mandatory vs preferred, weights) |
| Eligibility | Pass/fail plus policy caps | Same, kept **separate** from the match score, with reasons shown |
| Matching | None. Student browses a flat list | Explainable match score, evidence, ranking |
| Skill gap | None | Per-student gap vs job |
| Preparation | None (Launchpad is greyed) | Campaigns, invitations, individual plan, resources, tracking |
| Mock tests / AI interviews | Assessments only as scheduled company tests | Mock test engine, AI interview, reports, improvement loop |
| Readiness | None | Career Readiness Index and Job-Specific Readiness |
| Skills evidence | Self-declared level | Evidence-based: claimed vs supported |
| Resume | Template fill | Dynamic, auto-updating, JD-tailored, ATS check, versions |
| Roadmap, LMS, career profiling | None | Four-year roadmap, LMS, Big Five / RIASEC |
| Dashboard | Announcement feed | Tasks, progress, readiness, next action |
| Post-offer | Offer letter upload, NOC | Offer, acceptance, joining tracking |

Superset parts worth copying: locked verified profile with change requests, identity data from a trusted source, per-entry verified ticks, per-season placement enrolment, offer-cap policy engine, module gating, NOC request, Applied vs All split, one clear status badge per job.

---

## 3. Issues in the docs to settle before building

1. **Two sources, two scopes.** The feature files are the placement-core product with sellable modules. The SRS is a much larger development platform (LMS, AI tutor, projects, internships, alumni). Treat the feature files as the base and the SRS as the roadmap on top.
2. **SRS puts JD parsing and matching in Release 1, but its own closing section says the first priority is the full JD-to-placement loop including prep and mock interviews.** The release plan and the stated priority disagree. This is the main decision for you (see section 5).
3. **Personality data.** Both docs forbid using it for eligibility, but the SRS lists Big Five and DISC inside the "360° profile" that feeds matching. It must stay out of the matching inputs.
4. **Student view was missing** one thing the SRS asks for ("students always know the next action"): there is no defined Home. Added in Phase 1.
5. **Eligibility exceptions, blocks and attendance** exist in the feature files but not in the SRS. They are kept.

---

## 4. Reworked student flow

```
Invite → Activate → Fill profile → Submit sections → Officer verifies → Verified (locked)
   → Placement status (registered / opted out / ...)
   → Job posted → Eligibility check (with reasons) → Apply (resume snapshot)
   → Rounds (attend / clear / reject, with next step shown)
   → Offer → Accept / decline → Joined
(Later phases insert, between "Eligibility" and "Apply": match score, skill gap,
 invitation, prep plan, resources, mock test, mock interview, readiness.)
```

Student states: `invited → active → profile submitted → verified → registered for placement → applied → in round N → offered → accepted → joined`, with side states `blocked`, `opted out`, `not eligible`.

---

## 5. Phase plan (proposed)

| Phase | Name | Student gets | Officer gets | Depends on |
|---|---|---|---|---|
| 0 | Foundation | Invite, sign-in, college-only data, module gating, PWA shell | Departments, staff, roles, batches, import template, audit log | none |
| 1 | Master profile and verification | Profile sections with draft / submit / changes-requested / verified, lock and change request, completion bar, Home with next action, documents | Import, invites, verification queue, student 360 | 0 |
| 2 | Drives and applications (Superset parity) | Job list, eligibility with reasons, apply, application tracking, round timeline, calendar, announcements, offers and acceptance | Companies, drive builder, eligibility rules, rounds, results, offers, approvals | 1 |
| 3 | Attendance and blocking | QR check-in, history, block notice and review request | Check-in, policies, block / lift | 2 |
| 4 | JD intelligence | Why I match, skill gaps, "recommended for you" | JD upload and parse, review and approve, match ranking, shortlist | 2 |
| 5 | Preparation campaigns | Invitation, accept or decline, prep plan, assigned resources, progress | Campaign, resource library and assignment, progress dashboard | 4 |
| 6 | Mock tests and AI interviews | Tests, interview practice, reports, improvement loop, readiness score | Test builder, question bank, readiness view | 5 |
| 7 | Resume and portfolio | Dynamic resume, JD-tailored version, projects, internships, share link | Resume readiness batch view, internship tracking | 1 |
| 8 | Learning and roadmap | LMS, career assessments, four-year roadmap, AI tutor | Trainers, batches, course analytics | 1, 6 |
| 9 | Institutional intelligence | Notification preferences, privacy centre | Analytics, NAAC / NIRF exports, ERP sync, multi-campus, SSO | all |

**Why this order:** phases 0 to 3 give you a working placement portal comparable to Superset. Phases 4 to 6 are the part Superset lacks and your SRS defines as the product. Resume (7) depends only on the profile, so it can run in parallel with 4 to 6.

**Decision for you:** if the differentiator must show earliest, move a thin version of Phase 4 (structured JD requirements and a match explanation) into Phase 2 so the data model is right from the start. I recommend this: store requirements as structured fields from day one even if parsing is manual, because retrofitting them later is costly.

---

## 6. Next step
Pick the phase to detail first. I suggest Phase 1 (profile and verification): screens, fields, statuses, rules, and the student-side acceptance criteria.

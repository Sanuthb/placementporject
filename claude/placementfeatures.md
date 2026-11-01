# Placement Officer: Feature Specification

A list of everything a placement officer can do in the platform. No technical detail here; this describes what the product does.

**Module tags** (shown in each heading) show which sellable module a feature belongs to, so a college only sees what it has bought.

---

## 1. Dashboard `Core`
1. Student counts by stage: invited, active, submitted, verified, onboarded, placed.
2. Placement progress: students placed vs total, by department and batch.
3. "Needs your attention" list: sections waiting for review, drives closing soon, offers awaiting response.
4. Upcoming drives and rounds in the next 7 days.
5. Offers received this week.
6. Quick actions: import students, create drive, open verification queue.

---

## 2. Student Onboarding `Onboarding module`

### 2.1 Bring students in
1. Upload an Excel/CSV of admitted students.
2. Preview the first rows and see validation errors before confirming.
3. Import continues even if some rows are bad; a result summary shows created, skipped, and failed rows.
4. Download an error file listing every failed row and the reason.
5. Download a blank import template.
6. Add or edit a single student manually.
7. Import past years' placement records (students, companies, offers, packages) so analytics are useful from the first season.
8. Mark imported historical records as "archived" so they don't mix with the current season.

### 2.2 Invite students
1. Send login invites by email to selected students or to a whole batch.
2. Resend invites to students who haven't activated.
3. See invite status: not sent, sent, activated.
4. Deactivate or reactivate a student account.

### 2.3 Student profile sections
Students fill the following; the officer sees each section's status (draft, submitted, changes requested, verified):
1. Personal details
2. Academics (10th, 12th, semester-wise marks, backlogs)
3. Education history
4. Skills
5. Projects
6. Internships
7. Resume
8. Supporting documents (marksheets, ID proof)

### 2.4 Verification
1. A queue of all submitted sections, filterable by section, department, batch, and waiting time.
2. Review a section with the student's data and the uploaded proof side by side.
3. Approve a section.
4. Request changes with a required comment; the student sees it and resubmits.
5. Bulk-approve sections for a department once checked.
6. Department coordinators can verify students of their own department only.
7. When all required sections are verified, the student becomes "verified".
8. Mark a verified student as "onboarded".
9. After verification, changes to verified fields (marks, backlogs) need a new review; nothing is silently overwritten.
10. Full history of who verified what and when.

### 2.5 Personality and aptitude assessment `Psychometrics module`
1. Require or not require the test before a student is onboarded (college setting).
2. See which students have completed it and which haven't; send reminders.
3. View cohort-level results by department and batch (averages and distributions). Small groups are hidden to protect privacy.
4. Individual results are visible to the student; staff access to individual results is limited and logged.
5. Results are used for guidance and analysis only, never to block or reject a student.

### 2.6 Placement participation status
1. Mark each student as: registered for placement, opted out, higher studies, entrepreneurship, or not eligible (with reason).
2. Opted-out students are excluded from "unplaced" counts and from drive eligibility.
3. Placement percentage is calculated only on students registered for placement.
4. Students can request a status change; the officer approves it.
5. Status history is kept.

---

## 3. Student 360 View `Onboarding module`
One page with everything about a student:
1. Profile and verification status per section.
2. Academics: semester-wise results, backlog history.
3. Documents and resume.
4. Drives applied, attended, absent, cleared, rejected.
5. Round-by-round journey for each drive.
6. Offers received and decisions.
7. Active blocks and their reasons.
8. Notes added by placement staff.
9. Timeline of all changes and actions.

### Student analysis
1. Semester-wise performance trend and weak subjects.
2. Comparison with the batch and department average.
3. Readiness indicators: assessment scores, skills coverage, drives attended.
4. Personality profile (where the Psychometrics module is on).
5. "At risk" flags: low attendance at drives, repeated rejection at the same round, unfilled profile sections.

### Resume tools
1. Resume analysis per student: completeness, keywords, and an improvement checklist.
2. Batch view: how many students have a ready resume.
3. Resume in the college's own format, generated from verified data.

---

## 4. Companies `Drives module`
1. Add and edit companies with contact details and industry.
2. Tag a company tier: dream, super dream, core, regular.
3. See each company's drive history: years visited, students hired, packages.
4. Notes on conversations and follow-ups.
5. Record company feedback after a drive: feedback on the students, the process, and what to improve next year.
6. Track repeat visits, conversion from internship to offer, and relationship status.

---

## 5. Placement Drives `Drives module`

### 5.1 Create a drive
1. Basic details: company, role, job type (full-time, internship, internship with offer), location, package range, venue, application deadline, drive date.
2. Eligibility rules:
   - minimum CGPA
   - minimum 10th and 12th percentage
   - maximum active backlogs
   - eligible departments, batches, and programs
   - whether already-placed students may apply
3. Rounds in order: aptitude, coding, group discussion, technical, HR, other. Each with a schedule and venue.
4. Attach the job description and other documents.
5. Save as draft, then publish.
6. Edit, close early, cancel, or duplicate a drive.

### 5.2 Eligibility
1. See the list and count of eligible students before publishing.
2. Students see why they are or aren't eligible.
3. Add specific exceptions with a reason (logged).
4. Export the eligible list.

### 5.3 Applications
1. See all applicants with their profile summary and resume.
2. Shortlist, hold, or reject applicants.
3. Send a reminder to eligible students who haven't applied.
4. Export applicants.

### 5.4 Rounds and results
1. Mark each applicant per round: attended, absent, cleared, rejected.
2. Bulk update results by selecting many students or uploading a list.
3. Record scores and remarks per student per round.
4. Move cleared students to the next round automatically.
5. Share a shortlist with the company.
6. Every status change is stored in a timeline per student per drive.

### 5.5 Offers
1. Create an offer for a student: role, package, offer letter.
2. Track status: offered, accepted, declined, revoked.
3. Enforce college rules, such as one offer per student or tier-based rules.
4. Placed students are updated automatically when an offer is accepted.
5. Track joining: offer accepted vs actually joined, with joining date.
6. Track internship-to-job conversion (PPO).
7. Generate or store offer letters per company.

### 5.6 Approval workflows
1. Optional sign-off steps set by the college, for example: offers, bulk emails, bulk status changes, and eligibility exceptions.
2. A request goes to the approver (for example, the TPO admin) and nothing is sent or applied until it is approved.
3. The approver can approve, reject, or send back with a comment.
4. Full history of requests, approvers, and decisions.
5. The college chooses which actions need approval; the default is off for small colleges.

### 5.7 Job alerts
1. Share openings that are not formal campus drives, such as off-campus jobs and internships.
2. Target by department, batch, or skill match.
3. Track views and clicks.

---

## 6. Drive Day: Attendance `Attendance & Blocking module`

### 6.1 Check-in
1. Mark attendance per drive and per round.
2. Search by name or enrollment number and mark manually.
3. Show a QR or short code that students scan or enter to check themselves in.
4. Live counts: attended, absent, not yet marked.
5. Closing a round marks everyone unmarked as absent.

### 6.2 Day-of scheduling
1. Interview panels, rooms, and time slots.
2. Live status of who is in interview, who is next.
3. Reschedule a student with notification.

---

## 7. Blocking `Attendance & Blocking module`
1. Define college policies, for example:
   - block after N missed drives for D days
   - maximum number of offers per student
   - placed students blocked from lower-tier drives
2. Policies are applied automatically on a schedule.
3. Add a manual block with a reason and end date.
4. Lift a block with a required reason; the override is logged.
5. Students are told when and why they are blocked.
6. List of all active blocks with filters.

---

## 8. Analytics and Reports `Analytics module`

### 8.1 Placement overview
1. Placed vs total by department, batch, and program.
2. Package statistics: highest, average, median.
3. Companies visited and offers made.

### 8.2 Drive analytics
1. Funnel for each drive: eligible, applied, attended, per round, offers.
2. Attended vs not attended, with the list of absentees.
3. Round-wise pass and rejection counts.

### 8.3 Elimination analysis
1. Which round students most often stop at.
2. Drop-off by department and batch.
3. Students who repeatedly fail the same round type.
4. Click from any chart into the list of students behind it.

### 8.4 Reports and exports
1. Export any table to Excel.
2. Placement report in PDF for management.
3. NAAC/NIRF-style placement data format.
4. Scheduled reports by email.

---

## 9. Communication `Core`
1. In-app notifications for staff (new submissions, offer responses).
2. Email to selected students or groups: invites, reminders, drive announcements.
3. Announcements visible on the student dashboard.
4. Push notifications to installed app users.
5. History of messages sent and to whom.
6. SMS and WhatsApp notifications for drive alerts, reminders, and deadlines.
7. Message templates that staff can reuse and edit.
8. Student preference settings: which channels they accept.

### 9.1 Student support requests
1. Students raise requests such as "my marks are wrong" or "I can't apply".
2. The officer sees a ticket list with status, assignee, and age.
3. Reply, resolve, or reassign to a department coordinator.
4. A correction request on verified data goes straight into the verification queue.

---

## 10. Settings and Access `Core`
1. Departments: create, edit, deactivate.
2. Staff members: invite by email, assign role and department, deactivate.
3. Roles: TPO admin (everything), placement officer, department coordinator (own department only).
4. College profile: name, logo, brand colour.
5. Academic years and batches.
6. Required profile sections and verification rules.
7. Audit log: who changed what and when, searchable.
8. Multiple campuses or programs under one college, each with its own officers and data scope.
9. Export all of the college's own data and request a backup.
10. Single sign-on and multi-factor login for staff.
11. Integrations with the college ERP, for example student records sync.
12. Data retention settings, including deletion of old student data.

---

## 11. Add-on Modules
| Module | What the officer gets |
|---|---|
| Assessments builder | Question banks, custom papers, scheduling, proctoring, results; year-round assessments with a baseline diagnostic test and score distribution by cohort |
| Employer CRM | Outreach pipeline: prospect, in conversation, drive scheduled; follow-up reminders |
| Student preparation | AI mock interviews, resources, counselling bookings, moderated interview experiences |
| Internships | Allotment, work logs, evaluations |
| Events & fairs | Virtual career fairs, hackathons, coding contests, case challenges, workshops |
| Learning programmes | Groups of students by preparation goal, reusable learning journeys, courses run in-house or with training partners |
| Recruiter portal | Companies log in to see their drive, shortlists, and schedule; post jobs; give feedback |
| Talent showcase | Resumes in the college format, shareable profile links for employers |

---

## 12. Rules that apply across all features
1. A college only sees modules it has bought; others are hidden.
2. Every change to student data, offers, and blocks is logged.
3. Student data is visible only within the college.
4. Personality data is separate from academic data and is never used for eligibility or blocking.
5. Anything a student can't do themselves (apply, change verified data) is enforced by the system, not just hidden in the interface.
6. Works on mobile as an installable app (PWA).
7. Actions the college has marked as "needs approval" never take effect until approved.
8. Opted-out students never appear in eligibility lists or in unplaced counts.

---

## 13. Out of scope for the placement officer app
1. Student-facing screens (separate spec).
2. College billing and module management (super-admin console).
3. Recruiter portal (covered as an add-on module in section 11).
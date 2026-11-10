#!/usr/bin/env python3
"""Renders claude/full-application-test-plan.md and .csv from build_test_plan.py."""
import os, re, csv, collections, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_test_plan as B
ROOT = B.ROOT
items, cases = B.main()
E, P, M, H, F, U, PR = B.E, B.P, B.M, B.H, B.F, B.U, B.PR
def esc(s): return str(s).replace('|', '\\|').replace('\n', '<br>')

ORDER = ['M%02d' % n for n in range(1, 22)] + ['SA'] + [k for _, k in B.ROLEP if k != 'SA'] + ['ROLE-GEN'] + ['SRS-STRUCT', 'SRS-UI', 'SRS-DATA', 'SRS-AI', 'SRS-NFR', 'SRS-SECURITY', 'SRS-INT', 'SRS-REPORT', 'SRS-FLOW', 'SRS-REL', 'SRS-ACCEPT', 'SRS-DELIV', 'SRS-PROC', 'SRS-PRINC', 'SRS-VISION', 'SRS-OBJ', 'SRS-DEF']
TITLE = {'SA': 'System Administrator / Super Administrator (SRS 3.1, section 6 Super Admin Portal, approved decisions)', 'ROLE-PRN': 'Roles: Institution Administrator / Principal / Director (SRS 3.2)', 'ROLE-TPO': 'Roles: Head TPO (SRS 3.3)', 'ROLE-PO': 'Roles: Placement Officer (SRS 3.4)', 'ROLE-HOD': 'Roles: HOD / Department Coordinator (SRS 3.5)', 'ROLE-FAC': 'Roles: Faculty / Mentor (SRS 3.6)', 'ROLE-TRN': 'Roles: Training Coordinator / Trainer (SRS 3.7)', 'ROLE-STU': 'Roles: Student (SRS 3.8)', 'ROLE-EMP': 'Roles: Employer / Company Administrator (SRS 3.9)', 'ROLE-INT': 'Roles: Interviewer (SRS 3.10)', 'ROLE-ALM': 'Roles: Alumni / Industry Mentor (SRS 3.11)', 'ROLE-PERM': 'Roles: Permission principle (SRS 3) and role matrices', 'ROLE-GEN': 'Roles: general', 'SRS-STRUCT': 'SRS section 4 Application structure', 'SRS-UI': 'SRS section 6 Key screens', 'SRS-DATA': 'SRS section 7 Core database entities', 'SRS-AI': 'SRS section 8 AI requirements', 'SRS-NFR': 'SRS section 9 Non-functional (performance, scalability, usability, reliability)', 'SRS-SECURITY': 'SRS section 9 Security and privacy, section 14 (security suite)', 'SRS-INT': 'SRS section 10 Integrations', 'SRS-REPORT': 'SRS section 11 Reports and exports', 'SRS-FLOW': 'SRS section 12 End-to-end workflow, and your Phase 5 workflows', 'SRS-REL': 'SRS section 13 Release plan', 'SRS-ACCEPT': 'SRS section 14 Acceptance testing and QA', 'SRS-DELIV': 'SRS section 15 Deliverables', 'SRS-PROC': 'SRS section 16 Responsibilities', 'SRS-PRINC': 'SRS section 17 Design principles', 'SRS-VISION': 'SRS section 1 Project overview', 'SRS-OBJ': 'SRS section 2 Product objectives', 'SRS-DEF': 'SRS section 18 Final product definition'}
for n in range(1, 22): TITLE['M%02d' % n] = 'Module %d: %s' % (n, B.MODS[n])
for c in cases: c['group'] = c['prefix']
by = collections.defaultdict(list)
for c in cases: by[c['group']].append(c)
def counts(cs): return collections.Counter(c['impl'] for c in cs)

# CSV
cols = ['id', 'module', 'feature', 'requirement', 'type', 'priority', 'pre', 'steps', 'data', 'expected', 'actual', 'status', 'evidence', 'impl', 'note', 'gate3', 'origin', 'src']
hdr = ['Test Case ID', 'Module', 'Feature', 'Requirement', 'Test Type', 'Priority', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Actual Result', 'Status', 'Evidence', 'Implementation status (Gate 1 audit)', 'Audit note', 'Gate 3 expectation', 'Origin', 'SRS line']
with open(os.path.join(ROOT, 'full-application-test-plan.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(hdr)
    for g in ORDER:
        for c in by.get(g, []): w.writerow([str(c[k]).replace('<br>', '\n') for k in cols])
assert sum(len(v) for v in by.values()) == len(cases) == sum(len(by.get(g, [])) for g in ORDER), 'a case is missing from the ordering'

L = []
w = L.append
srs_n = len(items); extra = len(cases) - srs_n
w('# Full application test plan (Gate 2)\n')
w('Date: 2026-11-10. Status: **test inventory only. Every case below is `Not Run`.** Nothing has been executed in this gate, and no application code was changed.\n')
w('Companion files: `full-application-test-plan.csv` (same rows, for filtering), `tools/build_test_plan.py` and `tools/render_test_plan.py` (regenerate both files from the SRS and fail if any SRS line has no test case).\n')
w('## 1. How to read this plan\n')
w('- **Source of truth:** the SRS `.docx`. Every requirement line in it (bullets, statements and arrow chains, 1,223 lines) was extracted by script and given at least one test case. The Requirement column quotes the SRS wording exactly and says where it is.')
w('- **Extra cases** (%d) were added for things the SRS requires in general but does not list line by line: the System Administrator workstream you approved, your security, performance and workflow lists, role and route matrices, and one cross-institution and one unauthorised-access case per module.' % extra)
w('- **Implementation status** separates what exists from what does not, as found in the Gate 1 audit: `Existing` (present in code, never executed in this cycle), `Partial`, `Missing`, `On hold` (your decision), `Future scope` (your decision or the SRS marks it future), `Unverified` (not inspected in depth or never measured), `Process` (an organisational responsibility, checked by document review). **Existing does not mean tested or passing.**')
w('- **Steps are generated per kind of requirement** (create, view, edit, assign, approve, export, calculate, AI, security, database, document, workflow). They are exact enough to run but use placeholders for data; each is made fully data-specific when it is automated in Gate 3. Curated cases (System Administrator, security, performance, workflows, matrices) are hand-written.')
w('- **Gate 3 expectation** says what I expect to happen when the case is run, so a failure on a Missing feature is not a surprise. A case for a Missing feature is expected to fail until the feature is built in Gate 4.')
w('- **Test types** are Unit, Integration, API, E2E, Security, Performance, Accessibility, Database inspection, Document review. **Status** is one of Pass, Fail, Blocked, Not Run; all are Not Run.')
w('- **IDs:** `M01`-`M21` modules; `SA` System Administrator; `ROLE-*` roles; `SRS-STRUCT`, `-UI`, `-DATA`, `-AI`, `-NFR`, `-SECURITY`, `-INT`, `-REPORT`, `-FLOW`, `-REL`, `-ACCEPT`, `-DELIV`, `-PROC`, `-PRINC`, `-VISION`, `-OBJ`, `-DEF` for the other SRS sections.\n')

w('## 2. Totals\n')
w('| Measure | Count |\n|---|---|')
w('| SRS requirement lines extracted | %d |' % srs_n)
w('| Test cases generated from SRS lines | %d |' % srs_n)
w('| Additional curated test cases | %d |' % extra)
w('| **Total test cases** | **%d** |' % len(cases))
w('| SRS lines with no test case | 0 (checked by the script) |')
w('| Cases with status Not Run | %d (all) |' % len(cases))
c_all = counts([c for c in cases if c['origin'] == 'SRS line'])
w('\nImplementation status of the %d SRS-line cases (from the Gate 1 audit, not from tests):\n' % srs_n)
w('| Existing | Partial | Missing | On hold | Future scope | Unverified | Process |\n|---|---|---|---|---|---|---|')
w('| %d | %d | %d | %d | %d | %d | %d |' % tuple(c_all[k] for k in (E, P, M, H, F, U, PR)))
pri = collections.Counter(c['priority'] for c in cases)
w('\nPriority of all cases: Critical %d, High %d, Medium %d, Low %d.\n' % (pri['Critical'], pri['High'], pri['Medium'], pri['Low']))

w('## 3. Coverage by module and section\n')
w('| Group | SRS lines | Cases from SRS lines | Curated cases | Total cases | Existing | Partial | Missing | On hold | Future | Unverified | Process |\n|---|---|---|---|---|---|---|---|---|---|---|---|')
tot = [0] * 11
for g in ORDER:
    cs = by.get(g, []); s = [c for c in cs if c['origin'] == 'SRS line']; x = counts(cs)
    row = [len(s), len(s), len(cs) - len(s), len(cs), x[E], x[P], x[M], x[H], x[F], x[U], x[PR]]
    tot = [a + b for a, b in zip(tot, row)]
    w('| %s | %s |' % (g + ' ' + TITLE[g].split(':', 1)[-1].strip()[:46], ' | '.join(map(str, row))))
w('| **Total** | %s |' % ' | '.join('**%d**' % t for t in tot))
w('\nThe Existing/Partial/... columns count all cases of the group including curated ones, so they can exceed the SRS-line column.\n')

# SA
sa = by['SA']
w('## 4. System Administrator coverage\n')
w('Scope follows your Gate 2 decisions: institution search, editing, activation and suspension, platform-wide analytics, platform audit-log viewer, real monitoring, protected AI provider and model configuration with masked secrets, platform-level support. Subscriptions and billing are documented as future scope. Platform administrator creation stays script-based; the cases below verify its security and MFA.\n')
w('**Cases:** %d (%d from SRS 3.1 lines, %d curated). Existing-feature cases %d, partial %d, missing or proposed %d, future scope %d.\n' % (len(sa), sum(1 for c in sa if c['origin'] == 'SRS line'), sum(1 for c in sa if c['origin'] != 'SRS line'), sum(1 for c in sa if c['impl'] == E), sum(1 for c in sa if c['impl'] == P), sum(1 for c in sa if c['impl'] == M), sum(1 for c in sa if c['impl'] == F)))
w('### 4.1 Platform APIs (every one has a functional case and is in the permission matrix case)\n')
def ref(rx): return ', '.join(c['id'] for c in sa if re.search(rx, c['feature'], re.I)) or '-'
api = [('GET /api/platform/me', 'Existing', 'Platform API: me|Permission matrix'), ('GET /api/platform/institutions', 'Existing', 'GET /api/platform/institutions|Permission matrix|never contain'), ('POST /api/platform/institutions', 'Existing', 'register|Duplicate institution|Registration validation|Registration rollback'), ('PATCH /api/platform/institutions/[id] (status)', 'Existing', 'Activate|Suspension|Reactivation|Suspended'), ('POST /api/platform/mfa/enroll', 'Existing', 'MFA setup|MFA verification'), ('POST /api/platform/mfa/verify', 'Existing', 'MFA verification|Platform administrator login'), ('DELETE /api/platform/mfa', 'Existing', 'MFA removal'),
       ('GET /api/platform/institutions?search&status&page (search, filter, sort, paging)', 'Proposed', 'search|filters'), ('GET /api/platform/institutions/[id] (detail, usage)', 'Proposed', 'detail view|usage view'), ('PATCH /api/platform/institutions/[id] (edit details and modules)', 'Proposed', 'editing|Duplicate institution warning'), ('GET /api/platform/analytics (+ date filters)', 'Proposed', 'analytics'), ('GET /api/platform/audit-logs', 'Proposed', 'audit-log viewer|Audit trails unified'), ('GET /api/platform/monitoring (health, jobs, errors)', 'Proposed', 'monitoring'), ('GET/PUT /api/platform/ai-config, usage', 'Proposed', 'AI configuration|AI usage'), ('GET/POST /api/platform/support/* (list, assign, notes, resolve)', 'Proposed', 'support')]
w('| API | Status | Test cases |\n|---|---|---|')
for a, st, rx in api: w('| `%s` | %s | %s |' % (a, st, ref(rx)))
w('\nScripts: `npm run db:platform-admin` and `npm run db:platform-mfa-recovery`: %s.\n' % ref('Account creation|MFA recovery'))
w('### 4.2 Pages\n')
w('| Page | Status | Test cases |\n|---|---|---|\n| `/platform` (one page: sign-in states, MFA, institutions, create, suspend) | Existing | %s |\n| Institution list with search and filters | Proposed | %s |\n| Institution detail and edit | Proposed | %s |\n| Analytics | Proposed | %s |\n| Audit-log viewer | Proposed | %s |\n| Monitoring | Proposed | %s |\n| AI configuration | Proposed | %s |\n| Support | Proposed | %s |' % (ref('Page /platform'), ref('search|filters'), ref('detail view|editing'), ref('analytics'), ref('audit-log viewer'), ref('monitoring'), ref('AI configuration'), ref('support')))
w('\n### 4.3 Permissions and institution isolation\n')
w('Permission matrix over eleven identities and every platform route: %s. Platform administrator cannot use college routes: %s. Isolation: %s. Public pages of a suspended institution (the showcase issue found in Gate 1): %s.\n' % (ref('Permission matrix'), ref('cannot use college'), ref('isolation|never contain'), ref('Suspended institution: public')))
w('### 4.4 Your twenty System Administrator scenarios\n')
sc = {}
for c in sa:
    for m in re.finditer(r'your scenarios? (\d+)(?: and (\d+))?', c['requirement']):
        for k in m.groups():
            if k: sc.setdefault(int(k), []).append(c['id'])
names = {1:'Platform administrator login',2:'Invalid login',3:'MFA verification',4:'Institution registration',5:'Duplicate institution registration',6:'Institution editing',7:'Institution activation',8:'Institution suspension',9:'Institution reactivation',10:'Platform analytics accuracy',11:'Institution-wise analytics',12:'Unauthorised institution access',13:'Unauthorised platform API access',14:'AI provider configuration',15:'Secret masking',16:'System health monitoring',17:'Scheduled job monitoring',18:'Support request management',19:'Audit log generation',20:'Logout and session expiry'}
sc[20] = sc.get(20, []) + [c['id'] for c in sa if 'session expiry and logout' in c['feature'].lower()]
sc[7] = sorted(set(sc.get(7, []) + [c['id'] for c in sa if c['feature'].startswith('Activate and deactivate')])); sc[8] = sorted(set(sc.get(8, []) + [c['id'] for c in sa if c['feature'].startswith('Activate and deactivate')]))
w('| # | Scenario | Test case(s) |\n|---|---|---|')
for k in range(1, 21): w('| %d | %s | %s |' % (k, names[k], ', '.join(sorted(set(sc.get(k, [])))) or '**none**'))
missing_sc = [k for k in range(1, 21) if not sc.get(k)]
assert not missing_sc, missing_sc

# roles
w('\n## 5. Additional roles (decision 3): exactly what the SRS requires\n')
w('The SRS asks for these functions and no more. Nothing beyond this list is planned. Permission scope for all three follows the SRS permission principle: "Users must only access information relevant to their assigned responsibilities" and "Temporary access for interviewers and external mentors".\n')
for g, name in (('ROLE-TRN', '3.7 Training Coordinator / Trainer'), ('ROLE-INT', '3.10 Interviewer'), ('ROLE-ALM', '3.11 Alumni / Industry Mentor')):
    w('### %s\n\n| Test case | SRS function | Today |\n|---|---|---|' % name)
    for c in by[g]: w('| %s | %s | %s: %s |' % (c['id'], re.search(r'"(.+?)" \(SRS', c['requirement']).group(1), c['impl'], esc(c['note'])))
    w('')
w('Not an SRS function: an Interviewer portal login mechanism, alumni profiles beyond "Create a professional profile", or trainer-specific reports beyond "Generate training reports". These stay out unless you approve them. The SRS section 4 lists an "Interviewer Portal" and a "Faculty / Trainer Portal" as interfaces (cases `SRS-STRUCT-TC-005` and `SRS-STRUCT-TC-008`).\n')

# reports
w('## 6. Reports (decision 4): the ten missing downloads and the rest\n')
w('A dashboard or an unrelated export does not count as the report. The SRS says only "downloadable reports in PDF, Excel and CSV where appropriate"; it does not say which format each report needs (see ambiguity A-10). Cases for the ten missing reports expect the format you decide; until then the test checks that a download exists and equals the database.\n')
w('| Case | Report | Today | Note |\n|---|---|---|---|')
for c in by['SRS-REPORT']:
    r = re.search(r'"(.+?)" \(SRS', c['requirement']).group(1)
    w('| %s | %s | %s | %s |' % (c['id'], r, c['impl'], esc(c['note'])))

# missing lists
w('\n## 7. Requirements that do not exist yet\n')
w('All SRS-line cases whose implementation status is not Existing. These cases are expected to fail or be blocked in Gate 3.\n')
for cls, title in ((M, 'Missing'), (P, 'Partial'), (H, 'On hold (your decision)'), (F, 'Future scope'), (U, 'Unverified (never inspected in depth or never measured)')):
    cs = [c for c in cases if c['origin'] == 'SRS line' and c['impl'] == cls]
    w('### %s (%d)\n\n| Case | Requirement | Note |\n|---|---|---|' % (title, len(cs)))
    for c in cs: w('| %s | %s | %s |' % (c['id'], esc(re.search(r'"(.+?)" \(SRS', c['requirement']).group(1)[:110] + ' (' + c['feature'].split(':')[0][:40] + ')'), esc(c['note'])))
    w('')
w('### Proposed implementation from your approved decisions (not single SRS lines)\n')
w('%d System Administrator cases are `Missing` because you approved building them: %s.\n' % (sum(1 for c in sa if c['origin'] != 'SRS line' and c['impl'] == M), ', '.join(c['id'] for c in sa if c['origin'] != 'SRS line' and c['impl'] == M)))

# ambiguities
w('## 8. Unresolved SRS ambiguities and audit assumptions\n')
w('### Your two questions, answered with citations\n')
w('**Module 19 (decision 5): no live multi-student collaboration room is required.** The SRS lists exactly, under "MODULE 19: GROUP DISCUSSION AND COMMUNICATION SIMULATOR": "AI-generated topics.", "Multiple AI participants.", "Voice-based discussions.", "Timed sessions.", "Debate simulation.", "Counterarguments.", "Presentation practice.", "Communication evaluation.", "Listening and response evaluation.", "Improvement recommendations." A search of the whole SRS text for "collaborat", "live room", "multi-student", "peer", "real-time" and "real time" finds no match. The words "Multiple AI participants" and the title "Simulator" describe AI-played participants. Conclusion: the current AI-participant design stays. Test cases M19-TC-001 to M19-TC-010 cover each listed item.\n')
w('**Approval gates for different drive types (decision 6): not in the SRS.** A search for "drive type", "type of drive", "off-campus", "pool" and "gate" finds nothing about approval by kind of drive. "Approval" appears only in these places: resource "Approval status." and the resource workflow "Review → Approve" (Module 7), internship "College approval." and "Company approval." (Module 9), resume "Student approval." (Module 10), "JD review and approval." and "No JD should be published without authorised review." (Module 11), "After JD approval and candidate matching" (Module 13), and "Resume approval." (section 7). **Audit assumption, not an SRS requirement:** a gate that depends on drive type. No test case is created for it.\n')
amb = [
 ('A-01', 'SRS 3.2', '"Institution Administrator / Principal / Director" is one role that can "Assign administrative permissions", yet the SRS also describes the Head TPO as the manager. The built Principal is read-only. Which of the two should assign administrative permissions?'),
 ('A-02', 'SRS 3.6, 3.7, section 4', '"Faculty / Mentor" and "Training Coordinator / Trainer" are separate roles in section 3 but one "Faculty / Trainer Portal" in section 4. Are they one portal with two roles?'),
 ('A-03', 'SRS 3 permission principle', '"Temporary access for interviewers and external mentors" does not say how access is granted (account, one-time link), for how long, or what the interviewer may see.'),
 ('A-04', 'SRS 13, 3.11', 'Release 5 (priority High) lists "Alumni mentorship." but there is no module section; the only detail is the seven functions in 3.11. Plan: build only those seven.'),
 ('A-05', 'SRS 1.1, 9 Security', '"Multi-factor authentication for privileged accounts": which accounts are privileged (all administrators, principal, interviewer)? Today: administrators and platform administrators.'),
 ('A-06', 'SRS 9 Performance', '"approximately 2–3 seconds under expected load": expected load (students, institutions, concurrent users) is not defined, so a pass or fail threshold cannot be set. Needs numbers from you.'),
 ('A-07', 'SRS 9 Privacy', '"Applicable Indian data protection compliance" is not defined. Only technical controls can be tested; legal compliance needs a separate review.'),
 ('A-08', 'SRS 10', '"College ERP / Student Information Systems" names no system or API. Cannot be tested without a target.'),
 ('A-09', 'SRS 6 TPO screens', '"Mock interview scheduling." and "Mock test scheduling.": time slots with a calendar, or a window with a last day? Today: windows and last days.'),
 ('A-10', 'SRS 11', 'Which export format each report needs is not stated ("PDF, Excel and CSV where appropriate"). Proposal for your approval: narrative reports in PDF and Word, tabular reports in PDF and Excel and CSV.'),
 ('A-11', 'SRS 7', '"Skill" and "Skill evidence" are listed as entities. Today they are derived from other records. Is a table required?'),
 ('A-12', 'SRS 8', '"Retain model and prompt versions for important evaluations": which evaluations are important (marks, interview and discussion evaluations, readiness, matching)?'),
 ('A-13', 'SRS 7.3', 'Resource assignment to "Specific JDs." and "Mock interviews.": a direct target, or through campaigns and tests?'),
 ('A-14', 'SRS 14, M15', '"Record responses with consent." and "Check audio/video permissions." imply recordings and video; section 15 says processing must be "transparent and consent-based". Is audio or video recording required, or is text transcription enough?'),
 ('A-15', 'SRS 13 Release 3', '"Coding assessment." with no detail: an execution environment, or answers marked by reading?'),
 ('A-16', 'SRS 13 Release 6', 'Items marked "Future enhancement" (predictive student support, advanced analytics, university-wide reporting, advanced employer integrations, multi-campus expansion): confirmed out of scope now? Cases exist and are marked Future scope.'),
 ('A-17', 'SRS 4', '"Public Website / Landing Page." has no content requirements.'),
 ('A-18', 'SRS 3.1 and 6', 'Super Administrator items not in your approved list: "Configure roles and permissions", "Manage platform-wide settings", "Manage integrations", "Configure data retention and security settings", and screens "Role management", "Integration management", "System configuration". What should each contain? Cases are written and marked Blocked on decision.'),
 ('A-19', 'Decision 1', 'Platform-level "support requests": how do requests reach the platform level (from college tickets, from administrators, from an outside form)? Needed before the support cases can be exact.'),
 ('A-20', 'SRS 3.9, 6', 'The recruiter portal is outside the earlier audit scope and has not been inspected in depth. Cases for employer functions are marked Unverified until it is.'),
]
w('### Other open questions\n\n| # | SRS reference | Question |\n|---|---|---|')
for a, b, c in amb: w('| %s | %s | %s |' % (a, b, esc(c)))

w('\n## 9. Existing, missing and proposed, separated\n')
w('- **Existing functionality** (class Existing, Partial): %d SRS-line cases. These are tested in Gate 3. "Partial" cases are expected to fail on the missing part, listed in section 7.' % (c_all[E] + c_all[P]))
w('- **Missing functionality required by the SRS** (class Missing): %d SRS-line cases, plus the Trainer, Interviewer and Alumni roles (%d cases) and the ten report downloads.' % (c_all[M], len(by['ROLE-TRN']) + len(by['ROLE-INT']) + len(by['ROLE-ALM'])))
w('- **Approved additions that are not single SRS lines:** the %d Missing System Administrator cases in section 7.' % sum(1 for c in sa if c['origin'] != 'SRS line' and c['impl'] == M))
w('- **On hold:** SMS, WhatsApp (and the SMS and WhatsApp integrations), mobile OTP and SSO: %d cases. **Future scope:** %d cases (subscriptions and billing, payment gateway, SRS Release 6).' % (c_all[H], c_all[F]))
w('- **Proposed improvements that are not in the SRS and not approved:** none are included in this inventory. Findings from Gate 1 that are defects rather than requirements (A-01 to A-07 there) are covered by security cases, not by new features.\n')

w('## 10. Test cases\n')
w('Columns: ID, Module, Feature, Requirement, Type, Priority, Preconditions, Steps, Test Data, Expected Result, Actual Result, Status, Evidence, Implementation status, Gate 3 expectation. (Audit note, Origin and SRS line number are in the CSV.)\n')
for g in ORDER:
    cs = by.get(g, [])
    if not cs: continue
    w('### %s\n' % TITLE[g]); w('| ID | Module | Feature | Requirement | Type | Priority | Preconditions | Steps | Test Data | Expected Result | Actual | Status | Evidence | Implementation | Gate 3 expectation |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for c in cs: w('| %s |' % ' | '.join(esc(c[k]) for k in ('id', 'module', 'feature', 'requirement', 'type', 'priority', 'pre', 'steps', 'data', 'expected', 'actual', 'status', 'evidence')) + ' %s | %s |' % (esc(c['impl'] + (': ' + c['note'] if c['note'] else '')), esc(c['gate3'])))
    w('')
open(os.path.join(ROOT, 'full-application-test-plan.md'), 'w').write('\n'.join(L) + '\n')
print('cases', len(cases), 'srs', srs_n, 'md bytes', os.path.getsize(os.path.join(ROOT, 'full-application-test-plan.md')))

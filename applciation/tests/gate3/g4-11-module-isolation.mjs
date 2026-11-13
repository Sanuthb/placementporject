// Gate 4 WP-02: cross-institution isolation for the 12 modules that had no seeded records when Gate 3 ran (M06, M07, M08, M09, M10, M11, M12, M13, M14, M15, M16, M17, M19, M21).
// Method (FX-01): two institutions, A and B, each fully provisioned (every module on, an administrator, students) and each holding its OWN record in every module.
// For every probed URL there is a POSITIVE CONTROL: the owner must get 200 (otherwise the probe is invalid and the assertion fails, so a 404 can never be mistaken for isolation).
// Then B asks for A's record (and A for B's): the answer must be a refusal (403/404, never 2xx or 5xx), must contain nothing of the other institution (marker text or any record id), and for
// PATCH and DELETE the stored row must be unchanged afterwards. Aggregates (dashboards) are compared with independent SQL for each institution.
// Local Docker stack only; synthetic data; a local PRODUCTION server on :3125.
import { recorder } from "./rec.mjs";
import { connect, mkInstitution, cleanupInstitutions, startProd, portFree, waitUp, caller } from "./lib/isolationFixtures.mjs";

const R = recorder("g4-11-module-isolation");
const tag = Date.now().toString().slice(-6), pw = `Iso-${tag}-Pw1!`;
const env = await connect(); const { ins, rows, n1 } = env;
const made = { colleges: [], auth: [] };
if (!(await portFree(3125))) { console.error("port 3125 is busy"); process.exit(2); }
const srv = startProd(3125);

async function seedModules(inst) {
  const L = inst.label, col = inst.college, adm = inst.admin.id, s1 = inst.students.s1.id, M = `ISO-${L}-${tag}`, now = Date.now(), day = 86_400_000;
  const o = { marker: M };
  // M06 learning
  o.course = await ins("Course", { collegeId: col, title: `${M} Course`, createdById: adm, status: "PUBLISHED" });
  const mod = await ins("CourseModule", { courseId: o.course, title: `${M} Module` });
  o.lesson = await ins("CourseLesson", { courseId: o.course, moduleId: mod, collegeId: col, type: "TEXT", title: `${M} Lesson` });
  await ins("CourseEnrolment", { courseId: o.course, studentId: s1, collegeId: col });
  o.programme = await ins("LearningProgramme", { collegeId: col, title: `${M} Programme`, goal: `${M} goal`, createdById: adm });
  // M07 resources
  o.resource = await ins("PrepResource", { collegeId: col, title: `${M} Resource`, category: "INTERVIEW", status: "APPROVED", visibility: "ALL_STUDENTS" });
  // M08 projects
  o.project = await ins("Project", { collegeId: col, title: `${M} Project`, problemStatement: `${M} problem` });
  o.team = await ins("ProjectTeam", { projectId: o.project, collegeId: col, name: `${M} Team`, leaderId: s1 });
  // M09 internships
  o.internship = await ins("Internship", { collegeId: col, studentId: s1, companyName: `${M} Internship Co`, role: "Intern", startDate: new Date(now - 7 * day), endDate: new Date(now + 60 * day), createdById: adm });
  o.posting = await ins("InternshipPosting", { collegeId: col, companyName: `${M} Posting Co`, title: `${M} Posting`, startDate: new Date(now + 30 * day), endDate: new Date(now + 90 * day), applicationDeadline: new Date(now + 20 * day), createdById: adm });
  // M10 resume
  o.resume = await ins("ResumeVersion", { collegeId: col, studentId: s1, number: 1, title: `${M} Resume` });
  // M12, M13, M17 job description, campaign
  o.jd = await ins("JobDescription", { collegeId: col, source: "MANUAL", title: `${M} JD`, companyName: `${M} JD Co`, data: { title: `${M} JD`, company: `${M} JD Co`, description: `${M} description`, jobType: "FULL_TIME", location: null, salaryMinLpa: null, salaryMaxLpa: null, experienceText: null, requirements: [], eligibility: { minCgpa: null, minTenthPct: null, minTwelfthPct: null, maxActiveBacklogs: null, departmentIds: [], programIds: [], batchIds: [], allowPlaced: true, branchesAsStated: [] }, selectionProcess: [], other: null }, createdById: adm, status: "APPROVED" });
  o.campaign = await ins("PrepCampaign", { collegeId: col, jdId: o.jd, name: `${M} Campaign`, company: `${M} Campaign Co`, jobRole: "SDE", ownerId: adm, startsAt: new Date(now - day), deadline: new Date(now + 30 * day), status: "ACTIVE" });
  o.member = await ins("CampaignMember", { campaignId: o.campaign, studentId: s1, status: "ACCEPTED" });
  // M14 tests
  o.paper = await ins("AssessmentPaper", { collegeId: col, title: `${M} Paper`, durationMin: 30, questions: [], proctoring: {}, createdById: adm });
  o.schedule = await ins("AssessmentSchedule", { collegeId: col, paperId: o.paper, title: `${M} Schedule`, startsAt: new Date(now - day), endsAt: new Date(now + 30 * day), createdById: adm });
  o.attempt = await ins("AssessmentAttempt", { scheduleId: o.schedule, studentId: s1, deadlineAt: new Date(now + day), status: "SUBMITTED", score: 7, maxScore: 10, submittedAt: new Date() });
  // M15 interviews
  o.intAssign = await ins("InterviewAssignment", { collegeId: col, title: `${M} Interview assignment`, type: "MOCK", mode: "TEXT", role: "SDE", topic: `${M} topic`, createdById: adm });
  o.interview = await ins("MockInterview", { collegeId: col, studentId: s1, role: "SDE", topic: `${M} interview topic`, assignmentId: o.intAssign });
  // M16 reports
  o.reportSchedule = await ins("ReportSchedule", { collegeId: col, type: "PLACEMENT_SUMMARY", frequency: "WEEKLY", recipients: [`${M.toLowerCase()}@example.com`], nextRunAt: new Date(now + 7 * day), createdById: adm });
  // M17 readiness
  o.readiness = await ins("ReadinessSnapshot", { collegeId: col, studentId: s1, kind: "STUDENT", scopeKey: "overall", day: new Date(), score: 70, coverage: 80, components: {} });
  // M19 discussions
  o.discAssign = await ins("DiscussionAssignment", { collegeId: col, title: `${M} Discussion assignment`, kind: "GD", topic: `${M} topic`, createdById: adm });
  o.discussion = await ins("DiscussionSession", { collegeId: col, studentId: s1, kind: "GD", topic: `${M} discussion topic`, participants: [], assignmentId: o.discAssign });
  // M21 dashboards and analytics
  const company = await ins("Company", { collegeId: col, name: `${M} Company` });
  o.drive = await ins("Drive", { collegeId: col, companyId: company, role: `${M} Drive role`, jobType: "FULL_TIME", applicationDeadline: new Date(now + 10 * day), driveDate: new Date(now + 20 * day), createdById: adm });
  return o;
}

try {
  const A = await mkInstitution(env, "a", tag, pw, made), B = await mkInstitution(env, "b", tag, pw, made);
  // institution A also has two more students, so the two institutions have different totals (an aggregate that leaks would show it)
  for (const x of ["s4", "s5"]) { const aid = await env.mkAuth(`iso${x}a${tag}@example.com`, pw); made.auth.push(aid); await ins("Student", { collegeId: A.college, enrollmentNo: `ISOA${tag}${x}`, name: `ISO-A-${tag} Student ${x}`, email: `iso${x}a${tag}@example.com`, departmentId: A.d1, batchId: A.batch, userId: aid, inviteStatus: "ACTIVATED" }); }
  const oA = await seedModules(A), oB = await seedModules(B);
  // a second drive for A only
  const coA2 = await ins("Company", { collegeId: A.college, name: `ISO-A-${tag} Company 2` }); await ins("Drive", { collegeId: A.college, companyId: coA2, role: "Second", jobType: "FULL_TIME", applicationDeadline: new Date(Date.now() + 5 * 864e5), driveDate: new Date(Date.now() + 9 * 864e5), createdById: A.admin.id });
  const ok = await waitUp(srv.base); R.t(["M06-TC-028"], "the production server under test starts (fixtures for institutions A and B are in place)", ok, "");
  const tok = { aAdmin: await A.tokenOf(A.admin), bAdmin: await B.tokenOf(B.admin), aStu: await A.tokenOf(A.students.s1), bStu: await B.tokenOf(B.students.s1) };
  const who = { A: { staff: caller(srv.base, tok.aAdmin), student: caller(srv.base, tok.aStu) }, B: { staff: caller(srv.base, tok.bAdmin), student: caller(srv.base, tok.bStu) } };
  const allIds = (o, inst) => [...Object.entries(o).filter(([k]) => k !== "marker").map(([, v]) => v), ...Object.values(inst.students).map((s) => s.id), inst.college, inst.admin.id];
  const idsA = allIds(oA, A), idsB = allIds(oB, B);
  const leaksIn = (text, otherMarker, otherIds) => (text.includes(otherMarker) ? [otherMarker] : []).concat(otherIds.filter((i) => text.includes(i)));
  const snap = async (c) => (c ? (await rows(`select * from "${c.table}" where id=$1`, [c.id]))[0] : null);

  // [kind, method, path builder, optional write check { table, col }]
  const U = (k, p) => ({ k, m: "GET", p });
  const specs = [
    ["M06-TC-028", "learning (courses, lessons, enrolments, programmes)", [U("staff", (o) => `/api/courses/${o.course}`), U("staff", (o) => `/api/courses/${o.course}/enrolments`), U("staff", (o) => `/api/courses/${o.course}/analytics`), U("staff", (o) => `/api/learning/programmes/${o.programme}`), U("student", (o) => `/api/student/courses/${o.course}`)],
      [{ m: "PATCH", p: (o) => `/api/courses/${o.course}`, body: { title: "HACKED" }, table: "Course", id: (o) => o.course, col: "title" }, { m: "DELETE", p: (o) => `/api/courses/${o.course}`, table: "Course", id: (o) => o.course }, { m: "PATCH", p: (o) => `/api/learning/programmes/${o.programme}`, body: { title: "HACKED" }, table: "LearningProgramme", id: (o) => o.programme, col: "title" }]],
    ["M07-TC-048", "resources", [U("staff", (o) => `/api/resources/${o.resource}`), U("student", (o) => `/api/student/resources/${o.resource}`)],
      [{ m: "PATCH", p: (o) => `/api/resources/${o.resource}`, body: { title: "HACKED" }, table: "PrepResource", id: (o) => o.resource, col: "title" }, { m: "DELETE", p: (o) => `/api/resources/${o.resource}`, table: "PrepResource", id: (o) => o.resource }]],
    ["M09-TC-017", "internships and postings", [U("staff", (o) => `/api/internships/${o.internship}`), U("staff", (o) => `/api/internship-postings/${o.posting}`), U("staff", (o) => `/api/internship-postings/${o.posting}/applications`), U("student", (o) => `/api/student/internships/${o.internship}`)],
      [{ m: "PATCH", p: (o) => `/api/internship-postings/${o.posting}`, body: { title: "HACKED" }, table: "InternshipPosting", id: (o) => o.posting, col: "title" }, { m: "DELETE", p: (o) => `/api/internship-postings/${o.posting}`, table: "InternshipPosting", id: (o) => o.posting }]],
    ["M10-TC-026", "resume engine", [U("staff", (o, inst) => `/api/students/${inst.students.s1.id}/resumes`), U("staff", (o, inst) => `/api/students/${inst.students.s1.id}/resume`), U("student", (o) => `/api/student/resumes/${o.resume}`)],
      [{ m: "PATCH", p: (o) => `/api/student/resumes/${o.resume}`, body: { title: "HACKED" }, table: "ResumeVersion", id: (o) => o.resume, col: "title", kind: "student" }, { m: "DELETE", p: (o) => `/api/student/resumes/${o.resume}`, table: "ResumeVersion", id: (o) => o.resume, kind: "student" }]],
    ["M08-TC-019", "projects and teams", [U("staff", (o) => `/api/projects/${o.project}`), U("staff", (o) => `/api/projects/${o.project}/teams`), U("staff", (o) => `/api/projects/${o.project}/teams/${o.team}`)],
      [{ m: "PATCH", p: (o) => `/api/projects/${o.project}`, body: { title: "HACKED" }, table: "Project", id: (o) => o.project, col: "title" }, { m: "PATCH", p: (o) => `/api/projects/${o.project}/teams/${o.team}`, body: { name: "HACKED" }, table: "ProjectTeam", id: (o) => o.team, col: "name" }]],
    ["M11-TC-031", "job descriptions", [U("staff", (o) => `/api/jds/${o.jd}`), U("staff", (o) => `/api/jds/${o.jd}/shortlist`)],
      [{ m: "PATCH", p: (o) => `/api/jds/${o.jd}`, body: { title: "HACKED" }, table: "JobDescription", id: (o) => o.jd, col: "title" }, { m: "DELETE", p: (o) => `/api/jds/${o.jd}`, table: "JobDescription", id: (o) => o.jd }]],
    ["M12-TC-020", "candidate matching", [U("staff", (o) => `/api/jds/${o.jd}/matches`), U("staff", (o, inst) => `/api/jds/${o.jd}/matches/${inst.students.s1.id}`), U("staff", (o) => `/api/jds/${o.jd}`)],
      [{ m: "PATCH", p: (o) => `/api/jds/${o.jd}`, body: { title: "HACKED" }, table: "JobDescription", id: (o) => o.jd, col: "title" }, { m: "DELETE", p: (o) => `/api/jds/${o.jd}`, table: "JobDescription", id: (o) => o.jd }]],
    ["M13-TC-064", "preparation campaigns", [U("staff", (o) => `/api/campaigns/${o.campaign}`), U("staff", (o) => `/api/campaigns/${o.campaign}/candidates`), U("staff", (o) => `/api/campaigns/${o.campaign}/events`), U("student", (o) => `/api/student/campaigns/${o.campaign}`)],
      [{ m: "PATCH", p: (o) => `/api/campaigns/${o.campaign}`, body: { name: "HACKED" }, table: "PrepCampaign", id: (o) => o.campaign, col: "name" }, { m: "DELETE", p: (o) => `/api/campaigns/${o.campaign}`, table: "PrepCampaign", id: (o) => o.campaign }]],
    ["M14-TC-050", "mock tests (papers, schedules, attempts)", [U("staff", (o) => `/api/assessments/papers/${o.paper}`), U("staff", (o) => `/api/assessments/schedules/${o.schedule}/results`), U("student", (o) => `/api/student/assessments/${o.schedule}/result`)],
      [{ m: "PATCH", p: (o) => `/api/assessments/papers/${o.paper}`, body: { title: "HACKED" }, table: "AssessmentPaper", id: (o) => o.paper, col: "title" }]],
    ["M15-TC-038", "mock interviews", [U("staff", (o) => `/api/interviews/${o.interview}`), U("staff", (o) => `/api/interviews/assignments/${o.intAssign}`), U("student", (o) => `/api/student/prep/mock-interviews/${o.interview}`), U("student", (o) => `/api/student/reports/interview/${o.interview}`)], []],
    ["M16-TC-029", "reports", [U("staff", (o, inst) => `/api/reports/documents/student/${inst.students.s1.id}`), U("staff", (o) => `/api/reports/documents/interview/${o.interview}`), U("staff", (o) => `/api/reports/documents/discussion/${o.discussion}`), U("staff", (o) => `/api/reports/documents/test/${o.attempt}`)],
      [{ m: "PATCH", p: (o) => `/api/reports/schedules/${o.reportSchedule}`, body: { isActive: false }, table: "ReportSchedule", id: (o) => o.reportSchedule, col: "isActive" }, { m: "DELETE", p: (o) => `/api/reports/schedules/${o.reportSchedule}`, table: "ReportSchedule", id: (o) => o.reportSchedule }]],
    ["M17-TC-013", "job readiness", [U("staff", (o, inst) => `/api/students/${inst.students.s1.id}/readiness`), U("staff", (o) => `/api/jds/${o.jd}/readiness`), U("student", (o) => `/api/student/readiness/jobs/${o.jd}`)], []],
    ["M19-TC-011", "group discussions", [U("staff", (o) => `/api/discussions/${o.discussion}`), U("staff", (o) => `/api/discussions/assignments/${o.discAssign}`), U("student", (o) => `/api/student/discussions/${o.discussion}`)], []],
  ];

  const summary = {};
  for (const [caseId, label, urls, writes] of specs) {
    const invalid = [], leaks = [], refusedWrong = [], n = { reads: 0, writes: 0 };
    for (const u of urls) {
      const pA = u.p(oA, A), pB = u.p(oB, B);
      const cA = await who.A[u.k](u.m, pA), cB = await who.B[u.k](u.m, pB);
      if (cA.s !== 200 || cB.s !== 200) { invalid.push(`${pA}: owner A ${cA.s} ${cA.text.slice(0, 110)} | owner B ${cB.s}`); continue; }
      const xB = await who.B[u.k](u.m, pA), xA = await who.A[u.k](u.m, pB); n.reads += 2;
      for (const [r, who2, otherMark, otherIds] of [[xB, "B asking for A", oA.marker, idsA], [xA, "A asking for B", oB.marker, idsB]]) {
        if (![403, 404].includes(r.s)) refusedWrong.push(`${who2} ${u.m} ${u.p === undefined ? "" : (who2.startsWith("B") ? pA : pB)} -> ${r.s}`);
        const lk = leaksIn(r.text, otherMark, otherIds); if (lk.length) leaks.push(`${who2}: ${lk.join(",")}`);
      }
    }
    for (const w of writes) {
      const kind = w.kind ?? "staff", pA = w.p(oA, A), idA = w.id(oA);
      const before = await snap({ table: w.table, id: idA }), r = await who.B[kind](w.m, pA, w.body); n.writes++;
      const after = await snap({ table: w.table, id: idA });
      if (r.s >= 200 && r.s < 300) refusedWrong.push(`B ${w.m} ${pA} -> ${r.s}`);
      if (r.s >= 500) refusedWrong.push(`B ${w.m} ${pA} -> ${r.s} (server error)`);
      if (JSON.stringify(before) !== JSON.stringify(after)) leaks.push(`row changed by B ${w.m} ${pA}`);
      if (w.m === "DELETE" && !after) leaks.push(`row deleted by B ${pA}`);
    }
    summary[caseId] = { invalid, leaks, refusedWrong, n };
    R.t([caseId], `CROSS-INSTITUTION (${label}): ${urls.length} URLs, each with a positive control for the owner, then the other institution asks for the record in both directions (${n.reads} reads) and attempts ${writes.length} write(s): every answer is a 403/404, nothing of the other institution is in any response, and no stored row changed or vanished`,
      invalid.length === 0 && leaks.length === 0 && refusedWrong.length === 0 && n.reads > 0, JSON.stringify({ invalidProbes: invalid, leaks, notRefused: refusedWrong }).slice(0, 380));
  }

  // DETECTOR SELF-TEST: the same leak and refusal checks, pointed at the OWNER's own 200 answer, must report a leak (so a real leak could not pass unnoticed)
  const own = await who.A.staff("GET", `/api/courses/${oA.course}`);
  R.t(["M06-TC-028"], "DETECTOR SELF-TEST: pointed at the owner's own answer the checks DO report a leak (the other institution's marker/ids are searched in the text, and a 200 is not a refusal), so a real leak would be caught", own.s === 200 && leaksIn(own.text, oA.marker, idsA).length > 0 && ![403, 404].includes(own.s), `status ${own.s}`);
  // M21 dashboards and analytics: independent SQL per institution
  const sqlCounts = async (inst) => ({ students: await n1(`select count(*)::int n from "Student" where "collegeId"=$1 and "isActive" and not "isArchived"`, [inst.college]), drives: await n1(`select count(*)::int n from "Drive" where "collegeId"=$1`, [inst.college]) });
  const cntA = await sqlCounts(A), cntB = await sqlCounts(B);
  const dB = await who.B.staff("GET", "/api/dashboard"), dA = await who.A.staff("GET", "/api/dashboard");
  const totB = dB.j?.data?.studentCounts?.total, totA = dA.j?.data?.studentCounts?.total;
  const agg = []; const pages = ["/api/dashboard", "/api/dashboard/institution", "/api/dashboard/preparation", "/api/dashboard/readiness", "/api/analytics/overview"]; const bad21 = [];
  for (const p of pages) { const a = await who.A.staff("GET", p), b = await who.B.staff("GET", p); if (a.s !== 200 || b.s !== 200) { bad21.push(`${p}: A ${a.s}, B ${b.s} (invalid probe)`); continue; } const lk = leaksIn(b.text, oA.marker, idsA); if (lk.length) bad21.push(`${p}: B's response contains A's ${lk.join(",")}`); const lk2 = leaksIn(a.text, oB.marker, idsB); if (lk2.length) bad21.push(`${p}: A's response contains B's ${lk2.join(",")}`); agg.push(p); }
  const drA = await who.A.staff("GET", `/api/analytics/drives/${oA.drive}`), drBx = await who.B.staff("GET", `/api/analytics/drives/${oA.drive}`), drB = await who.B.staff("GET", `/api/analytics/drives/${oB.drive}`);
  R.t(["M21-TC-039"], `DASHBOARD TOTALS: each institution's own dashboard shows exactly its own student total (A ${cntA.students}, B ${cntB.students}, from independent SQL; they differ on purpose), not the other's and not a sum`, cntA.students !== cntB.students && totA === cntA.students && totB === cntB.students, JSON.stringify({ sqlA: cntA, sqlB: cntB, dashA: totA, dashB: totB }));
  R.t(["M21-TC-039"], `DASHBOARDS AND ANALYTICS: ${pages.length} dashboard and analytics endpoints answer both institutions (200) and neither response contains anything of the other institution (marker text or record ids)`, bad21.length === 0 && agg.length === pages.length, bad21.join("; "));
  R.t(["M21-TC-039"], "DRIVE ANALYTICS: the owner gets the drive's analytics (200, control); the other institution asking for it by id is refused (403/404) with nothing of the owner in the answer", drA.s === 200 && drB.s === 200 && [403, 404].includes(drBx.s) && leaksIn(drBx.text, oA.marker, idsA).length === 0, `A ${drA.s}, B own ${drB.s}, B for A's ${drBx.s}`);
} finally {
  try { await cleanupInstitutions(env, made); } catch (e) { console.error("cleanup:", e.message); }
  await env.pgc.end(); srv.stop();
}
process.exit(R.done() ? 1 : 0);

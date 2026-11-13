import { createClient } from "@supabase/supabase-js";
import pg from "pg";
const B = process.env.BASE_URL ?? "http://localhost:3111";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data, error } = await sb.auth.signInWithPassword({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
if (error) { console.log("LOGIN FAIL", error.message); process.exit(1); }
const auth = { authorization: "Bearer " + data.session.access_token };
const call = async (m, p, body, raw, headers) => {
  const r = await fetch(B + p, { method: m, headers: headers ?? (raw ? auth : { ...auth, "content-type": "application/json" }), body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const ct = r.headers.get("content-type") ?? ""; const buf = Buffer.from(await r.arrayBuffer());
  let j; if (ct.includes("json")) { try { j = JSON.parse(buf.toString()); } catch { j = null; } }
  return { s: r.status, j, d: j?.data, code: j?.error?.code, ct, buf };
};
let fails = 0;
const t = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : String(extra).slice(0, 300)); };
const day = 86400000, tag = Date.now().toString().slice(-6);
const upload = (name, text) => { const f = new FormData(); f.append("file", new Blob([text]), name); return f; };
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const { rows: [col] } = await pgc.query(`select id from "College" where slug='demo-college'`);
const { rows: [adminRow] } = await pgc.query(`select id from "User" where "collegeId"=$1 and role='TPO_ADMIN' order by "createdAt" limit 1`, [col.id]);

// ---- setup
await call("PATCH", "/api/settings/verification", { requiredSections: ["ACADEMICS", "PERSONAL"] });
await call("PATCH", "/api/settings/policies", { approvalRequired: [], maxOffersPerStudent: 1, enforceTierUpgrade: false });
const dept = (await call("GET", "/api/settings/departments")).d.find((d) => d.code === "CSE");
let csv = "enrollment_no,name,email,phone,department_code,batch_name,program_code\n";
for (const c of "ABCDE") csv += `S${tag}${c},S ${c},s${tag}${c.toLowerCase()}@example.com,,CSE,2021-2025,\n`;
const pv = await call("POST", "/api/students/import/preview", null, upload("s.csv", csv)); await call("POST", `/api/students/import/${pv.d.jobId}/confirm`);
const list = (await call("GET", `/api/students?q=S${tag}&limit=10`)).d.items; const st = (c) => list.find((x) => x.enrollmentNo === `S${tag}${c}`).id;
const cgpa = { A: 7.5, B: 6.0, C: 9, D: 8, E: 8 };
const semA = [{ semester: 1, sgpa: 7.0, subjects: [{ name: "Maths", score: 45 }, { name: "Physics", score: 80 }] }, { semester: 2, sgpa: 7.8, subjects: [{ name: "Maths", score: 70 }] }, { semester: 3, sgpa: 7.4, subjects: [{ name: "DBMS", score: 6 }] }];
for (const c of "ABCDE") {
  await call("PATCH", `/api/students/${st(c)}`, { phone: "9876543210" });
  if (c === "A") { // Module 3 phase 2: semester results are structured records and the ACADEMICS data is generated from them (an inline `semesters` list that carries subjects is dropped), so student A gets real records
    const colId = (await pgc.query(`select "collegeId" c from "Student" where id=$1`, [st(c)])).rows[0].c;
    for (const sm of semA) {
      const rid = (await pgc.query(`insert into "SemesterResult" (id,"collegeId","studentId","semesterNumber",sgpa,"updatedAt") values (gen_random_uuid(),$1,$2,$3,$4,now()) returning id`, [colId, st(c), sm.semester, sm.sgpa])).rows[0].id;
      for (const sj of sm.subjects) await pgc.query(`insert into "SubjectMark" (id,"collegeId","semesterResultId",name,"marksObtained","maxMarks") values (gen_random_uuid(),$1,$2,$3,$4,100)`, [colId, rid, sj.name, sj.score]);
    }
  }
  await call("PUT", `/api/students/${st(c)}/sections/ACADEMICS`, { data: { cgpa: cgpa[c], tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true });
  await call("PUT", `/api/students/${st(c)}/sections/PERSONAL`, { data: { dob: "2003-01-01" }, submit: true });
  await call("POST", `/api/students/${st(c)}/sections/ACADEMICS/approve`, {}); await call("POST", `/api/students/${st(c)}/sections/PERSONAL/approve`, {});
  await call("POST", `/api/students/${st(c)}/onboard`);
}
// resume material for A (verified)
const put = async (sec, d) => { await call("PUT", `/api/students/${st("A")}/sections/${sec}`, { data: d, submit: true }); await call("POST", `/api/students/${st("A")}/sections/${sec}/approve`, {}); };
await put("RESUME", { text: "Built distributed systems using Kafka and Postgres, led a team of four on a payments platform, and improved latency by forty percent.", summary: "Backend engineer focused on reliable data systems and clear communication." });
await put("SKILLS", { skills: ["Java", "Kafka", "Postgres", "Docker", { name: "SQL" }] });
await put("PROJECTS", { projects: [{ title: "Payments", stack: "Java" }, { title: "Chat", stack: "Node" }] });
await put("INTERNSHIPS", { internships: [{ company: "Acme", months: 3 }] });
await put("EDUCATION_HISTORY", { school: "City School", year: 2019 });

const co = (await call("POST", "/api/companies", { name: `AnCo ${tag}`, tier: "DREAM" })).d.id;
const mkDrive = async (extra = {}, rounds = [{ type: "TECHNICAL" }]) => {
  const d = await call("POST", "/api/drives", { companyId: co, role: "SDE", jobType: "FULL_TIME", applicationDeadline: new Date(Date.now() + 2 * day).toISOString(), driveDate: new Date(Date.now() + 5 * day).toISOString(), minCgpa: 6.5, allowPlaced: true, departmentIds: [dept.id], rounds, ...extra });
  await call("POST", `/api/drives/${d.d.id}/publish`); return d.d.id;
};
const d1 = await mkDrive(), d2 = await mkDrive();
const apps = async (d, cs) => { const m = {}; for (const c of cs) { const r = await call("POST", `/api/drives/${d}/applications`, { studentId: st(c) }); m[c] = r.d?.id; } return m; };
t("B (cgpa 6.0) not eligible", (await call("POST", `/api/drives/${d1}/applications`, { studentId: st("B") })).s === 400);
const a1 = await apps(d1, "ACDE"), a2 = await apps(d2, "ACD");
await call("POST", `/api/drives/${d1}/applications/decide`, { applicationIds: Object.values(a1), status: "SHORTLISTED" });
await call("POST", `/api/drives/${d2}/applications/decide`, { applicationIds: Object.values(a2), status: "SHORTLISTED" });
const r1 = (await call("GET", `/api/drives/${d1}`)).d.rounds[0].id, r2 = (await call("GET", `/api/drives/${d2}`)).d.rounds[0].id;
await call("POST", `/api/drives/${d1}/rounds/${r1}/results`, { results: [{ applicationId: a1.A, status: "REJECTED" }, { applicationId: a1.C, status: "CLEARED", score: 90 }, { applicationId: a1.D, status: "REJECTED" }, { applicationId: a1.E, status: "ABSENT" }] });
await call("POST", `/api/drives/${d2}/rounds/${r2}/results`, { results: [{ applicationId: a2.A, status: "REJECTED" }, { applicationId: a2.C, status: "CLEARED" }, { applicationId: a2.D, status: "REJECTED" }] });
const offer = await call("POST", "/api/offers", { applicationId: a1.C, packageLpa: 20 }); await call("POST", `/api/offers/${offer.d.id}/respond`, { decision: "ACCEPT" });

// ---- dashboard
const dash = await call("GET", "/api/dashboard"); const D = dash.d;
t("dashboard student counts", D.studentCounts.total >= 5 && D.studentCounts.onboarded >= 5 && D.studentCounts.placed >= 1, JSON.stringify(D.studentCounts));
t("placement progress by dept and batch", D.placementProgress.overall.placed >= 1 && D.placementProgress.byDepartment.some((x) => x.code === "CSE") && D.placementProgress.byBatch.length >= 1);
t("drives closing soon listed", D.needsAttention.drivesClosingSoon.some((x) => x.id === d1));
t("needs-attention basics", typeof D.needsAttention.sectionsAwaitingReview.count === "number" && typeof D.needsAttention.approvalsPending === "number" && typeof D.needsAttention.offersAwaitingResponse.count === "number");
t("upcoming drives within 7 days", D.upcoming.drives.some((x) => x.id === d1));
t("offers this week include C's", D.offersThisWeek.latest.some((o) => o.id === offer.d.id));
t("quick actions for admin", ["import_students", "create_drive", "verification_queue"].every((k) => D.quickActions.some((a) => a.key === k)));

// ---- student 360 + analysis
const A = (await call("GET", `/api/students/${st("A")}/360`)).d;
t("360 profile + 9 sections (EDUCATION_HISTORY was added in M3 phase 2)", A.profile.enrollmentNo === `S${tag}A` && A.sections.length === 9 && A.sections.find((x) => x.section === "ACADEMICS").status === "VERIFIED");
t("360 academics with semesters", A.academics.verified && A.academics.cgpa === 7.5 && A.academics.semesters.length === 3);
t("360 drives summary", A.drives.summary.applied === 2 && A.drives.summary.rejected === 2 && A.drives.items[0].journey.length === 1, JSON.stringify(A.drives.summary));
t("360 timeline has verification and application events", A.timeline.some((e) => e.type.startsWith("verification")) && A.timeline.some((e) => e.type === "application"));
t("360 shows no blocks", Array.isArray(A.activeBlocks) && A.activeBlocks.length === 0);
const note = await call("POST", `/api/students/${st("A")}/notes`, { body: "Needs mock interviews" }); t("add note", note.s === 200);
t("note appears", (await call("GET", `/api/students/${st("A")}/360`)).d.notes[0].body === "Needs mock interviews");
const C = (await call("GET", `/api/students/${st("C")}/360`)).d; t("C: placed, accepted offer", C.profile.isPlaced && C.offers[0].status === "ACCEPTED" && C.drives.summary.cleared === 2);
const an = (await call("GET", `/api/students/${st("A")}/analysis`)).d;
t("trend: 3 semesters, declining", an.performance.semesterTrend.length === 3 && an.performance.direction === "declining" && an.performance.change === -4, JSON.stringify(an.performance));
t("weak subjects found (45% Maths)", an.performance.weakSubjects.some((w) => w.subject === "Maths" && w.score === 45), JSON.stringify(an.performance.weakSubjects));
t("comparison with batch/department", an.comparison.cgpa === 7.5 && an.comparison.batchAverage > 0 && an.comparison.departmentAverage > 0 && an.comparison.batchPercentile >= 0, JSON.stringify(an.comparison));
t("at-risk: repeated rejection at same round type", an.atRisk.flags.some((f) => f.flag === "REPEATED_REJECTION" && /technical/.test(f.detail)), JSON.stringify(an.atRisk));
t("readiness + personality placeholder", an.readiness.drivesApplied === 2 && Array.isArray(an.readiness.assessmentScores) && an.personalityProfile?.completed === false);

// ---- resume tools
const ra = (await call("GET", `/api/students/${st("A")}/resume`)).d; t("A resume ready, score 100", ra.score === 100 && ra.ready && ra.improvements.length === 0 && ra.keywords.includes("kafka"), JSON.stringify(ra));
const rb = (await call("GET", `/api/students/${st("B")}/resume`)).d; t("B resume needs work", rb.score < 70 && !rb.ready && rb.improvements.length >= 4, JSON.stringify(rb));
const rd = (await call("GET", "/api/resumes/readiness")).d; t("batch readiness", rd.total >= 5 && rd.ready >= 1 && rd.byDepartment.length >= 1 && rd.lowestScores.length >= 1);
const pdfA = await call("GET", `/api/students/${st("A")}/resume.pdf`); t("resume PDF generated", pdfA.s === 200 && pdfA.ct.includes("pdf") && pdfA.buf.subarray(0, 4).toString() === "%PDF" && pdfA.buf.length > 1500, pdfA.s);
const nl = await call("POST", "/api/students", { enrollmentNo: `U${tag}`, name: "अनु Rao", email: `u${tag}@example.com`, departmentId: dept.id, batchId: (await call("GET", `/api/students/${st("A")}`)).d.batchId });
t("no verified data -> 409", (await call("GET", `/api/students/${nl.d.id}/resume.pdf`)).s === 409);
await call("PUT", `/api/students/${nl.d.id}/sections/ACADEMICS`, { data: { cgpa: 8, tenthPercentage: 80, twelfthPercentage: 80, activeBacklogs: 0 }, submit: true }); await call("POST", `/api/students/${nl.d.id}/sections/ACADEMICS/approve`, {});
t("non-Latin name does not break the PDF", (await call("GET", `/api/students/${nl.d.id}/resume.pdf`)).s === 200);

// ---- analytics
const ov = await call("GET", `/api/analytics/overview?year=${new Date().getUTCFullYear()}`); const O = ov.d;
t("overview shape", O.placement.total >= 5 && O.byDepartment.length >= 1 && O.byBatch.length >= 1 && O.packages.highest >= 20 && O.packages.median > 0 && O.packages.average > 0 && O.companies.visited >= 1 && O.offers.made >= 1, JSON.stringify(O.packages));
t("overview filters by department", (await call("GET", `/api/analytics/overview?departmentId=${dept.id}&includeHistorical=false`)).d.byDepartment.every((x) => x.id === dept.id));
t("overview xlsx export", (await call("GET", "/api/analytics/overview?format=xlsx")).ct.includes("spreadsheet"));
const da = (await call("GET", `/api/analytics/drives/${d1}`)).d;
t("drive funnel", da.funnel[0].stage === "eligible" && da.funnel.find((f) => f.stage === "applied").count === 4 && da.funnel.find((f) => f.stage === "attended").count === 3 && da.funnel.find((f) => f.stage === "offers").count === 1, JSON.stringify(da.funnel));
t("absentee list + round stats", da.absentees.length === 1 && da.absentees[0].enrollmentNo === `S${tag}E` && da.rounds[0].cleared === 1 && da.rounds[0].rejected === 2 && da.rounds[0].passRate === 33.3, JSON.stringify(da.rounds));
t("drive funnel xlsx", (await call("GET", `/api/analytics/drives/${d1}?format=xlsx`)).ct.includes("spreadsheet"));
const el = (await call("GET", `/api/analytics/elimination?driveId=${d1}`)).d; t("elimination: stops at technical", el.totalEliminations === 2 && el.mostCommonStopRound === "TECHNICAL" && el.byRoundType[0].percentage === 100, JSON.stringify(el.byRoundType));
const elAll = (await call("GET", "/api/analytics/elimination")).d; t("repeat failures flagged (A and D, twice at technical)", ["A", "D"].every((c) => elAll.repeatFailures.some((f) => f.enrollmentNo === `S${tag}${c}` && f.roundType === "TECHNICAL" && f.times >= 2)));
t("by department matrix", el.byDepartment.length === 1 && el.byDepartment[0].byRoundType.TECHNICAL === 2);
const drill = (await call("GET", `/api/analytics/elimination/students?roundType=TECHNICAL&driveId=${d2}`)).d; t("click-through to students", drill.length === 2 && drill.every((x) => [`S${tag}A`, `S${tag}D`].includes(x.enrollmentNo)), JSON.stringify(drill));
t("elimination xlsx", (await call("GET", "/api/analytics/elimination?format=xlsx")).ct.includes("spreadsheet"));

// ---- reports
const rp = await call("GET", "/api/reports/placement.pdf"); t("management PDF", rp.s === 200 && rp.buf.subarray(0, 4).toString() === "%PDF" && rp.buf.length > 1500);
const nj = (await call("GET", "/api/reports/nirf?year=2025")).d; t("NIRF-style table", nj.rows[0].program === "All programs" && nj.rows[0].graduating >= 5 && nj.rows[0].placed >= 1 && nj.rows[0].highestPackageLpa >= 20, JSON.stringify(nj.rows[0]));
t("NIRF xlsx", (await call("GET", "/api/reports/nirf?year=2025&format=xlsx")).ct.includes("spreadsheet"));
t("NIRF needs a year", (await call("GET", "/api/reports/nirf")).s === 400);
const sch = await call("POST", "/api/reports/schedules", { type: "NIRF", frequency: "WEEKLY", recipients: ["principal@example.com", "dean@example.com"], firstRunAt: new Date(Date.now() - 1000).toISOString() }); t("create schedule", sch.s === 200, JSON.stringify(sch.j));
const run1 = await call("POST", "/api/reports/schedules/run"); t("due report is sent", run1.d?.sent === 1 && run1.d.failures.length === 0, JSON.stringify(run1.j));
t("run again: nothing due", (await call("POST", "/api/reports/schedules/run")).d?.due === 0);
const msgs = (await call("GET", "/api/communications/messages?purpose=report.nirf")).d.items; t("report emails logged for both recipients", msgs.filter((m) => ["principal@example.com", "dean@example.com"].includes(m.recipientEmail)).length >= 2);
t("cron secret can run reports", (await call("POST", "/api/reports/schedules/run", null, null, { authorization: "Bearer " + process.env.CRON_SECRET })).s === 200);
t("deactivate schedule", (await call("PATCH", `/api/reports/schedules/${sch.d.id}`, { isActive: false })).d?.isActive === false);
t("delete schedule", (await call("DELETE", `/api/reports/schedules/${sch.d.id}`)).d?.deleted === true);
t("students export", (await call("GET", "/api/students/export")).ct.includes("spreadsheet"));
t("offers export", (await call("GET", "/api/offers/export?status=ACCEPTED")).ct.includes("spreadsheet"));

// ---- notifications
const officer = "22222222-2222-4222-8222-222222222222", coordCSE = "33333333-3333-4333-8333-333333333333", coordOther = "44444444-4444-4444-8444-444444444444";
const eee = (await call("POST", "/api/settings/departments", { name: `Electrical ${tag}`, code: `EE${tag}` })).d;
await pgc.query(`insert into "User"(id,"collegeId",email,name,role,"departmentId","updatedAt") values($1,$2,'officer@demo.test','Officer X','PLACEMENT_OFFICER',null,now()),($3,$2,'coord@demo.test','Coord CSE','DEPARTMENT_COORDINATOR',$5,now()),($4,$2,'coord2@demo.test','Coord EEE','DEPARTMENT_COORDINATOR',$6,now()) on conflict do nothing`, [officer, col.id, coordCSE, coordOther, dept.id, eee.id]);
await call("PUT", `/api/students/${st("D")}/sections/SKILLS`, { data: { skills: ["Go"] }, submit: true });
const q = async (sql, p) => (await pgc.query(sql, p)).rows;
const notified = await q(`select distinct n."userId", u.role, u."extraRoles", u."departmentId" from "Notification" n join "User" u on u.id=n."userId" where n.type='section.submitted' and n.title like $1`, [`S D submitted%`]);
const dDept = (await q(`select "departmentId" d from "Student" where id=$1`, [st("D")]))[0].d, nIds = notified.map((u) => u.userId);
// The demo college also holds officers and coordinators left behind by other suites, so the rule is asserted, not an exact recipient list: officers and admins and the student's own department coordinator are told; a coordinator of another department is not.
t("officer and CSE coordinator notified of submission, EEE coordinator not; no recipient is a coordinator of another department", nIds.includes(officer) && nIds.includes(coordCSE) && !nIds.includes(coordOther) && notified.every((u) => [u.role, ...u.extraRoles].some((r) => r === "TPO_ADMIN" || r === "PLACEMENT_OFFICER") || (u.role === "DEPARTMENT_COORDINATOR" && u.departmentId === dDept)), JSON.stringify(notified.filter((u) => !([u.role, ...u.extraRoles].some((r) => r === "TPO_ADMIN" || r === "PLACEMENT_OFFICER") || (u.role === "DEPARTMENT_COORDINATOR" && u.departmentId === dDept))).map((u) => [u.role, u.departmentId])));
t("student notified of offer", (await q(`select 1 from "Notification" where "studentId"=$1 and type='offer.received'`, [st("C")])).length === 1);
await call("POST", `/api/students/${st("D")}/sections/SKILLS/request-changes`, { comment: "Add more detail please" });
t("student notified of requested changes", (await q(`select 1 from "Notification" where "studentId"=$1 and type='section.changesRequested'`, [st("D")])).length === 1);
await pgc.query(`insert into "Notification"(id,"collegeId","userId",type,title,"createdAt") values(gen_random_uuid(),$1,$2,'test','Hello admin',now())`, [col.id, adminRow.id]);
const n1 = (await call("GET", "/api/notifications?unreadOnly=true")).d; t("my notifications + unread count", n1.unread >= 1 && n1.items.every((n) => n.readAt === null));
t("mark all read", (await call("POST", "/api/notifications/read", { all: true })).d?.marked >= 1 && (await call("GET", "/api/notifications")).d.unread === 0);

// ---- announcements and templates
const ann = await call("POST", "/api/announcements", { title: "Pre-placement talk", body: "Friday 10am, main hall", targetDepartmentIds: [dept.id] }); t("announcement", ann.s === 200);
t("announcement expiry before publish refused", (await call("POST", "/api/announcements", { title: "Bad one", body: "x y z", publishedAt: new Date(Date.now() + day).toISOString(), expiresAt: new Date().toISOString() })).s === 400);
t("withdraw announcement", (await call("PATCH", `/api/announcements/${ann.d.id}`, { isActive: false })).d?.isActive === false);
const tpl = await call("POST", "/api/templates", { name: `Welcome ${tag}`, subject: "Hello {{name}}", body: "Dear {{name}}, welcome to placements." }); t("create template", tpl.s === 200);
t("duplicate template 409", (await call("POST", "/api/templates", { name: `Welcome ${tag}`, subject: "x y z", body: "x y z" })).s === 409);
t("send using template", (await call("POST", "/api/communications/email", { templateId: tpl.d.id, departmentId: dept.id })).d?.sent >= 5);
t("unknown template refused", (await call("POST", "/api/communications/email", { templateId: "00000000-0000-4000-8000-000000000000", departmentId: dept.id })).s === 400);
t("needs template or text", (await call("POST", "/api/communications/email", { departmentId: dept.id })).s === 400);
t("edit + delete template", (await call("PATCH", `/api/templates/${tpl.d.id}`, { subject: "Hi {{name}}" })).d?.subject === "Hi {{name}}" && (await call("DELETE", `/api/templates/${tpl.d.id}`)).d?.deleted);

// ---- tickets
t("correction needs data", (await call("POST", "/api/tickets", { studentId: st("A"), category: "DATA_CORRECTION", subject: "Wrong marks", message: "My CGPA is wrong", section: "ACADEMICS" })).s === 400);
t("unknown student", (await call("POST", "/api/tickets", { studentId: "00000000-0000-4000-8000-000000000000", category: "OTHER", subject: "Hello there", message: "Hi hi" })).s === 404);
const tk = await call("POST", "/api/tickets", { studentId: st("A"), category: "DATA_CORRECTION", subject: "My CGPA is wrong", message: "It should be 7.9", section: "ACADEMICS", data: { cgpa: 7.9, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 } }); t("correction ticket", tk.s === 200, JSON.stringify(tk.j));
const sec = (await call("GET", `/api/students/${st("A")}/sections/ACADEMICS`)).d; t("verified value kept, correction pending", sec.status === "SUBMITTED" && sec.data.cgpa === 7.5 && sec.pendingData.cgpa === 7.9, JSON.stringify(sec));
t("correction is in the verification queue as a revision", (await call("GET", "/api/verification/queue?section=ACADEMICS")).d.items.some((i) => i.student.id === st("A") && i.isRevision));
const tl = (await call("GET", "/api/tickets?status=OPEN")).d.items.find((x) => x.id === tk.d.id); t("ticket list shows status, age", tl?.status === "OPEN" && tl.ageHours >= 0 && tl.student.enrollmentNo === `S${tag}A`);
t("reply moves to in progress", (await call("POST", `/api/tickets/${tk.d.id}/messages`, { body: "We are checking this" })).s === 200 && (await call("GET", `/api/tickets/${tk.d.id}`)).d.status === "IN_PROGRESS");
t("coordinator from another department refused", (await call("POST", `/api/tickets/${tk.d.id}/assign`, { assigneeId: coordOther })).s === 400);
t("assign to own-department coordinator", (await call("POST", `/api/tickets/${tk.d.id}/assign`, { assigneeId: coordCSE })).d?.assigneeId === coordCSE);
t("assigned shows in their list", (await call("GET", `/api/tickets?assigneeId=${coordCSE}`)).d.items.some((x) => x.id === tk.d.id));
t("approve correction applies it", (await call("POST", `/api/students/${st("A")}/sections/ACADEMICS/approve`, {})).s === 200 && (await call("GET", `/api/students/${st("A")}/sections/ACADEMICS`)).d.data.cgpa === 7.9);
t("resolve", (await call("POST", `/api/tickets/${tk.d.id}/resolve`, { message: "Updated to 7.9" })).d?.status === "RESOLVED");
t("resolve twice 409", (await call("POST", `/api/tickets/${tk.d.id}/resolve`, {})).s === 409);
t("reply on resolved 409", (await call("POST", `/api/tickets/${tk.d.id}/messages`, { body: "late" })).s === 409);
t("student notified of reply and resolution", (await q(`select type from "Notification" where "studentId"=$1 and type in ('ticket.reply','ticket.resolved')`, [st("A")])).length === 2);
t("plain ticket", (await call("POST", "/api/tickets", { studentId: st("B"), category: "APPLICATION_ISSUE", subject: "I can't apply", message: "Button disabled" })).s === 200);
t("staff notified of new ticket", (await q(`select 1 from "Notification" where type='ticket.created' and "userId"=$1`, [officer])).length >= 1);

// ---- cleanup of fake staff
await pgc.query(`update "Ticket" set "assigneeId"=null where "assigneeId" in ($1,$2,$3)`, [officer, coordCSE, coordOther]);
await pgc.query(`delete from "Notification" where "userId" in ($1,$2,$3)`, [officer, coordCSE, coordOther]);
await pgc.query(`delete from "User" where id in ($1,$2,$3)`, [officer, coordCSE, coordOther]);
await pgc.end();
console.log(fails ? `${fails} FAILED` : "ALL PASSED");

// M3 phase 2: structured academic records (semester results with subject marks, backlogs with attempts), their review through the
// ACADEMICS section, verified-record protection, the snapshot other modules read, and tenant isolation. Local stack only.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { checker, client, login, makeStudents, tag } from "./lib.mjs";

const { t, done } = checker();
if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "")) { console.error("Refusing: SUPABASE_URL is not local"); process.exit(2); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL });
await pgc.connect();
const q = async (sql, args = []) => (await pgc.query(sql, args)).rows;
const made = { auth: [], colleges: [], semesters: [] };
const pw = "Acad-" + tag + "-pw!";

try {
  const staff = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
  await staff("PATCH", "/api/settings/verification", { requiredSections: ["ACADEMICS", "PERSONAL"] });
  const { ids, tokens } = await makeStudents(staff, 3, "AR");
  const me = Object.fromEntries(Object.entries(tokens).map(([c, tk]) => [c, client(tk)]));
  const C = ids.C;
  const sec = async (id, s = "ACADEMICS") => (await q(`select status,data,"pendingData" p from "StudentSection" where "studentId"=$1 and section=$2::"ProfileSection"`, [id, s]))[0];
  const sems = (id) => q(`select "semesterNumber" n,sgpa::float s,"resultStatus" r,"reviewStatus" st,"pendingData" p,"semesterId" sid,"verifiedAt" va,"reviewComment" rc from "SemesterResult" where "studentId"=$1 order by 1`, [id]);
  const attempts = (id) => q(`select a."attemptNumber" n,a.outcome o,a."reviewStatus" st,a."clearedInSemester" c from "BacklogAttempt" a join "Backlog" b on b.id=a."backlogId" where b."studentId"=$1 order by b."subjectName",a."attemptNumber"`, [id]);
  const acad = { cgpa: 8, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 };
  const sub = (o = {}) => ({ name: "Maths", marksObtained: 80, maxMarks: 100, ...o });
  const put = (c, body) => me[c]("PUT", "/api/student/semesters", body);

  // ---- access
  t("access: a student token is needed", (await client("x")("GET", "/api/student/semesters")).s === 401);
  t("access: staff cannot use the student records api", [401, 403].includes((await staff("GET", "/api/student/semesters")).s));
  t("access: a student cannot use the staff records api", [401, 403].includes((await me.C("GET", `/api/students/${C}/academic-records`)).s));

  // ---- validation of semester results
  const bad = async (over, name) => t(`semester: ${name} is refused`, (await put("C", { semesterNumber: 1, sgpa: 8, subjects: [sub()], ...over })).s === 400);
  await bad({ subjects: [sub({ marksObtained: 101 })] }, "marks above the maximum");
  await bad({ subjects: [sub({ marksObtained: -1 })] }, "negative marks");
  await bad({ subjects: [sub({ maxMarks: 0 })] }, "a maximum of zero");
  await bad({ subjects: [sub(), sub({ name: "maths" })] }, "the same subject twice");
  await bad({ sgpa: 10.5 }, "an SGPA above 10");
  await bad({ sgpa: -1 }, "a negative SGPA");
  await bad({ semesterNumber: 0 }, "semester number 0");
  await bad({ sgpa: 9.9, subjects: [sub({ credits: 4, gradePoints: 9 }), sub({ name: "B", credits: 2, gradePoints: 6 })] }, "an SGPA that contradicts the grade points");
  t("semester: refused attempts stored nothing", (await sems(C)).length === 0);
  t("semester: there is no stored percentage column (it is calculated)", (await q(`select count(*)::int n from information_schema.columns where table_name in ('SemesterResult','SubjectMark') and column_name ilike '%percent%'`))[0].n === 0);

  // ---- semester mapping against the M2 structure
  const batchId = (await q(`select "batchId" b from "Student" where id=$1`, [C]))[0].b;
  let s2 = (await q(`select id from "Semester" where "batchId"=$1 and number=2`, [batchId]))[0]?.id; // the institution may already have set it up
  if (!s2) { s2 = (await q(`insert into "Semester" (id,"collegeId","batchId",number,name) select gen_random_uuid(),"collegeId",$1::uuid,2,'Sem 2 ' || $2::text from "Batch" where id=$1::uuid returning id`, [batchId, tag]))[0].id; made.semesters.push(s2); }
  await q(`update "Student" set "currentSemesterId"=$1 where id=$2`, [s2, C]);
  const r3 = await put("C", { semesterNumber: 3, sgpa: 8, subjects: [] });
  t("mapping: a semester after the student's current one is refused and says why", r3.s === 400 && /current semester/i.test(JSON.stringify(r3.j)), JSON.stringify(r3.j));
  const r1 = await put("C", { semesterNumber: 1, sgpa: 8.5, subjects: [sub({ name: "Maths", marksObtained: 80 }), sub({ name: "Physics", marksObtained: 60 })] });
  t("semester: a normal semester is saved as a draft with its percentage calculated", r1.s === 200 && r1.d.reviewStatus === "DRAFT" && r1.d.percentage === 70 && r1.d.subjects.length === 2, JSON.stringify(r1.j));
  const r2 = await put("C", { semesterNumber: 2, sgpa: 7.5, subjects: [sub({ name: "Chem", marksObtained: 50 })] });
  t("mapping: a semester of the student's own batch is linked to the M2 semester", r2.s === 200 && (await sems(C)).find((x) => x.n === 2)?.sid === s2);
  t("semester: saving the same semester again replaces it (one row per semester)", (await put("C", { semesterNumber: 1, sgpa: 8.5, subjects: [sub({ name: "Maths", marksObtained: 80 })] })).s === 200 && (await sems(C)).length === 2 && (await me.C("GET", "/api/student/semesters")).d.find((x) => x.semesterNumber === 1).subjects.length === 1);
  await put("C", { semesterNumber: 1, sgpa: 8.5, subjects: [sub({ name: "Maths", marksObtained: 80 }), sub({ name: "Physics", marksObtained: 60 })] });

  // ---- backlogs: attempts are history
  const bl = await me.C("POST", "/api/student/backlogs", { subjectName: "Data Structures", semesterNumber: 2, examSession: "Nov 2024" });
  t("backlog: a failed subject is listed as pending with its first attempt", bl.s === 200 && bl.d.status === "PENDING" && bl.d.attempts.length === 1 && bl.d.attempts[0].outcome === "FAILED", JSON.stringify(bl.j));
  const blId = bl.d.id;
  t("backlog: listing the same subject again is refused", (await me.C("POST", "/api/student/backlogs", { subjectName: "data structures", semesterNumber: 2 })).s === 409);
  t("backlog: clearing needs a semester", (await me.C("POST", `/api/student/backlogs/${blId}/attempts`, { outcome: "CLEARED" })).s === 400);
  t("backlog: it cannot be cleared before the semester it was failed in", (await me.C("POST", `/api/student/backlogs/${blId}/attempts`, { outcome: "CLEARED", clearedInSemester: 1 })).s === 400);
  const a2 = await me.C("POST", `/api/student/backlogs/${blId}/attempts`, { outcome: "FAILED", examSession: "May 2025" });
  t("backlog: a second failed attempt is added, the first is kept", a2.s === 200 && a2.d.attempts.length === 2 && a2.d.status === "PENDING");
  t("active backlogs cannot be declared lower than the pending subjects listed", (await me.C("PUT", "/api/student/sections/ACADEMICS", { data: { ...acad, activeBacklogs: 0 }, submit: true })).s === 400);
  t("a second student cannot reach my backlog", (await me.B("POST", `/api/student/backlogs/${blId}/attempts`, { outcome: "FAILED" })).s === 404 && (await me.B("DELETE", `/api/student/backlogs/${blId}`)).s === 404);

  // ---- submit: records go to review with the section
  const sub1 = await me.C("PUT", "/api/student/sections/ACADEMICS", { data: { ...acad, activeBacklogs: 1 }, submit: true });
  t("submit: the ACADEMICS section goes for review", sub1.s === 200 && sub1.d.status === "SUBMITTED", JSON.stringify(sub1.j));
  t("submit: semester results and backlog attempts are now under review", (await sems(C)).every((x) => x.st === "SUBMITTED") && (await attempts(C)).every((x) => x.st === "SUBMITTED"));
  const snap1 = await sec(C);
  t("submit: the section carries the structured records in the same keys as before", snap1.p === null && snap1.data.semesters?.length === 2 && snap1.data.semesters[0].semester === 1 && snap1.data.semesters[0].sgpa === 8.5 && snap1.data.cgpa === 8 && snap1.data.backlogHistory?.[0]?.subject === "Data Structures", JSON.stringify(snap1.data).slice(0, 300));
  t("lock: nothing can be changed while the section is under review", (await put("C", { semesterNumber: 1, sgpa: 9, subjects: [] })).s === 409 && (await me.C("POST", "/api/student/backlogs", { subjectName: "X", semesterNumber: 1 })).s === 409 && (await me.C("POST", `/api/student/backlogs/${blId}/attempts`, { outcome: "FAILED" })).s === 409);
  const semC1 = (await me.C("GET", "/api/student/semesters")).d[0].id;
  t("lock: a semester under review cannot be deleted, and a backlog under review is kept", (await me.C("DELETE", `/api/student/semesters/${semC1}`)).s === 409 && (await me.C("DELETE", `/api/student/backlogs/${blId}`)).s === 409);

  // ---- staff review: send back, correct, approve
  const rc = await staff("POST", `/api/students/${C}/sections/ACADEMICS/request-changes`, { comment: "Semester 2 marks do not match the marksheet" });
  t("review: changes requested sends the records back with the comment", rc.s === 200 && (await sems(C)).every((x) => x.st === "CHANGES_REQUESTED" && /marksheet/.test(x.rc)) && (await attempts(C)).every((x) => x.st === "CHANGES_REQUESTED"));
  t("review: the student can edit again", (await put("C", { semesterNumber: 2, sgpa: 7.8, subjects: [sub({ name: "Chem", marksObtained: 55 })] })).s === 200);
  await me.C("PUT", "/api/student/sections/ACADEMICS", { data: { ...acad, activeBacklogs: 1 }, submit: true });
  const ap = await staff("POST", `/api/students/${C}/sections/ACADEMICS/approve`, { comment: "ok" });
  t("review: approval verifies the records", ap.s === 200 && (await sems(C)).every((x) => x.st === "VERIFIED" && x.va) && (await attempts(C)).every((x) => x.st === "VERIFIED"), JSON.stringify(ap.j));
  const v1 = await sec(C);
  t("review: the verified section holds the approved records (sgpa 7.8 for semester 2)", v1.status === "VERIFIED" && v1.data.semesters.find((x) => x.semester === 2).sgpa === 7.8 && v1.data.backlogHistory[0].attempts.length === 2, JSON.stringify(v1.data).slice(0, 300));
  const view = await staff("GET", `/api/students/${C}/academic-records`);
  t("review: staff see the semesters, subjects and every backlog attempt", view.s === 200 && view.d.semesters.length === 2 && view.d.semesters[0].subjects.length === 2 && view.d.backlogs[0].attempts.length === 2, JSON.stringify(view.j).slice(0, 200));
  const ev = (await q(`select count(*)::int n from "VerificationEvent" where "studentId"=$1 and section='ACADEMICS' and action in ('SUBMITTED','CHANGES_REQUESTED','APPROVED')`, [C]))[0].n;
  t("review: submissions, the change request and the approval are all in the history", ev >= 4, String(ev));

  // ---- other modules still read what they always read
  const t360 = await staff("GET", `/api/students/${C}/360`);
  t("compat: Student 360 still reads cgpa and semesters from the verified section", t360.s === 200 && t360.d.academics?.cgpa === 8 && t360.d.academics?.semesters?.length === 2 && t360.d.academics?.verified === true, JSON.stringify(t360.d?.academics).slice(0, 200));

  // ---- verified records are protected
  const ed = await put("C", { semesterNumber: 1, sgpa: 9.1, subjects: [sub({ name: "Maths", marksObtained: 90 })] });
  const s1 = (await sems(C)).find((x) => x.n === 1);
  t("protect: editing a verified semester waits as a pending revision, the verified values stay", ed.s === 200 && s1.st === "VERIFIED" && s1.s === 8.5 && s1.p?.sgpa === 9.1, JSON.stringify(s1));
  t("protect: the verified snapshot does not move until approval", (await sec(C)).data.semesters.find((x) => x.semester === 1).sgpa === 8.5);
  t("protect: a verified semester and a verified backlog cannot be deleted", (await me.C("DELETE", `/api/student/semesters/${semC1}`)).s === 409 && (await me.C("DELETE", `/api/student/backlogs/${blId}`)).s === 409);
  const clr = await me.C("POST", `/api/student/backlogs/${blId}/attempts`, { outcome: "CLEARED", examSession: "Nov 2025", clearedInSemester: 4 });
  const at = await attempts(C);
  t("backlog: clearing adds a third attempt, the verified failures are untouched", clr.s === 200 && clr.d.status === "CLEARED" && at.length === 3 && at[0].o === "FAILED" && at[0].st === "VERIFIED" && at[2].o === "CLEARED" && at[2].st === "DRAFT", JSON.stringify(at));
  t("backlog: the verified snapshot still says pending until the clearance is approved", (await sec(C)).data.backlogHistory[0].status === "PENDING");
  t("backlog: a cleared subject takes no further attempts", (await me.C("POST", `/api/student/backlogs/${blId}/attempts`, { outcome: "FAILED" })).s === 409);
  await me.C("PUT", "/api/student/sections/ACADEMICS", { data: { ...acad, activeBacklogs: 0 }, submit: true });
  t("review: resubmitting keeps the earlier verified section data until approval", (await sec(C)).p?.semesters?.find((x) => x.semester === 1)?.sgpa === 9.1 && (await sec(C)).data.semesters.find((x) => x.semester === 1).sgpa === 8.5);
  await staff("POST", `/api/students/${C}/sections/ACADEMICS/approve`, {});
  const s1b = (await sems(C)).find((x) => x.n === 1), vb = await sec(C);
  t("review: approval applies the pending revision and clears it", s1b.s === 9.1 && s1b.p === null && s1b.st === "VERIFIED" && vb.data.semesters.find((x) => x.semester === 1).sgpa === 9.1);
  t("review: the clearance is verified and history is complete (failed, failed, cleared)", (await attempts(C)).map((x) => x.o + ":" + x.st).join() === "FAILED:VERIFIED,FAILED:VERIFIED,CLEARED:VERIFIED" && vb.data.backlogHistory[0].status === "CLEARED" && vb.data.backlogHistory[0].attempts.length === 3);

  // ---- a draft entry made by mistake can be removed; unrelated students are untouched
  const mistake = await me.B("POST", "/api/student/backlogs", { subjectName: "Mistake", semesterNumber: 1 });
  t("backlog: a mistaken, unreviewed entry can be removed", mistake.s === 200 && (await me.B("DELETE", `/api/student/backlogs/${mistake.d.id}`)).s === 200);
  t("isolation: other students' records are separate", (await me.B("GET", "/api/student/semesters")).d.length === 0 && (await me.A("GET", "/api/student/backlogs")).d.length === 0);

  // ---- tenant isolation: an administrator of another institution
  const bId = (await q(`insert into "College" (id,name,slug,"updatedAt") values (gen_random_uuid(),$1,$2,now()) returning id`, [`Acad B ${tag}`, `acad-b-${tag}`]))[0].id; made.colleges.push(bId);
  const em = `acadb${tag}@example.com`;
  const { data: au, error } = await sb.auth.admin.createUser({ email: em, password: pw, email_confirm: true }); if (error) throw new Error(error.message);
  made.auth.push(au.user.id);
  await q(`insert into "CollegeModule" ("collegeId",module,enabled) values ($1,'ONBOARDING',true)`, [bId]); // so the refusal below is about tenancy, not a switched-off module
  await q(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values ($1,$2,$3,'Acad B Admin','TPO_ADMIN'::"Role",'{}'::"Role"[],now())`, [au.user.id, bId, em]);
  const adminB = client(await login(em, pw));
  t("tenant: another institution's administrator cannot read this student's academic records", (await adminB("GET", `/api/students/${C}/academic-records`)).s === 404);
  t("tenant: nor change the section, nor read the education records", (await adminB("POST", `/api/students/${C}/sections/ACADEMICS/approve`, {})).s === 404 && (await adminB("GET", `/api/students/${C}/education`)).s === 404);
  t("tenant: every record carries its own institution", (await q(`select count(*)::int n from "SemesterResult" r join "Student" s on s.id=r."studentId" where s.id=$1 and r."collegeId" <> s."collegeId"`, [C]))[0].n === 0);
} finally {
  try {
    for (const id of made.semesters) { await pgc.query(`update "Student" set "currentSemesterId"=null where "currentSemesterId"=$1`, [id]); await pgc.query(`delete from "Semester" where id=$1`, [id]); }
    for (const c of made.colleges) { await pgc.query(`delete from "User" where "collegeId"=$1`, [c]).catch(() => {}); await pgc.query(`delete from "College" where id=$1`, [c]).catch(() => {}); }
    for (const id of made.auth) await sb.auth.admin.deleteUser(id).catch(() => {});
  } finally { await pgc.end(); }
}
process.exit(done() ? 1 : 0);

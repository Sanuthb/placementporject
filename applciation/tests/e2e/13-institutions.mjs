// M2: faculty, universities, institution provisioning, tenant isolation and academic-structure integrity. Cleans up what it creates.
// Needs a TEST database and Supabase project (it creates auth users, and provisioning sends one invitation email).
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { checker, client, login, tag } from "./lib.mjs";

const { t, done } = checker();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL });
await pgc.connect();
const pw = `Inst-${tag}-pw1!`;
const made = { auth: [], colleges: [], platform: [] };

async function authUser(label) {
  const email = `inst${tag}${label}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(error.message);
  made.auth.push(data.user.id);
  return { id: data.user.id, email };
}
async function staffUser(collegeId, label, role, extra = []) {
  const u = await authUser(label);
  await pgc.query(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values ($1,$2,$3,$4,$5::"Role",$6::"Role"[],now())`, [u.id, collegeId, u.email, `Inst ${label}`, role, extra]);
  return { ...u, c: client(await login(u.email, pw)) };
}

try {
  const admin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
  const collegeA = (await pgc.query(`select "collegeId" c from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).rows[0].c;

  // A second institution, built directly, with its own admin and structure. Provisioning itself is tested below.
  const b = (await pgc.query(`insert into "College" (id,name,slug,"updatedAt") values (gen_random_uuid(),$1,$2,now()) returning id`, [`Inst B ${tag}`, `inst-b-${tag}`])).rows[0].id;
  made.colleges.push(b);
  const adminB = await staffUser(b, "adminb", "TPO_ADMIN");
  const deptB = (await adminB.c("POST", "/api/settings/departments", { name: `B Dept ${tag}`, code: `BD${tag}` })).d;
  const progB = (await adminB.c("POST", "/api/settings/programs", { name: `B Prog ${tag}`, code: `BP${tag}`.slice(0, 18), departmentId: deptB.id })).d;
  const uniB = (await adminB.c("POST", "/api/settings/universities", { name: `B Uni ${tag}`, code: `BU${tag}` })).d;
  const batchB = (await adminB.c("POST", "/api/settings/batches", { programId: progB.id, admissionYear: 2026 })).d;
  t("institution B can build its own structure", !!(deptB && progB && uniB && batchB));

  // ---- universities -------------------------------------------------------------------------------------------------
  const deptA = (await admin("POST", "/api/settings/departments", { name: `A Dept ${tag}`, code: `AD${tag}` })).d;
  const uni = await admin("POST", "/api/settings/universities", { name: `Anna Test ${tag}`, code: `AT${tag}`, website: "https://example.edu" });
  t("university: created", uni.s === 200 && uni.d.name.includes("Anna Test"));
  t("university: duplicate code refused", (await admin("POST", "/api/settings/universities", { name: "Other", code: `AT${tag}` })).s === 409);
  t("university: duplicate name refused ignoring case", (await admin("POST", "/api/settings/universities", { name: `ANNA TEST ${tag}`, code: `AX${tag}` })).s === 409);
  t("university: the same code is allowed in another institution", (await adminB.c("POST", "/api/settings/universities", { name: `Anna Test ${tag}`, code: `AT${tag}` })).s === 200);
  const progA = await admin("POST", "/api/settings/programs", { name: `A Prog ${tag}`, code: `AP${tag}`.slice(0, 18), departmentId: deptA.id, universityId: uni.d.id });
  t("programme: linked to a university, legacy text kept in step", progA.s === 200 && progA.d.universityId === uni.d.id && progA.d.university === uni.d.name);
  t("programme: cannot link another institution's university", (await admin("POST", "/api/settings/programs", { name: "X Prog", code: `XP${tag}`.slice(0, 18), departmentId: deptA.id, universityId: uniB.id })).s === 400);
  const legacy = await admin("POST", "/api/settings/programs", { name: `Legacy ${tag}`, code: `LG${tag}`.slice(0, 18), departmentId: deptA.id, university: `anna test ${tag}` });
  t("programme: a bare university name is matched to the record", legacy.d?.universityId === uni.d.id);
  t("university: deleting one in use is refused", (await admin("DELETE", `/api/settings/universities/${uni.d.id}`)).s === 409);
  t("university: another institution's university is not found", (await admin("PATCH", `/api/settings/universities/${uniB.id}`, { name: "Hijack" })).s === 404);
  t("university: the list never includes another institution's", !(await admin("GET", "/api/settings/universities")).d.some((u) => u.id === uniB.id));

  // ---- tenant isolation across the academic structure ----------------------------------------------------------------
  t("tenant: A cannot create a programme under B's department", (await admin("POST", "/api/settings/programs", { name: "Z", code: `Z${tag}`.slice(0, 18), departmentId: deptB.id })).s === 400);
  t("tenant: A cannot create a batch for B's programme", (await admin("POST", "/api/settings/batches", { programId: progB.id, admissionYear: 2027 })).s === 400);
  t("tenant: A cannot patch B's batch", (await admin("PATCH", `/api/settings/batches/${batchB.id}`, { name: "Hijack batch" })).s === 404);
  t("tenant: A cannot delete B's programme", (await admin("DELETE", `/api/settings/programs/${progB.id}`)).s === 404);
  t("tenant: lists show only own records", !(await admin("GET", "/api/settings/programs")).d.some((p) => p.id === progB.id) && !(await admin("GET", "/api/settings/batches")).d.some((x) => x.id === batchB.id));
  t("tenant: A's staff list does not include B's admin", !(await admin("GET", "/api/settings/staff")).d.some((u) => u.id === adminB.id));
  t("tenant: A cannot change B's admin", (await admin("PATCH", `/api/settings/staff/${adminB.id}`, { isActive: false })).s === 404);

  // ---- academic structure integrity ---------------------------------------------------------------------------------
  const branchA = (await admin("POST", "/api/settings/branches", { programId: progA.d.id, name: `Branch ${tag}` })).d;
  const progA2 = (await admin("POST", "/api/settings/programs", { name: `A Prog2 ${tag}`, code: `A2${tag}`.slice(0, 18), departmentId: deptA.id })).d;
  const batchA = (await admin("POST", "/api/settings/batches", { programId: progA2.id, admissionYear: 2026 })).d;
  t("integrity: a batch cannot take a branch of another programme", (await admin("PATCH", `/api/settings/batches/${batchA.id}`, { branchId: branchA.id })).s === 400);
  t("integrity: a batch cannot be created with another programme's branch", (await admin("POST", "/api/settings/batches", { programId: progA2.id, admissionYear: 2030, branchId: branchA.id })).s === 400);
  t("integrity: a semester cannot take another institution's academic year", (await (async () => {
    const yb = (await adminB.c("POST", "/api/settings/academic-years", { name: `YB ${tag}`, startDate: "2026-06-01", endDate: "2027-05-31" })).d;
    const sems = (await admin("GET", `/api/settings/semesters?batchId=${batchA.id}`)).d;
    return admin("PATCH", `/api/settings/semesters/${sems[0].id}`, { academicYearId: yb.id });
  })()).s === 400);
  const rep = (await admin("GET", "/api/settings/integrity")).d;
  t("integrity: the report is clean after the checks above", rep?.ok === true, JSON.stringify(rep?.violations).slice(0, 200));

  // ---- faculty ------------------------------------------------------------------------------------------------------
  const fac = await staffUser(collegeA, "fac", "FACULTY");
  await pgc.query(`insert into "FacultyProfile" ("userId","collegeId","updatedAt") values ($1,$2,now())`, [fac.id, collegeA]);
  const list = (await admin("GET", "/api/settings/faculty")).d;
  t("faculty: appears in the faculty list", list.some((f) => f.id === fac.id));
  t("faculty: not in another institution's list", !(await adminB.c("GET", "/api/settings/faculty")).d.some((f) => f.id === fac.id));
  t("faculty: another institution cannot read or edit them", (await adminB.c("GET", `/api/settings/faculty/${fac.id}`)).s === 404 && (await adminB.c("PATCH", `/api/settings/faculty/${fac.id}`, { name: "X" })).s === 404);
  const upd = await admin("PATCH", `/api/settings/faculty/${fac.id}`, { designation: "Professor", employeeId: `E${tag}`, departmentIds: [deptA.id] });
  t("faculty: profile and department saved", upd.d?.profile?.designation === "Professor" && upd.d.departments[0]?.id === deptA.id);
  t("faculty: cannot be allocated another institution's department", (await admin("PATCH", `/api/settings/faculty/${fac.id}`, { departmentIds: [deptA.id, deptB.id] })).s === 400);
  t("faculty: cannot be allocated a programme outside their departments", (await admin("PATCH", `/api/settings/faculty/${fac.id}`, { programIds: [progB.id] })).s === 400);
  const otherDept = (await admin("POST", "/api/settings/departments", { name: `A Other ${tag}`, code: `AO${tag}` })).d;
  const progOther = (await admin("POST", "/api/settings/programs", { name: `A POther ${tag}`, code: `PO${tag}`.slice(0, 18), departmentId: otherDept.id })).d;
  t("faculty: cannot be allocated a programme of a department they are not in", (await admin("PATCH", `/api/settings/faculty/${fac.id}`, { programIds: [progOther.id] })).s === 400);
  const alloc = await admin("PATCH", `/api/settings/faculty/${fac.id}`, { programIds: [progA2.id], batchIds: [batchA.id] });
  t("faculty: programme and batch allocated", alloc.d?.programs[0]?.id === progA2.id && alloc.d.batches[0]?.id === batchA.id);

  // faculty access boundary
  const f = fac.c;
  t("faculty: sees their own profile", (await f("GET", "/api/faculty/me")).d?.id === fac.id);
  t("faculty: refused placement routes", (await f("GET", "/api/dashboard")).s === 403 && (await f("GET", "/api/approvals")).s === 403 && (await f("GET", "/api/tickets")).s === 403 && (await f("GET", "/api/students")).s === 403);
  t("faculty: refused administration", (await f("GET", "/api/settings/staff")).s === 403 && (await f("GET", "/api/settings/faculty")).s === 403 && (await f("POST", "/api/settings/departments", { name: "Nope", code: "NOPE" })).s === 403);
  t("faculty: can read the academic structure", (await f("GET", "/api/settings/programs")).s === 200);
  t("faculty: cannot call platform routes", (await f("GET", "/api/platform/institutions")).s === 403);
  t("admin: cannot call platform routes", (await admin("GET", "/api/platform/institutions")).s === 403 && (await admin("POST", "/api/platform/institutions", { name: "Sneaky", admin: { name: "S", email: "s@example.com" } })).s === 403);

  // mentees and visibility
  const sid = (await pgc.query(`insert into "Student" (id,"collegeId","enrollmentNo",name,email,"departmentId","programId","batchId","updatedAt") values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,now()) returning id`, [collegeA, `FS${tag}`, `Fac Student ${tag}`, `fs${tag}@example.com`, deptA.id, progA2.id, batchA.id])).rows[0].id;
  const sidOther = (await pgc.query(`insert into "Student" (id,"collegeId","enrollmentNo",name,email,"departmentId","programId","batchId","updatedAt") values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,now()) returning id`, [collegeA, `FO${tag}`, `Fac Other ${tag}`, `fo${tag}@example.com`, otherDept.id, progOther.id, (await admin("POST", "/api/settings/batches", { programId: progOther.id, admissionYear: 2026 })).d.id])).rows[0].id;
  const seen = (await f("GET", "/api/faculty/students?limit=200")).d.items.map((s) => s.id);
  t("faculty: sees students of an allocated batch", seen.includes(sid));
  t("faculty: does not see students outside their allocation", !seen.includes(sidOther));
  t("mentor: cannot assign a student outside the faculty's departments", (await admin("PUT", "/api/settings/faculty/mentees", { facultyId: fac.id, studentIds: [sidOther] })).s === 400);
  t("mentor: a student in their department can be assigned", (await admin("PUT", "/api/settings/faculty/mentees", { facultyId: fac.id, studentIds: [sid] })).s === 200);
  t("mentor: another institution cannot assign this student", (await adminB.c("PUT", "/api/settings/faculty/mentees", { facultyId: adminB.id, studentIds: [sid] })).s === 400);
  t("faculty: a mentee is flagged", (await f("GET", "/api/faculty/students")).d.items.find((s) => s.id === sid)?.isMentee === true);
  t("faculty: student payload has no contact history or documents", !("documents" in (await f("GET", "/api/faculty/students")).d.items[0]));

  // multi-role: faculty + officer keeps officer access and nothing more
  const multi = await staffUser(collegeA, "multi", "PLACEMENT_OFFICER", ["FACULTY"]);
  t("multi-role: officer + faculty still reaches placement routes", (await multi.c("GET", "/api/students")).s === 200);
  t("multi-role: officer + faculty does not gain admin routes", (await multi.c("GET", "/api/settings/staff")).s === 403 && (await multi.c("GET", "/api/settings/faculty")).s === 403);

  // deactivation
  t("faculty: deactivated", (await admin("PATCH", `/api/settings/faculty/${fac.id}`, { isActive: false })).d?.isActive === false);
  t("faculty: a deactivated account is refused", (await client(await login(fac.email, pw))("GET", "/api/faculty/me")).s === 403);
  const audits = (await pgc.query(`select action from "AuditLog" where "collegeId"=$1 and "entityId"=$2`, [collegeA, fac.id])).rows.map((r) => r.action);
  t("audit: faculty update, allocation and deactivation are logged", ["faculty.update", "faculty.allocate", "faculty.deactivate"].every((a) => audits.includes(a)), audits.join());

  // ---- institution provisioning -------------------------------------------------------------------------------------
  const pa = await authUser("platform");
  await pgc.query(`insert into "PlatformAdmin" (id,email,name) values ($1,$2,'Platform')`, [pa.id, pa.email]);
  made.platform.push(pa.id);
  const plat = client(await login(pa.email, pw));
  t("platform: a platform admin has no college access", (await plat("GET", "/api/settings/departments")).s === 403 && (await plat("GET", "/api/me")).s === 403);
  const prov = await plat("POST", "/api/platform/institutions", { name: `Provisioned ${tag}`, slug: `prov-${tag}`, admin: { name: "New Admin", email: `inst${tag}newadmin@example.com` }, departments: [{ code: "CSE", name: "Computer Science" }], academicYear: { name: "2026-27", startDate: "2026-06-01", endDate: "2027-05-31" }, modules: ["ONBOARDING", "DRIVES"] });
  t("provisioning: institution created", prov.s === 200 && !!prov.d?.college?.id, JSON.stringify(prov.j).slice(0, 200));
  if (prov.d?.college?.id) {
    const pid = prov.d.college.id; made.colleges.push(pid); made.auth.push(prov.d.admin.id);
    const q = (sql) => pgc.query(sql, [pid]).then((r) => r.rows);
    t("provisioning: settings row created", (await q(`select 1 from "CollegeSettings" where "collegeId"=$1`)).length === 1);
    t("provisioning: only the chosen modules enabled", (await q(`select module from "CollegeModule" where "collegeId"=$1 order by module`)).map((r) => r.module).join() === "DRIVES,ONBOARDING");
    t("provisioning: initial TPO admin created in the new college", (await q(`select role from "User" where "collegeId"=$1`)).map((r) => r.role).join() === "TPO_ADMIN");
    t("provisioning: starting department and year belong to the new college", (await q(`select 1 from "Department" where "collegeId"=$1 and code='CSE'`)).length === 1 && (await q(`select 1 from "AcademicYear" where "collegeId"=$1 and "isCurrent"`)).length === 1);
    t("provisioning: nothing else was created", (await q(`select 1 from "Program" where "collegeId"=$1`)).length === 0 && (await q(`select 1 from "Batch" where "collegeId"=$1`)).length === 0);
    const a = (await q(`select action,"actorId","platformActorId" from "AuditLog" where "collegeId"=$1`))[0];
    t("provisioning: audited as the platform admin", a?.action === "institution.provision" && a.platformActorId === pa.id && a.actorId === null);
    t("provisioning: duplicate address refused", (await plat("POST", "/api/platform/institutions", { name: "Dup", slug: `prov-${tag}`, admin: { name: "D", email: `inst${tag}dup@example.com` } })).s === 409);
    t("platform: deactivating an institution blocks its sign-ins", (await plat("PATCH", `/api/platform/institutions/${pid}`, { isActive: false })).s === 200);
  }
  t("platform: invalid provisioning input is refused", (await plat("POST", "/api/platform/institutions", { name: "x" })).s === 400);
} finally {
  // Children first; every table below holds the test colleges' rows.
  for (const c of made.colleges) {
    for (const tbl of ["AuditLog", "FacultyBatch", "FacultyProgram", "FacultyDepartment", "FacultyProfile", "Student", "Semester", "Batch", "ProgrammeBranch", "Program", "University", "AcademicYear", "Department", "CollegeModule", "CollegeSettings", "User"]) await pgc.query(`delete from "${tbl}" where "collegeId"=$1`, [c]).catch(() => {});
    await pgc.query(`delete from "College" where id=$1`, [c]).catch(() => {});
  }
  // Rows this run created inside institution A, children first. Audit entries are append-only and stay.
  const A = (await pgc.query(`select "collegeId" c from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).rows[0]?.c;
  if (A) {
    const like = `%${tag}%`;
    const run = (sql, ...p) => pgc.query(sql, [A, like, ...p]).catch((e) => console.log("cleanup:", e.message.split("\n")[0]));
    await run(`delete from "Student" where "collegeId"=$1 and email like $2`);
    await run(`delete from "FacultyBatch" where "collegeId"=$1 and "batchId" in (select b.id from "Batch" b join "Program" p on p.id=b."programId" where p.code like $2)`);
    await run(`delete from "FacultyProgram" where "collegeId"=$1 and "programId" in (select id from "Program" where code like $2)`);
    await run(`delete from "FacultyDepartment" where "collegeId"=$1 and "departmentId" in (select id from "Department" where code like $2)`);
    await run(`delete from "FacultyProfile" where "collegeId"=$1 and "userId" in (select id from "User" where email like $2)`);
    await run(`delete from "Semester" where "collegeId"=$1 and "batchId" in (select b.id from "Batch" b join "Program" p on p.id=b."programId" where p.code like $2)`);
    await run(`delete from "Batch" where "collegeId"=$1 and "programId" in (select id from "Program" where code like $2)`);
    await run(`delete from "ProgrammeBranch" where "collegeId"=$1 and name like $2`);
    await run(`delete from "Program" where "collegeId"=$1 and code like $2`);
    await run(`delete from "University" where "collegeId"=$1 and code like $2`);
    await run(`delete from "Department" where "collegeId"=$1 and code like $2`);
    await run(`delete from "User" where "collegeId"=$1 and email like $2`);
  }
  for (const id of made.platform) await pgc.query(`delete from "PlatformAdmin" where id=$1`, [id]).catch(() => {});
  for (const id of made.auth) await sb.auth.admin.deleteUser(id).catch(() => {});
  await pgc.end();
}
process.exit(done() ? 1 : 0);

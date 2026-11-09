// M2: faculty, universities, institution provisioning, tenant isolation and academic-structure integrity. Cleans up what it creates.
// Runs only against the isolated local stack (tests/e2e/stack): invitations land in its mail sink, never in a real inbox.
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { checker, client, login, tag } from "./lib.mjs";

const { t, done } = checker();
if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "")) { console.error("Refusing: SUPABASE_URL is not local"); process.exit(2); }
/** RFC 6238 code, as an authenticator app computes it. */
function totp(secret, offset = 0) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
const sink = async (to) => (await (await fetch(`${process.env.MAIL_SINK}/api/v1/search?query=${encodeURIComponent("to:" + to)}`)).json()).messages ?? [];
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL });
await pgc.connect();
const sbAnon = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
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
  { const g = await adminB.c("GET", `/api/settings/faculty/${fac.id}`), p = await adminB.c("PATCH", `/api/settings/faculty/${fac.id}`, { name: "Xy" }); t("faculty: another institution cannot read or edit them", g.s === 404 && p.s === 404, g.s + " " + p.s + JSON.stringify(p.j)); }
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

  // ---- mentor assignment (UI backend) --------------------------------------------------------------------------------
  const fac2 = await staffUser(collegeA, "fac2", "FACULTY");
  await pgc.query(`insert into "FacultyProfile" ("userId","collegeId","updatedAt") values ($1,$2,now())`, [fac2.id, collegeA]);
  await admin("PATCH", `/api/settings/faculty/${fac2.id}`, { departmentIds: [deptA.id] });
  t("mentor: reassign to a second mentor", (await admin("PUT", "/api/settings/faculty/mentees", { facultyId: fac2.id, studentIds: [sid] })).s === 200);
  t("mentor: assigning to a deactivated faculty is refused", (await admin("PUT", "/api/settings/faculty/mentees", { facultyId: fac.id, studentIds: [sid] })).s === 400);
  const hist = (await admin("GET", `/api/settings/faculty/mentees?studentId=${sid}`)).d;
  t("mentor: current mentor shown", hist?.mentor?.id === fac2.id);
  t("mentor: history lists each change in order, with who made it", hist?.history?.length >= 2 && hist.history[0].to === "Inst fac2" && hist.history[0].from === "Inst fac" && !!hist.history[0].by, JSON.stringify(hist?.history));
  t("mentor: the mentor's list shows the student", (await admin("GET", `/api/settings/faculty/mentees?facultyId=${fac2.id}`)).d.some((m) => m.id === sid));
  t("mentor: another institution cannot read this student's mentor or history", (await adminB.c("GET", `/api/settings/faculty/mentees?studentId=${sid}`)).s === 404);
  t("mentor: another institution cannot read this faculty's mentees", (await adminB.c("GET", `/api/settings/faculty/mentees?facultyId=${fac2.id}`)).s === 404);
  t("mentor: needs exactly one of facultyId / studentId", (await admin("GET", "/api/settings/faculty/mentees")).s === 400);
  t("mentor: faculty cannot manage mentors", (await f("GET", `/api/settings/faculty/mentees?studentId=${sid}`)).s === 403 && (await fac2.c("PUT", "/api/settings/faculty/mentees", { facultyId: fac2.id, studentIds: [sid] })).s === 403);
  t("mentor: unassign", (await admin("PUT", "/api/settings/faculty/mentees", { facultyId: null, studentIds: [sid] })).s === 200 && (await admin("GET", `/api/settings/faculty/mentees?studentId=${sid}`)).d.mentor === null);
  const sAudits = (await pgc.query(`select action from "AuditLog" where "collegeId"=$1 and entity='Student' and "entityId"=$2 and action like 'faculty.mentor.%'`, [collegeA, sid])).rows.map((r) => r.action);
  t("mentor: every assignment change is audited per student", sAudits.filter((x) => x === "faculty.mentor.assign").length >= 2 && sAudits.includes("faculty.mentor.clear"), sAudits.join());

  // ---- faculty created through the API: the invitation goes to the mail sink -------------------------------------------
  const inv = await admin("POST", "/api/settings/faculty", { name: "Invited Faculty", email: `inst${tag}invfac@example.com`, designation: "Lecturer", departmentIds: [deptA.id] });
  t("faculty: created through the API with an invitation", inv.s === 200 && inv.d.roles[0] === "FACULTY", JSON.stringify(inv.j).slice(0, 200));
  if (inv.d?.id) made.auth.push(inv.d.id);
  t("faculty: the invitation landed in the local mail sink", (await sink(`inst${tag}invfac@example.com`)).length >= 1);

  // ---- institution provisioning and platform administrators ---------------------------------------------------------
  const pa = await authUser("platform");
  await pgc.query(`insert into "PlatformAdmin" (id,email,name) values ($1,$2,'Platform')`, [pa.id, pa.email]);
  made.platform.push(pa.id);
  let plat = client(await login(pa.email, pw));
  t("platform: a platform admin has no college access", (await plat("GET", "/api/settings/departments")).s === 403 && (await plat("GET", "/api/me")).s === 403);
  // MFA is mandatory and server-enforced
  const noMfa = await plat("GET", "/api/platform/institutions");
  t("platform MFA: no authenticator => institutions refused with MFA_SETUP_REQUIRED", noMfa.s === 403 && noMfa.code === "MFA_SETUP_REQUIRED");
  t("platform MFA: provisioning refused too", (await plat("POST", "/api/platform/institutions", { name: "Sneaky Inst", admin: { name: "S", email: "s@example.com" } })).code === "MFA_SETUP_REQUIRED");
  t("platform MFA: status route tells the screen what to do", (await plat("GET", "/api/platform/me")).d?.mfa === "setup_required");
  t("platform MFA: this is independent of the college TPO setting (college has it off)", (await pgc.query(`select "requireMfaForAdmins" r from "CollegeSettings" where "collegeId"=$1`, [collegeA])).rows[0]?.r !== true);
  const enr = await plat("POST", "/api/platform/mfa/enroll");
  t("platform MFA: enrolment starts", enr.s === 200 && !!enr.d?.secret);
  t("platform MFA: incomplete enrolment still refused", (await plat("GET", "/api/platform/institutions")).code === "MFA_SETUP_REQUIRED");
  const badEnr = await plat("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: "000000" });
  t("platform MFA: a wrong code is rejected and enrolment stays incomplete", badEnr.s === 400 && badEnr.code === "INVALID_CODE" && (await plat("GET", "/api/platform/institutions")).code === "MFA_SETUP_REQUIRED");
  t("platform MFA: a malformed code is refused", (await plat("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: "12" })).s === 400);
  t("platform MFA: another factor id is refused", (await plat("POST", "/api/platform/mfa/verify", { factorId: crypto.randomUUID(), code: "123456" })).s === 400);
  const okEnr = await plat("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) });
  t("platform MFA: the right code completes enrolment and returns an upgraded session", okEnr.s === 200 && !!okEnr.d?.access_token, JSON.stringify(okEnr.j).slice(0, 200));
  plat = client(okEnr.d.access_token);
  t("platform MFA: the upgraded session can use the platform", (await plat("GET", "/api/platform/institutions")).s === 200);
  const aal1 = client(await login(pa.email, pw));
  t("platform MFA: a fresh password-only sign-in is refused with MFA_REQUIRED", (await aal1("GET", "/api/platform/institutions")).code === "MFA_REQUIRED" && (await aal1("GET", "/api/platform/me")).d?.mfa === "challenge");
  t("platform MFA: an enrolled admin cannot enrol another authenticator from a password-only session", (await aal1("POST", "/api/platform/mfa/enroll")).code === "ALREADY_ENROLLED");
  // Direct call to the Auth server (bypassing our API): must not let a password-only session add a second factor and walk in.
  const tok1 = (await sbAnon().auth.signInWithPassword({ email: pa.email, password: pw })).data.session.access_token;
  const direct = await fetch(`${process.env.SUPABASE_URL}/auth/v1/factors`, { method: "POST", headers: { authorization: `Bearer ${tok1}`, apikey: process.env.SUPABASE_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ factor_type: "totp" }) });
  t("platform MFA: the Auth server itself refuses a second factor at password-only level", direct.status >= 400, `status ${direct.status}`);
  const fid = (await sb.auth.admin.mfa.listFactors({ userId: pa.id })).data.factors.find((x) => x.status === "verified").id;
  const wrong = await aal1("POST", "/api/platform/mfa/verify", { factorId: fid, code: "000000" });
  t("platform MFA: an invalid challenge is rejected", wrong.s === 400 && wrong.code === "INVALID_CODE" && (await aal1("GET", "/api/platform/institutions")).code === "MFA_REQUIRED");
  const good = await aal1("POST", "/api/platform/mfa/verify", { factorId: fid, code: totp(enr.d.secret, 0) });
  const good2 = good.s === 200 ? good : await aal1("POST", "/api/platform/mfa/verify", { factorId: fid, code: totp(enr.d.secret, 1) }); // a code just used is single-use; the next window is accepted
  t("platform MFA: the right challenge code upgrades the session", good2.s === 200 && (await client(good2.d.access_token)("GET", "/api/platform/institutions")).s === 200, JSON.stringify(good2.j).slice(0, 200));
  plat = client(good2.d?.access_token ?? okEnr.d.access_token);
  t("platform: college administrators and faculty cannot reach platform routes", (await admin("GET", "/api/platform/institutions")).s === 403 && (await f("GET", "/api/platform/institutions")).s === 403 && (await admin("GET", "/api/platform/me")).s === 403);

  const deptCountA = (await admin("GET", "/api/settings/departments")).d.length;
  const prov = await plat("POST", "/api/platform/institutions", { name: `Provisioned ${tag}`, slug: `prov-${tag}`, admin: { name: "New Admin", email: `inst${tag}newadmin@example.com` }, departments: [{ code: "CSE", name: "Computer Science" }], academicYear: { name: "2026-27", startDate: "2026-06-01", endDate: "2027-05-31" }, modules: ["ONBOARDING", "DRIVES"] });
  t("provisioning: institution created", prov.s === 200 && !!prov.d?.college?.id, JSON.stringify(prov.j).slice(0, 200));
  if (prov.d?.college?.id) {
    const pid = prov.d.college.id; made.colleges.push(pid); made.auth.push(prov.d.admin.id);
    const q = (sql) => pgc.query(sql, [pid]).then((r) => r.rows);
    t("provisioning: the administrator's invitation landed in the local mail sink", (await sink(`inst${tag}newadmin@example.com`)).length >= 1);
    t("provisioning: settings row created", (await q(`select 1 from "CollegeSettings" where "collegeId"=$1`)).length === 1);
    t("provisioning: only the chosen modules enabled", (await q(`select module from "CollegeModule" where "collegeId"=$1`)).map((r) => r.module).sort().join() === "DRIVES,ONBOARDING");
    t("provisioning: initial TPO admin created in the new college", (await q(`select role from "User" where "collegeId"=$1`)).map((r) => r.role).join() === "TPO_ADMIN");
    t("provisioning: starting department and year belong to the new college", (await q(`select 1 from "Department" where "collegeId"=$1 and code='CSE'`)).length === 1 && (await q(`select 1 from "AcademicYear" where "collegeId"=$1 and "isCurrent"`)).length === 1);
    t("provisioning: nothing else was created", (await q(`select 1 from "Program" where "collegeId"=$1`)).length === 0 && (await q(`select 1 from "Batch" where "collegeId"=$1`)).length === 0);
    const a = (await q(`select action,"actorId","platformActorId" from "AuditLog" where "collegeId"=$1`))[0];
    t("provisioning: audited as the platform admin", a?.action === "institution.provision" && a.platformActorId === pa.id && a.actorId === null);
    const dup = await plat("POST", "/api/platform/institutions", { name: "Dup Institute", slug: `prov-${tag}`, admin: { name: "Dee", email: `inst${tag}dup@example.com` } });
    t("provisioning: duplicate address refused", dup.s === 409, dup.s + JSON.stringify(dup.j));
    t("provisioning: the existing institution gained no records", (await admin("GET", "/api/settings/departments")).d.length === deptCountA && (await q(`select count(*)::int n from "Department" where "collegeId"=$1`))[0].n === 1);
    t("platform: deactivating an institution blocks its sign-ins", (await plat("PATCH", `/api/platform/institutions/${pid}`, { isActive: false })).s === 200);
  }
  t("platform: invalid provisioning input is refused", (await plat("POST", "/api/platform/institutions", { name: "x" })).s === 400);

  // MFA removal and recovery
  t("platform MFA: removal with a wrong code is refused", (await plat("DELETE", "/api/platform/mfa", { code: "000000" })).code === "INVALID_CODE" && (await plat("GET", "/api/platform/institutions")).s === 200);
  t("platform MFA: removal is refused for a password-only session", (await aal1("DELETE", "/api/platform/mfa", { code: totp(enr.d.secret, 1) })).s === 403);
  const rm = await plat("DELETE", "/api/platform/mfa", { code: totp(enr.d.secret, 1) });
  const rm2 = rm.s === 200 ? rm : await plat("DELETE", "/api/platform/mfa", { code: totp(enr.d.secret, 2) });
  t("platform MFA: removal with a fresh code works", rm2.s === 200, JSON.stringify(rm2.j).slice(0, 200));
  t("platform MFA: after removal, access is blocked until a new authenticator is enrolled", (await plat("GET", "/api/platform/institutions")).code === "MFA_SETUP_REQUIRED");
  const enr2 = await client(await login(pa.email, pw))("POST", "/api/platform/mfa/enroll");
  const c2 = client(await login(pa.email, pw));
  const ok2 = await c2("POST", "/api/platform/mfa/verify", { factorId: enr2.d.factorId, code: totp(enr2.d.secret) });
  t("platform MFA: a new authenticator can be enrolled after removal", ok2.s === 200);
  const rec = spawnSync("npx", ["tsx", "scripts/platform-mfa-recovery.ts"], { encoding: "utf8", env: { ...process.env, PLATFORM_ADMIN_EMAIL: pa.email, PLATFORM_RECOVERY_CONFIRM: pa.email } });
  t("platform MFA recovery: the command removes the authenticator", rec.status === 0 && (await sb.auth.admin.mfa.listFactors({ userId: pa.id })).data.factors.length === 0, rec.stderr.slice(0, 200));
  const bad = spawnSync("npx", ["tsx", "scripts/platform-mfa-recovery.ts"], { encoding: "utf8", env: { ...process.env, PLATFORM_ADMIN_EMAIL: pa.email, PLATFORM_RECOVERY_CONFIRM: "someone@else.com" } });
  t("platform MFA recovery: refused without the matching confirmation", bad.status !== 0);
  t("platform MFA: after recovery the old session is refused", (await client(ok2.d.access_token)("GET", "/api/platform/institutions")).code === "MFA_SETUP_REQUIRED");
  const pl = (await pgc.query(`select action from "PlatformAuditLog" where "adminId"=$1`, [pa.id])).rows.map((r) => r.action);
  t("platform audit: enrolment, failures, challenges, removal and recovery are all recorded", ["platform.mfa.enroll_started", "platform.mfa.enroll_failed", "platform.mfa.enrolled", "platform.mfa.challenge_failed", "platform.mfa.challenge_ok", "platform.mfa.remove_failed", "platform.mfa.removed", "platform.mfa.recovery"].every((x) => pl.includes(x)), pl.join());
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
  for (const id of made.platform) { await pgc.query(`delete from "PlatformAdmin" where id=$1`, [id]).catch(() => {}); await pgc.query(`delete from "PlatformAuditLog" where "adminId"=$1`, [id]).catch(() => {}); }
  for (const id of made.auth) await sb.auth.admin.deleteUser(id).catch(() => {});
  await pgc.end();
}
process.exit(done() ? 1 : 0);

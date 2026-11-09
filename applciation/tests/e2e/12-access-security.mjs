// M1: multiple roles, sign-in history, admin access reset and two-step sign-in for administrators. Cleans up what it creates.
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { B, checker, client, login, tag } from "./lib.mjs";

const { t, done } = checker();
const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL });
await pgc.connect();
const made = { auth: [], users: [], students: [], dept: null };
const pw = `Acc-${tag}-pw1`;

/** RFC 6238 time-based code, the same as an authenticator app computes. */
function totp(secret) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
const userClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function newStaff(label, role, extraRoles = [], departmentId = null) {
  const email = `acc${tag}${label}@example.com`;
  const { data, error } = await sbAdmin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw new Error(error.message);
  made.auth.push(data.user.id);
  const college = (await pgc.query(`select "collegeId" c from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).rows[0].c;
  await pgc.query(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","departmentId","updatedAt") values ($1,$2,$3,$4,$5,$6::"Role"[],$7,now())`, [data.user.id, college, email, `Acc ${label}`, role, extraRoles, departmentId]);
  made.users.push(data.user.id);
  return { id: data.user.id, email };
}
const tokenFor = async (email) => login(email, pw);

try {
  const admin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
  const depts = (await admin("GET", "/api/settings/departments")).d;
  const temp = await admin("POST", "/api/settings/departments", { name: `Acc Dept ${tag}`, code: `AC${tag}`.slice(0, 12) });
  made.dept = temp.d.id;
  const mainDept = depts.find((d) => d.isActive) ?? depts[0];

  // a student so that "all departments" has something to show
  const [batches, programs] = await Promise.all(["batches", "programs"].map((x) => admin("GET", `/api/settings/${x}`).then((r) => r.d)));
  const batch = batches.find((b) => b.isActive && b.programId && programs.find((p) => p.id === b.programId)?.departmentId) ?? batches.find((b) => b.isActive);
  const dep = programs.find((p) => p.id === batch.programId)?.departmentId ?? mainDept.id;
  const stu = await admin("POST", "/api/students/invitations", { name: `Acc Student ${tag}`, enrollmentNo: `ACC${tag}`, email: `accstu${tag}@example.com`, departmentId: dep, batchId: batch.id, programId: batch.programId ?? null, admissionYear: batch.admissionYear ?? batch.startYear });
  made.students.push(stu.d.studentId);

  // --- 1. multiple roles
  const multi = await newStaff("m", "PLACEMENT_OFFICER", ["DEPARTMENT_COORDINATOR"], made.dept);
  const pure = await newStaff("p", "DEPARTMENT_COORDINATOR", [], made.dept);
  const mt = client(await tokenFor(multi.email)), pt = client(await tokenFor(pure.email));
  const me = await mt("GET", "/api/me");
  t("roles: /api/me lists every role, main first", me.s === 200 && JSON.stringify(me.d.roles) === JSON.stringify(["PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"]) && me.d.role === "PLACEMENT_OFFICER", JSON.stringify(me.j));
  const allSum = (await admin("GET", "/api/students/summary")).d.total;
  t("roles: officer + coordinator is NOT limited to the coordinator's department", (await mt("GET", "/api/students/summary")).d.total === allSum && allSum > 0, `${(await mt("GET", "/api/students/summary")).d?.total} vs ${allSum}`);
  t("roles: a pure coordinator IS limited to their department", (await pt("GET", "/api/students/summary")).d.total === 0);
  t("roles: officer rights from the main role apply (can invite students)", (await mt("POST", "/api/students/invitations", {})).s === 400);
  t("roles: a pure coordinator cannot invite students", (await pt("POST", "/api/students/invitations", {})).s === 403);
  t("roles: only admins manage staff (multi-role officer is refused)", (await mt("GET", "/api/settings/staff")).s === 403);
  const list = (await admin("GET", "/api/settings/staff")).d;
  t("roles: staff list returns roles arrays", list.find((u) => u.id === multi.id)?.roles?.length === 2);
  t("roles: admin can change roles (add admin to the officer)", (await admin("PATCH", `/api/settings/staff/${multi.id}`, { roles: ["PLACEMENT_OFFICER", "TPO_ADMIN"], departmentId: null })).d?.roles?.includes("TPO_ADMIN"));
  t("roles: the new admin role takes effect (can read staff)", (await client(await tokenFor(multi.email))("GET", "/api/settings/staff")).s === 200);
  t("roles: coordinator role needs a department", (await admin("PATCH", `/api/settings/staff/${pure.id}`, { roles: ["DEPARTMENT_COORDINATOR"], departmentId: null })).s === 400);
  t("roles: at least one role is required", (await admin("PATCH", `/api/settings/staff/${pure.id}`, { roles: [] })).s === 400);
  t("roles: a department is refused when there is no coordinator role", (await admin("PATCH", `/api/settings/staff/${pure.id}`, { roles: ["PLACEMENT_OFFICER"], departmentId: made.dept })).s === 400);
  t("roles: changes are audited with the full role list", (await pgc.query(`select count(*)::int n from "AuditLog" where action='staff.update' and "entityId"=$1 and after->'roles' is not null`, [multi.id])).rows[0].n > 0);

  // --- 2. sign-in history
  const tok = await tokenFor(pure.email);
  const pc = client(tok);
  const rec1 = await fetch(B + "/api/auth/login-event", { method: "POST", headers: { authorization: `Bearer ${tok}`, "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36" } });
  const rec2 = await fetch(B + "/api/auth/login-event", { method: "POST", headers: { authorization: `Bearer ${tok}` } });
  t("history: a sign-in is recorded", rec1.status === 200 && (await rec1.json()).data.recorded === true);
  t("history: recording the same session twice adds nothing", rec2.status === 200 && (await pgc.query(`select count(*)::int n from "LoginEvent" where "userId"=$1`, [pure.id])).rows[0].n === 1);
  t("history: unauthenticated calls are refused", (await fetch(B + "/api/auth/login-event", { method: "POST" })).status === 401);
  const mine = await fetch(B + "/api/me/logins", { headers: { authorization: `Bearer ${tok}` } }).then((r) => r.json());
  t("history: I can see my own sign-ins", mine.data.items.length === 1 && mine.data.items[0].method === "password" && /Chrome/.test(mine.data.items[0].userAgent));
  const theirs = await admin("GET", `/api/settings/staff/${pure.id}/logins`);
  t("history: an admin can see a staff member's sign-ins", theirs.s === 200 && theirs.d.items.length === 1);
  t("history: other staff cannot", (await pc("GET", `/api/settings/staff/${multi.id}/logins`)).s === 403);

  // a student: accept an invitation, sign in, and the officer sees it
  const link = (await admin("POST", `/api/students/${stu.d.studentId}/invitation/link`)).d.link;
  const inviteTok = new URLSearchParams(link.split("#")[1]).get("t");
  const acc = await fetch(B + "/api/invitations/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: inviteTok, email: `accstu${tag}@example.com`, password: pw }) });
  const stuUser = (await pgc.query(`select "userId" u from "Student" where id=$1`, [stu.d.studentId])).rows[0].u; if (stuUser) made.auth.push(stuUser);
  const stuTok = await login(`accstu${tag}@example.com`, pw);
  await fetch(B + "/api/auth/login-event", { method: "POST", headers: { authorization: `Bearer ${stuTok}` } });
  const sh = await admin("GET", `/api/students/${stu.d.studentId}/logins`);
  t("history: a student's sign-in is recorded and visible to the officer", acc.status === 200 && sh.s === 200 && sh.d.items.length === 1);
  t("history: a student cannot read staff history", [401, 403].includes((await client(stuTok)("GET", `/api/settings/staff/${pure.id}/logins`)).s));

  // --- 3. admin reset
  t("reset: an admin cannot reset their own access here", (await admin("POST", `/api/settings/staff/${(await pgc.query(`select id from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).rows[0].id}/reset-access`, { actions: ["mfa"] })).s === 400);
  t("reset: only admins can reset staff access", (await pc("POST", `/api/settings/staff/${multi.id}/reset-access`, { actions: ["mfa"] })).s === 403);
  t("reset: an action is required", (await admin("POST", `/api/settings/staff/${pure.id}/reset-access`, { actions: [] })).s === 400);
  const rs = await admin("POST", `/api/students/${stu.d.studentId}/reset-access`);
  t("reset: a student with a login can be sent a password reset (or the email service says why not)", rs.s === 200 ? rs.d.done[0] === "password" : rs.code === "EMAIL_FAILED", `${rs.s} ${rs.code} ${rs.j?.error?.message}`);
  const stu2 = await admin("POST", "/api/students/invitations", { name: `Acc Two ${tag}`, enrollmentNo: `ACD${tag}`, email: `accstu2${tag}@example.com`, departmentId: dep, batchId: batch.id, programId: batch.programId ?? null, admissionYear: batch.admissionYear ?? batch.startYear });
  made.students.push(stu2.d.studentId);
  t("reset: a student who has not accepted is told to resend the invitation instead", (await admin("POST", `/api/students/${stu2.d.studentId}/reset-access`)).s === 409);

  // --- 4. two-step sign-in for administrators
  const adm = await newStaff("a", "TPO_ADMIN");
  const c1 = userClient();
  await c1.auth.signInWithPassword({ email: adm.email, password: pw });
  const enr = await c1.auth.mfa.enroll({ factorType: "totp", friendlyName: "test" });
  if (enr.error) { t("mfa: Supabase allows authenticator enrolment (turn on MFA/TOTP in Auth settings)", false, enr.error.message); throw new Error("MFA not available"); }
  const ver = await c1.auth.mfa.challengeAndVerify({ factorId: enr.data.id, code: totp(enr.data.totp.secret) });
  t("mfa: an authenticator app can be enrolled and confirmed", !ver.error, ver.error?.message);

  const c2 = userClient();
  const s1 = await c2.auth.signInWithPassword({ email: adm.email, password: pw });
  const aal1 = client(s1.data.session.access_token);
  const meA = await aal1("GET", "/api/me");
  t("mfa: before the code, /api/me still answers and says a code is needed", meA.s === 200 && meA.d.mfa === "challenge", JSON.stringify(meA.j));
  const blocked = await aal1("GET", "/api/students");
  t("mfa: before the code, every other staff API is refused (MFA_REQUIRED)", blocked.s === 403 && blocked.code === "MFA_REQUIRED", `${blocked.s} ${blocked.code}`);
  t("mfa: the same applies to admin-only settings", (await aal1("GET", "/api/settings/staff")).code === "MFA_REQUIRED");
  const lev = await c2.auth.mfa.getAuthenticatorAssuranceLevel();
  t("mfa: Supabase reports a second step is due", lev.data.nextLevel === "aal2" && lev.data.currentLevel === "aal1");
  const bad = await c2.auth.mfa.challengeAndVerify({ factorId: enr.data.id, code: "000000" });
  t("mfa: a wrong code is refused", !!bad.error);
  const good = await c2.auth.mfa.challengeAndVerify({ factorId: enr.data.id, code: totp(enr.data.totp.secret) });
  const aal2 = client((await c2.auth.getSession()).data.session.access_token);
  t("mfa: after the right code the session is trusted", !good.error && (await aal2("GET", "/api/students")).s === 200 && (await aal2("GET", "/api/me")).d.mfa === "ok");
  const ev = await fetch(B + "/api/auth/login-event", { method: "POST", headers: { authorization: `Bearer ${(await c2.auth.getSession()).data.session.access_token}` } });
  t("mfa: the sign-in history notes the second step", ev.status === 200 && (await pgc.query(`select bool_or(mfa) m from "LoginEvent" where "userId"=$1`, [adm.id])).rows[0].m === true);
  t("mfa: a person without the admin role is never asked for it", (await pt("GET", "/api/me")).d.mfa === "not_applicable");

  const turnOn = await aal2("PATCH", "/api/settings/security", { requireMfaForAdmins: true });
  t("mfa: an admin with an authenticator can require it for all admins", turnOn.s === 200 && turnOn.d.requireMfaForAdmins === true, JSON.stringify(turnOn.j));
  const seedTry = await admin("GET", "/api/students");
  t("mfa: once required, an admin with no authenticator app is told to set one up", seedTry.s === 403 && seedTry.code === "MFA_SETUP_REQUIRED", `${seedTry.s} ${seedTry.code}`);
  t("mfa: /api/me still works so the screen can send them to set it up", (await admin("GET", "/api/me")).d.mfa === "setup_required");
  t("mfa: they cannot switch the requirement off or on without their own app", (await admin("PATCH", "/api/settings/security", { requireMfaForAdmins: false })).code === "MFA_SETUP_REQUIRED");
  const turnOff = await aal2("PATCH", "/api/settings/security", { requireMfaForAdmins: false });
  t("mfa: an admin who has it can switch the requirement off again", turnOff.s === 200 && (await admin("GET", "/api/students")).s === 200);

  const rm = await aal2("POST", `/api/settings/staff/${multi.id}/reset-access`, { actions: ["mfa"] });
  t("reset: removing an authenticator app works even if the person has none", rm.s === 200 && rm.d.done.includes("mfa"));
  const lost = await aal2("POST", `/api/settings/staff/${adm.id}/reset-access`, { actions: ["mfa"] });
  t("reset: self-reset of the admin's own app is refused", lost.s === 400);
  // another admin removes the lost phone
  const ownerClient = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
  const rmAdm = await ownerClient("POST", `/api/settings/staff/${adm.id}/reset-access`, { actions: ["mfa"] });
  const after = userClient(); const s3 = await after.auth.signInWithPassword({ email: adm.email, password: pw });
  await new Promise((r) => setTimeout(r, 500));
  t("reset: after another admin removes the app, the person signs in with one step again and can enrol a new one", rmAdm.s === 200 && (await client(s3.data.session.access_token)("GET", "/api/me")).d.mfa === "setup_recommended");
  t("reset: it was audited", (await pgc.query(`select count(*)::int n from "AuditLog" where action='staff.access.reset' and "entityId"=$1`, [adm.id])).rows[0].n > 0);
} catch (e) {
  if (e.message !== "MFA not available") { console.log("FAIL unexpected error", e.message); process.exitCode = 1; }
} finally {
  try {
    await pgc.query(`update "CollegeSettings" set "requireMfaForAdmins"=false`);
    if (made.students.length) await pgc.query(`delete from "Student" where id = any($1)`, [made.students]);
    if (made.users.length) await pgc.query(`delete from "User" where id = any($1)`, [made.users]);
    if (made.auth.length) await pgc.query(`delete from "LoginEvent" where "userId" = any($1)`, [made.auth]);
    if (made.dept) await pgc.query(`delete from "Department" where id=$1`, [made.dept]);
    for (const id of made.auth) await sbAdmin.auth.admin.deleteUser(id).catch(() => {});
    const left = await sbAdmin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of left.data?.users ?? []) if (u.email?.startsWith(`acc${tag}`) || u.email?.startsWith(`accstu${tag}`) || u.email?.startsWith(`accstu2${tag}`)) await sbAdmin.auth.admin.deleteUser(u.id).catch(() => {});
  } finally { await pgc.end(); }
}
process.exit(done() || process.exitCode ? 1 : 0);

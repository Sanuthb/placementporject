// Gate 4 WP-02: access control, live. Every route and method in the generated guard matrix is called with every identity and compared with the guard declared in the code (ROLE-PERM-TC-020);
// the sweep cases (SRS-SECURITY-TC-015, 018, 021), recruiter and student record scoping (ROLE-PERM-TC-006/007, SRS-SECURITY-TC-020), privilege escalation (SRS-SECURITY-TC-033),
// handler-level department scoping for the coordinator, and the per-role capability checks against the SRS section 3 function lists (ROLE-PERM-TC-009..016).
// Safety: a mutating route is called only (a) by an identity that must be REFUSED, or (b) by an allowed identity when the handler parses a body (sent malformed, so it fails with 400 before doing anything)
// or the path carries an id (a random id that does not exist). Local Docker stack only, synthetic data, a local production server on :3126.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { recorder } from "./rec.mjs";
import { connect, mkInstitution, cleanupInstitutions, startProd, portFree, waitUp, caller, sleep } from "./lib/isolationFixtures.mjs";

const R = recorder("g4-12-access-control");
const WIN = process.platform === "win32";
const tag = Date.now().toString().slice(-6), pw = `Acc-${tag}-Pw1!`;
const env = await connect(); const { ins, rows, n1 } = env;
const made = { colleges: [], auth: [] }, madeAdmins = [];
if (!(await portFree(3126))) { console.error("port 3126 is busy"); process.exit(2); }
const srv = startProd(3126); const BASE = srv.base;
const matrix = JSON.parse(readFileSync("lib/permissionMatrix.data.json", "utf8"));
const STAFF = matrix.roles;

function totp(secret) { const AL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += AL.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
async function platformToken(email) {
  const r = spawnSync(WIN ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: WIN, env: { ...process.env, PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_NAME: "G4 Access Admin", PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr);
  madeAdmins.push((await rows(`select id from "PlatformAdmin" where email=$1`, [email]))[0].id);
  const c = caller(BASE, await env.login(email, pw)); const enr = await c("POST", "/api/platform/mfa/enroll");
  const v = await caller(BASE, (await env.login(email, pw)))("POST", "/api/platform/mfa/verify", { factorId: enr.j.data.factorId, code: totp(enr.j.data.secret) }); return v.j.data.access_token;
}

// which handlers read a body (so an allowed identity may safely be sent a malformed one)
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = d + "/" + n; if (statSync(p).isDirectory()) walk(p, out); else if (n === "route.ts") out.push(p); } return out; };
const parses = new Map();
for (const f of walk("app/api")) {
  const src = readFileSync(f, "utf8"); const path = "/" + f.replace(/\\/g, "/").replace(/^app\//, "").replace(/\/route\.ts$/, "").replace(/\[(\w+)\]/g, ":$1");
  const starts = [...src.matchAll(/(?:export )?const (GET|POST|PUT|PATCH|DELETE|adminRun) = (?:route|studentRoute|recruiterRoute|platformRoute)(?:<[^>]*>)?\(/g)];
  starts.forEach((m, i) => { const slice = src.slice(m.index, starts[i + 1]?.index ?? src.length); parses.set((m[1] === "adminRun" ? "POST" : m[1]) + " " + path, /parseBody\(|\.json\(\)|formData\(/.test(slice)); });
}

try {
  const A = await mkInstitution(env, "a", tag, pw, made), B = await mkInstitution(env, "b", tag, pw, made);
  // recruiters: two companies in A (R1, R2), one in B (RB); drives and applications
  const coA1 = await ins("Company", { collegeId: A.college, name: `ISO-A-${tag} CompanyOne` }), coA2 = await ins("Company", { collegeId: A.college, name: `ISO-A-${tag} CompanyTwo` }), coB1 = await ins("Company", { collegeId: B.college, name: `ISO-B-${tag} CompanyB` });
  const mkRec = async (x, col, co) => { const id = await env.mkAuth(`isorec${x}${tag}@example.com`, pw); made.auth.push(id); await ins("Recruiter", { id, collegeId: col, companyId: co, email: `isorec${x}${tag}@example.com`, name: `ISO-${x}-${tag} Recruiter` }); return { id, email: `isorec${x}${tag}@example.com` }; };
  const R1 = await mkRec("1", A.college, coA1), R2 = await mkRec("2", A.college, coA2), RB = await mkRec("b", B.college, coB1);
  const now = Date.now(), day = 864e5, mkDrive = (col, co, adm, role) => ins("Drive", { collegeId: col, companyId: co, role, jobType: "FULL_TIME", applicationDeadline: new Date(now + 10 * day), driveDate: new Date(now + 20 * day), createdById: adm, status: "PUBLISHED" });
  const dA1 = await mkDrive(A.college, coA1, A.admin.id, `ISO-A-${tag} Drive One`), dA2 = await mkDrive(A.college, coA2, A.admin.id, `ISO-A-${tag} Drive Two`), dB1 = await mkDrive(B.college, coB1, B.admin.id, `ISO-B-${tag} Drive B`);
  await ins("Application", { collegeId: A.college, driveId: dA1, studentId: A.students.s1.id, status: "SHORTLISTED" }); await ins("Application", { collegeId: A.college, driveId: dA2, studentId: A.students.s2.id, status: "SHORTLISTED" });
  const ok = await waitUp(BASE);
  const tok = { anon: null, garbage: "not.a.real.token", student: await A.tokenOf(A.students.s1), recruiter: await env.login(R1.email, pw), platform: await platformToken(`g4acc${tag}@example.com`), TPO_ADMIN: await A.tokenOf(A.admin) };
  for (const role of STAFF.slice(1)) tok[role] = await A.tokenOf(A.users[role]);
  const idents = Object.keys(tok);
  const call = (ident, method, path, rawBody) => fetch(BASE + path, { method, headers: { ...(tok[ident] ? { authorization: "Bearer " + tok[ident] } : {}), "content-type": "application/json" }, body: rawBody }).then(async (r) => ({ s: r.status, text: await r.text() })).catch(() => ({ s: 0, text: "" }));
  const asAny = (ident) => caller(BASE, tok[ident]);

  // ================= ROLE-PERM-TC-020: the live route-guard matrix =================
  const routes = matrix.routes.filter((r) => ["staff", "student", "recruiter", "platform"].includes(r.audience));
  const isAllowed = (r, ident) => r.audience === "staff" ? STAFF.includes(ident) && r.allowed.includes(ident) : r.audience === ident;
  const fill = (p) => p.replace(/:\w+/g, () => randomUUID());
  const results = []; let skipped = 0, calls = 0;
  const jobs = [];
  for (const r of routes) for (const ident of idents) {
    const allowed = isAllowed(r, ident), isGet = r.method === "GET", hasParam = r.path.includes(":"), reads = parses.get(`${r.method} ${r.path}`) === true;
    if (!isGet && allowed && !(reads || hasParam)) { skipped++; continue; }
    jobs.push({ r, ident, allowed, isGet });
  }
  const worker = async () => { while (jobs.length) { const j = jobs.pop(); const res = await call(j.ident, j.r.method, fill(j.r.path), j.isGet ? undefined : "{"); calls++; results.push({ ...j, status: res.s, code: (() => { try { return JSON.parse(res.text)?.error?.code ?? ""; } catch { return ""; } })() }); } };
  await Promise.all(Array.from({ length: 8 }, worker));
  const BUSINESS_403 = new Set(["AI_READING_OFF"]); // an allowed identity refused for a business reason, not for authorisation (the institution has switched AI document reading off)
  const mismatches = results.filter((x) => (x.allowed ? x.status === 401 || (x.status === 403 && !BUSINESS_403.has(x.code)) || x.status === 0 || x.status >= 500 : ![401, 403].includes(x.status)));
  for (const x of mismatches) console.log("MISMATCH", x.ident, x.r.method, x.r.path, x.status, x.code, x.allowed ? "(declared allowed)" : "(declared refused)");
  const byKind = (f) => results.filter(f);
  R.t(["ROLE-PERM-TC-020"], `ROUTE-GUARD MATRIX (live): ${routes.length} routes and methods x ${idents.length} identities (anonymous, garbage token, student, recruiter, platform administrator, five staff roles) = ${calls} calls (${skipped} write calls by allowed identities skipped as unsafe: no body check and no id): an identity the code allows is never refused for authorisation and never answered with a server error, and every identity the code does not allow is refused (401/403)`, ok && mismatches.length === 0, mismatches.slice(0, 6).map((x) => `${x.ident} ${x.r.method} ${x.r.path} -> ${x.status} ${x.code} (declared ${x.allowed ? "allowed" : "refused"})`).join("; ") + (mismatches.length > 6 ? ` ... ${mismatches.length} in total` : ""));
  const pub = matrix.routes.filter((r) => r.audience === "public" || r.audience === "scheduler");
  R.t(["ROLE-PERM-TC-020"], `the ${pub.length} routes outside the four wrappers are exactly the documented public (token links, health, login events, invitations) and scheduler routes: scheduler routes refuse everyone without the cron secret (401), public routes never return a server error for a random token`, await (async () => { const bad = []; for (const r of pub) { const a = await call("anon", r.method, fill(r.path), r.method === "GET" ? undefined : "{"); if (r.audience === "scheduler" && ![401, 403].includes(a.s)) bad.push(`${r.method} ${r.path} -> ${a.s}`); if (r.audience === "public" && a.s >= 500) bad.push(`${r.method} ${r.path} -> ${a.s}`); } return bad.length === 0 ? true : bad; })() === true);

  // ================= sweeps =================
  const anonG = byKind((x) => x.ident === "anon" || x.ident === "garbage");
  R.t(["SRS-SECURITY-TC-015"], `UNAUTHENTICATED SWEEP: every one of the ${routes.length} protected routes and methods, called with no token and with a garbage token, is refused (401/403); only the ${pub.filter((p) => p.audience === "public").length} documented public routes answer`, anonG.length > 0 && anonG.every((x) => [401, 403].includes(x.status)), anonG.filter((x) => ![401, 403].includes(x.status)).slice(0, 4).map((x) => `${x.ident} ${x.r.method} ${x.r.path} -> ${x.status}`).join("; "));
  const stuStaff = byKind((x) => x.ident === "student" && x.r.audience === "staff");
  R.t(["SRS-SECURITY-TC-018"], `STUDENT USES STAFF FUNCTIONS: a student token is refused on all ${stuStaff.length} staff routes and methods (reading and mutating)`, stuStaff.length > 400 && stuStaff.every((x) => [401, 403].includes(x.status)), stuStaff.filter((x) => ![401, 403].includes(x.status)).slice(0, 4).map((x) => `${x.r.method} ${x.r.path} -> ${x.status}`).join("; "));

  // ================= SRS-SECURITY-TC-021: the principal is read-only =================
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]; const prin = []; const tables = (await rows(`select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not in ('AuditLog','RateLimitBucket','LoginEvent','JobRun','MonitorEvent')`)).map((r) => r.t);
  const counts = async () => { const o = {}; for (const t of tables) o[t] = Number((await rows(`select count(*) c from "${t}"`))[0].c); return o; };
  const before = await counts(); const pj = [];
  const rowOf = new Map(matrix.routes.map((r) => [`${r.method} ${r.path}`, r]));
  for (const path of [...new Set(routes.map((r) => r.path))]) for (const m of METHODS) pj.push({ path, m, row: rowOf.get(`${m} ${path}`) });
  const pw1 = async () => { while (pj.length) { const j = pj.pop(); const decl = !!j.row; const allowedByCode = decl && j.row.audience === "staff" && j.row.allowed.includes("PRINCIPAL"); const res = await call("PRINCIPAL", j.m, fill(j.path), j.m === "GET" ? undefined : "{"); prin.push({ ...j, r: { path: j.path }, res: res.s, allowedByCode, decl }); } };
  await Promise.all(Array.from({ length: 8 }, pw1));
  const after = await counts();
  const principalBad = prin.filter((x) => x.res === 0 || (x.allowedByCode ? [401, 403].includes(x.res) || x.res >= 500 : x.decl ? ![401, 403].includes(x.res) : ![401, 403, 404, 405].includes(x.res)));
  const principalWrites = prin.filter((x) => x.allowedByCode && x.m !== "GET").map((x) => `${x.m} ${x.r.path}`);
  R.t(["SRS-SECURITY-TC-021"], `PRINCIPAL IS READ-ONLY: every route with GET, POST, PUT, PATCH and DELETE (${prin.length} calls): only the routes the code lists for the principal answer; every other call is refused (401/403) or has no handler (404/405); the only write the code allows the principal is ${principalWrites.length ? principalWrites.join(", ") : "none"} (a viewer marks their own notifications read)`, principalBad.length === 0, principalBad.slice(0, 5).map((x) => `${x.m} ${x.r.path} -> ${x.res}`).join("; "));
  const changed = tables.filter((t) => before[t] !== after[t]);
  R.t(["SRS-SECURITY-TC-021"], "NO DATA CHANGED: the row count of every table (audit, rate-limit and job tables excluded) is identical before and after the principal's calls", changed.length === 0, changed.map((t) => `${t}: ${before[t]} -> ${after[t]}`).join("; "));

  // ================= SRS-SECURITY-TC-020 and ROLE-PERM-TC-007: recruiter and company-specific access =================
  const rc = asAny("recruiter"), rc2 = caller(BASE, await env.login(R2.email, pw)), rcB = caller(BASE, await env.login(RB.email, pw));
  const own = await rc("GET", "/api/recruiter/drives"), other = await rc("GET", `/api/recruiter/drives/${dA2}`), mine = await rc("GET", `/api/recruiter/drives/${dA1}`), cross = await rc("GET", `/api/recruiter/drives/${dB1}`);
  const cands = await rc("GET", `/api/recruiter/drives/${dA1}/candidates`), candsOther = await rc("GET", `/api/recruiter/drives/${dA2}/candidates`);
  const s2name = `ISO-A-${tag} Student s2`, s1name = `ISO-A-${tag} Student s1`;
  R.t(["SRS-SECURITY-TC-020", "ROLE-PERM-TC-007"], "COMPANY-SPECIFIC ACCESS: a recruiter's drive list holds only their own company's drives; another company's drive in the SAME institution and a drive of ANOTHER institution answer 404; the recruiter sees their own drive (control)", own.s === 200 && own.text.includes(`Drive One`) && !own.text.includes(`Drive Two`) && !own.text.includes("Drive B") && mine.s === 200 && other.s === 404 && cross.s === 404, JSON.stringify({ own: own.s, mine: mine.s, otherCompany: other.s, otherInstitution: cross.s }));
  R.t(["SRS-SECURITY-TC-020", "ROLE-PERM-TC-007"], "APPLICANTS ONLY: the recruiter sees the applicant of their own drive (control) and nothing of a student who applied to another company's drive (not by name, id or in the candidate list of the other drive)", cands.s === 200 && cands.text.includes(s1name) && !cands.text.includes(s2name) && !cands.text.includes(A.students.s2.id) && candsOther.s === 404, JSON.stringify({ cands: cands.s, otherDriveCandidates: candsOther.s, sample: cands.text.slice(0, 300) }));
  const stu2 = await rc("GET", `/api/recruiter/drives/${dA1}/candidates/${A.students.s2.id}/match`), stu2pdf = await rc("GET", `/api/recruiter/drives/${dA1}/candidates/${A.students.s2.id}/resume.pdf`), staffStu = await rc("GET", `/api/students/${A.students.s1.id}`), staffStuList = await rc("GET", "/api/students");
  R.t(["SRS-SECURITY-TC-020", "ROLE-PERM-TC-007"], "NON-APPLICANT RECORDS: asking for a student who is not an applicant of the recruiter's drive (match view, resume PDF) is refused, and the recruiter cannot use staff student routes at all (403)", [stu2.s, stu2pdf.s].every((s) => [403, 404].includes(s)) && staffStu.s === 403 && staffStuList.s === 403 && !stu2.text.includes(s2name), JSON.stringify({ match: stu2.s, resume: stu2pdf.s, staff: staffStu.s }));
  const rOther = await rc2("GET", `/api/recruiter/drives/${dA1}`), rBforA = await rcB("GET", `/api/recruiter/drives/${dA1}`), rBlist = await rcB("GET", "/api/recruiter/drives");
  R.t(["ROLE-PERM-TC-007"], "ISOLATION BOTH WAYS: the other company's recruiter and an institution B recruiter get 404 for this drive, and B's list shows only B's drive", rOther.s === 404 && rBforA.s === 404 && rBlist.s === 200 && rBlist.text.includes("Drive B") && !rBlist.text.includes("Drive One"), JSON.stringify({ otherCompany: rOther.s, institutionB: rBforA.s }));

  // ================= ROLE-PERM-TC-006: individual student access =================
  const s1c = asAny("student"), s2c = caller(BASE, await A.tokenOf(A.students.s2)); const sid = A.students;
  const o1 = await ins("Internship", { collegeId: A.college, studentId: sid.s1.id, companyName: `ISO-A-${tag} S1 Internship`, role: "Intern", startDate: new Date(), endDate: new Date(now + 40 * day), createdById: A.admin.id });
  const rv1 = await ins("ResumeVersion", { collegeId: A.college, studentId: sid.s1.id, number: 1, title: `ISO-A-${tag} S1 Resume` });
  const probesS = [["GET", `/api/student/internships/${o1}`], ["GET", `/api/student/resumes/${rv1}`], ["PATCH", `/api/student/resumes/${rv1}`, { title: "HACKED" }], ["DELETE", `/api/student/resumes/${rv1}`], ["GET", `/api/student/internships/${o1}/logs`]];
  const sBad = []; for (const [m, p, b] of probesS) { const ownR = m === "GET" ? await s1c(m, p) : { s: 200 }; if (m === "GET" && ownR.s !== 200) { sBad.push(`control ${p} -> ${ownR.s}`); continue; } const x = await s2c(m, p, b); if (![403, 404].includes(x.s) || x.text.includes("S1 Resume") || x.text.includes("S1 Internship")) sBad.push(`${m} ${p} -> ${x.s}`); }
  const unchanged = (await rows(`select title from "ResumeVersion" where id=$1`, [rv1]))[0]?.title === `ISO-A-${tag} S1 Resume`;
  const sStaff = await s2c("GET", `/api/students/${sid.s1.id}`);
  R.t(["ROLE-PERM-TC-006"], "INDIVIDUAL STUDENT ACCESS: a student's own records answer 200 to the student (control); another student of the SAME institution gets 403/404 for them (read, change, delete), nothing is changed, and staff student routes are refused to a student", sBad.length === 0 && unchanged && sStaff.s === 403, sBad.join("; "));

  // ================= SRS-SECURITY-TC-033: privilege escalation =================
  const po = asAny("PLACEMENT_OFFICER"), co = asAny("DEPARTMENT_COORDINATOR"), adm = asAny("TPO_ADMIN"), poU = A.users.PLACEMENT_OFFICER;
  const esc = [];
  const roleOf = async (id) => (await rows(`select role, "extraRoles" from "User" where id=$1`, [id]))[0];
  const poBefore = JSON.stringify(await roleOf(poU.id));
  for (const body of [{ roles: ["TPO_ADMIN"] }, { role: "TPO_ADMIN" }, { roles: ["PLACEMENT_OFFICER", "PRINCIPAL"] }, { extraRoles: ["TPO_ADMIN"] }, { isActive: true, roles: ["TPO_ADMIN"] }]) { const r = await po("PATCH", `/api/settings/staff/${poU.id}`, body); if (![403].includes(r.s)) esc.push(`PO PATCH own roles ${JSON.stringify(body)} -> ${r.s}`); }
  const r2 = await co("PATCH", `/api/settings/staff/${A.users.DEPARTMENT_COORDINATOR.id}`, { roles: ["TPO_ADMIN"] }); if (r2.s !== 403) esc.push(`coordinator PATCH -> ${r2.s}`);
  const r3 = await po("POST", "/api/settings/staff", { email: `esc${tag}@example.com`, name: "Escalation Test", roles: ["TPO_ADMIN"] }); if (r3.s !== 403) esc.push(`PO invites an admin -> ${r3.s}`);
  const stuRole = await s1c("PATCH", "/api/student/me", { role: "TPO_ADMIN", roles: ["TPO_ADMIN"], collegeId: B.college, userId: B.admin.id, departmentId: B.d1 }); const sRow = (await rows(`select "collegeId" from "Student" where id=$1`, [sid.s1.id]))[0];
  if (sRow.collegeId !== A.college) esc.push("student collegeId changed"); if ((await n1(`select count(*)::int n from "User" where id=$1 and role='TPO_ADMIN'`, [sid.s1.authId])) !== 0) esc.push("student became staff");
  const crossAdm = await caller(BASE, await B.tokenOf(B.admin))("PATCH", `/api/settings/staff/${poU.id}`, { roles: ["PRINCIPAL"] }); if (![403, 404].includes(crossAdm.s)) esc.push(`institution B administrator changes A's staff -> ${crossAdm.s}`);
  const ownDemote = await adm("PATCH", `/api/settings/staff/${A.admin.id}`, { roles: ["PLACEMENT_OFFICER"] });
  R.t(["SRS-SECURITY-TC-033"], "PRIVILEGE ESCALATION: a placement officer cannot give themselves TPO_ADMIN or PRINCIPAL (role, roles, extraRoles, and extra fields all refused 403, stored roles unchanged), a coordinator and an officer cannot change roles or invite an administrator, a student's role, institution and user fields in a payload change nothing, and another institution's administrator cannot change this institution's staff", esc.length === 0 && JSON.stringify(await roleOf(poU.id)) === poBefore, esc.join("; "));
  R.t(["SRS-SECURITY-TC-033"], "the last administrator cannot be demoted by themselves (the institution must keep an administrator): refused, and the role is unchanged", [400, 403, 409].includes(ownDemote.s) && (await roleOf(A.admin.id)).role === "TPO_ADMIN", `HTTP ${ownDemote.s}`);

  // ================= handler-level department scope (the coordinator) =================
  const d2stu = A.students.s3, marker = `ISO-A-${tag} Student s3`;
  const lists = routes.filter((r) => r.audience === "staff" && r.method === "GET" && !r.path.includes(":") && r.allowed.includes("DEPARTMENT_COORDINATOR")).map((r) => r.path);
  const idRoutes = routes.filter((r) => r.audience === "staff" && r.method === "GET" && /^\/api\/students\/:id(\/|$)/.test(r.path) && r.allowed.includes("DEPARTMENT_COORDINATOR")).map((r) => r.path);
  const leaks = [], controls = []; let withMarker = 0;
  for (const p of lists) { const a = await adm("GET", p + (p.includes("?") ? "" : "?limit=200")), c = await co("GET", p + (p.includes("?") ? "" : "?limit=200")); if (a.s === 200 && (a.text.includes(marker) || a.text.includes(d2stu.id))) { withMarker++; if (c.text.includes(marker) || c.text.includes(d2stu.id)) leaks.push(p); } if (a.s === 200 && c.s === 200) controls.push(p); }
  const idLeaks = []; let idChecked = 0;
  for (const p of idRoutes) { const path = p.replace(":id", d2stu.id); const a = await adm("GET", path); const c = await co("GET", path); if (a.s === 200) { idChecked++; if (c.s === 200 || c.text.includes(marker)) idLeaks.push(`${path} -> ${c.s}`); } }
  const ownDept = await co("GET", `/api/students/${A.students.s1.id}`);
  const wr = await co("PATCH", `/api/students/${d2stu.id}`, { phone: "9999999999" }), wrDel = await co("DELETE", `/api/students/${d2stu.id}`);
  const phoneAfter = (await rows(`select phone from "Student" where id=$1`, [d2stu.id]))[0]?.phone;
  R.t(["ROLE-PERM-TC-013", "SRS-SECURITY-TC-033"], `DEPARTMENT SCOPE (handler level): of ${lists.length} list routes the coordinator may call, ${withMarker} show another department's student to the administrator (control); none of them shows that student to the department-1 coordinator; of ${idRoutes.length} student detail routes, ${idChecked} work for the administrator and every one is refused (not 200) for the coordinator when the student is in department 2`, withMarker >= 3 && leaks.length === 0 && idChecked >= 3 && idLeaks.length === 0 && ownDept.s === 200, JSON.stringify({ leaks, idLeaks, withMarker, idChecked, ownDept: ownDept.s }));
  R.t(["ROLE-PERM-TC-013"], "the coordinator cannot change or delete a student of another department (refused, stored phone unchanged) but sees their own department's student (200)", ![200, 204].includes(wr.s) && ![200, 204].includes(wrDel.s) && phoneAfter !== "9999999999" && ownDept.s === 200, `patch ${wr.s}, delete ${wrDel.s}`);

  // ================= ROLE-PERM-TC-009..016: SRS section 3 function lists, role by role =================
  // each entry: SRS function -> a representative call that must NOT be refused for that role (GET list or a safe write that validation rejects with 400); and calls that must be refused.
  const g = (fn, path) => ({ fn, m: "GET", path }), w = (fn, m, path) => ({ fn, m, path, malformed: true });
  const absent = (fn, why) => ({ fn, absent: why });   // an SRS function for which the code has no route at all
  const dummy = randomUUID();
  const caps = {
    "ROLE-PERM-TC-010": { role: "PRINCIPAL", label: "Institution Administrator / Principal (SRS 3.2)", exact: 14, must: [g("View institutional dashboard", "/api/dashboard/institution"), g("Monitor departments and student batches", "/api/settings/departments"), g("View placement statistics", "/api/analytics/overview"), g("Monitor training activities", "/api/dashboard/preparation"), g("Review institutional performance", "/api/dashboard"), g("View company engagement", "/api/analytics/overview"), g("Generate institutional reports", "/api/reports/placement.pdf"), absent("Assign administrative permissions", "Head TPO assigns roles; the Principal is read-only by design (SRS ambiguity A-01)")], mustNot: [w("any change (invite staff)", "POST", "/api/settings/staff"), w("any change (create company)", "POST", "/api/companies"), w("any change (edit settings)", "PATCH", "/api/settings/college")] },
    "ROLE-PERM-TC-011": { role: "TPO_ADMIN", label: "Head TPO (SRS 3.3)", must: [g("Manage placement activities", "/api/drives"), g("Manage companies", "/api/companies"), g("Create and publish job opportunities", "/api/drives"), g("Upload and analyse JDs", "/api/jds"), g("Review candidate matches", `/api/jds/${dummy}/matches`), g("Shortlist students", `/api/jds/${dummy}/shortlist`), g("Create preparation campaigns", "/api/campaigns"), g("Assign training and resources", "/api/resources"), g("Schedule mock tests and interviews", "/api/interviews/assignments"), g("Monitor candidate preparation", "/api/dashboard/preparation"), g("Manage placement drives", "/api/drives"), g("Track selection offers and joining", "/api/offers"), g("Generate placement reports", "/api/reports/placement.pdf")], mustNot: [g("platform administration", "/api/platform/institutions")] },
    "ROLE-PERM-TC-012": { role: "PLACEMENT_OFFICER", label: "Placement Officer (SRS 3.4)", must: [absent("Manage assigned departments or batches", "a placement officer is not scoped to assigned departments or batches: the code has no such assignment"), g("Upload JDs", "/api/jds"), g("Review eligibility", `/api/jds/${dummy}/readiness`), g("View matching candidates", `/api/jds/${dummy}/matches`), g("Shortlist candidates", `/api/jds/${dummy}/shortlist`), g("Assign preparation activities", "/api/campaigns"), g("Schedule assessments", "/api/assessments/schedules"), g("Send notifications", "/api/notifications"), g("Track student progress", "/api/students"), g("Update placement status", "/api/drives")], mustNot: [w("manage staff", "POST", "/api/settings/staff"), w("change institution settings", "PATCH", "/api/settings/college"), g("platform administration", "/api/platform/institutions")] },
    "ROLE-PERM-TC-013": { role: "DEPARTMENT_COORDINATOR", label: "HOD / Department Coordinator (SRS 3.5)", must: [g("View department students", "/api/students"), g("Monitor skill development", "/api/analytics/overview"), g("View academic and career readiness", "/api/dashboard/readiness"), g("Assign faculty mentors", "/api/faculty/students"), g("Review departmental training", "/api/courses"), g("Monitor project activities", "/api/projects"), g("Monitor internship activities", "/api/internships"), g("Support placement preparation", "/api/campaigns")], mustNot: [w("manage drives", "POST", "/api/drives"), w("manage companies", "POST", "/api/companies"), w("manage staff", "POST", "/api/settings/staff")] },
    "ROLE-PERM-TC-014": { role: "FACULTY", label: "Faculty / Mentor (SRS 3.6)", must: [g("View assigned students", "/api/faculty/students"), g("Create courses and learning activities", "/api/courses"), g("Upload resources", "/api/resources"), g("Assign assignments", "/api/courses"), g("Evaluate projects", "/api/projects"), g("Monitor student progress", "/api/students"), absent("Provide feedback", "no faculty feedback route exists outside internships"), absent("Conduct mentoring sessions", "no faculty mentoring-session record exists (counselling slots are placement-staff only)")], mustNot: [w("placement data (drives)", "POST", "/api/drives"), w("manage staff", "POST", "/api/settings/staff"), g("companies", "/api/companies")] },
    "ROLE-PERM-TC-015": { role: "student", label: "Student (SRS 3.8)", must: [g("Manage personal profile", "/api/student/profile-view"), g("Complete assessments", "/api/student/assessments"), g("View career roadmap", "/api/student/roadmap"), g("Access courses and resources", "/api/student/courses"), g("Maintain resume", "/api/student/resumes"), g("View eligible jobs / apply", "/api/student/drives"), g("Track placement activities", "/api/student/applications"), g("View feedback and performance", "/api/student/reports/performance")], mustNot: [g("staff student list", "/api/students"), g("platform", "/api/platform/institutions"), w("staff settings", "PATCH", "/api/settings/college")] },
    "ROLE-PERM-TC-016": { role: "recruiter", label: "Employer / Company Administrator (SRS 3.9)", must: [g("Manage company profile (view)", "/api/recruiter/me"), absent("Manage company profile (edit)", "the recruiter portal has no profile-edit route"), g("Create job openings", "/api/recruiter/jobs"), absent("Upload JDs", "no recruiter route"), absent("Define eligibility requirements", "no recruiter route"), absent("Review AI-parsed requirements", "no recruiter route"), g("View matching candidates", `/api/recruiter/drives/${dA1}/candidates`), g("Shortlist candidates (feedback)", `/api/recruiter/drives/${dA1}/feedback`), absent("Upload preparation resources", "no recruiter route"), absent("Create or assign assessments", "no recruiter route"), g("Schedule interviews (view schedule)", `/api/recruiter/drives/${dA1}/schedule`), g("Review candidate reports", `/api/recruiter/drives/${dA1}/candidates/${A.students.s1.id}/match`), g("Manage selection and offers (feedback)", `/api/recruiter/drives/${dA1}/feedback`)], mustNot: [g("staff students", "/api/students"), g("companies of the institution", "/api/companies"), g("platform", "/api/platform/institutions")] },
    "ROLE-PERM-TC-009": { role: "platform", label: "Super Administrator (SRS 3.1, within the approved A-18 scope)", must: [g("Manage institutions", "/api/platform/institutions"), g("Manage platform users (list and deactivate; accounts are script-created by decision DEC-01)", "/api/platform/admins"), g("Configure roles and permissions (read-only matrix by decision)", "/api/platform/roles"), g("Configure AI services", "/api/platform/ai"), g("Manage platform-wide settings (read-only by decision)", "/api/platform/system"), g("Monitor application performance (health and jobs; request latency stays with Vercel Observability by decision)", "/api/platform/monitoring"), g("View platform-level analytics", "/api/platform/analytics"), g("Manage integrations (read-only by decision)", "/api/platform/integrations"), g("Manage support requests", "/api/platform/support"), g("Configure data retention and security settings", "/api/platform/policy")], mustNot: [g("college data (students)", "/api/students"), g("college dashboard", "/api/dashboard"), g("recruiter", "/api/recruiter/drives")] },
  };
  const norm = (m, p) => `${m} ${p.split("?")[0].split("/").map((seg) => (seg.startsWith(":") || /^[0-9a-f]{8}-/.test(seg) ? ":p" : seg)).join("/")}`;
  const known = new Set(matrix.routes.map((r) => norm(r.method, r.path)));
  for (const [tc, c] of Object.entries(caps)) {
    const unknown = [...c.must, ...c.mustNot].filter((x) => !x.absent && !known.has(norm(x.m, x.path))).map((x) => `${x.m} ${x.path}`);
    R.t([tc], `${c.label}: every probed route exists in the generated route list (so a 404 can never be mistaken for access)`, unknown.length === 0, unknown.join("; "));
    const miss = [], leak = [];
    for (const x of c.must) { if (x.absent) { miss.push(`${x.fn}: ${x.absent}`); continue; } const res = await call(c.role, x.m, x.path, x.malformed ? "{" : undefined); if ([401, 403].includes(res.s) || res.s >= 500 || res.s === 0) miss.push(`${x.fn} (${x.m} ${x.path} -> ${res.s})`); }
    for (const x of c.mustNot) { const res = await call(c.role, x.m, x.path, x.malformed ? "{" : undefined); if (![401, 403, 404, 405].includes(res.s)) leak.push(`${x.fn} (${x.m} ${x.path} -> ${res.s})`); }
    const inventory = c.role === "student" || c.role === "recruiter" || c.role === "platform" ? routes.filter((r) => r.audience === c.role).length : routes.filter((r) => r.audience === "staff" && r.allowed.includes(c.role)).length;
    R.t([tc], `${c.label}: the role is refused what it must not do (${c.mustNot.length} probes), and the code's guards for the role equal the declared guards (see the matrix result)`, leak.length === 0, leak.join("; "));
    R.t([tc], `${c.label}: every SRS-listed function probed (${c.must.length}) is reachable by the role (not refused, no server error)`, miss.length === 0, miss.join("; "));
    if (c.exact !== undefined) R.t([tc], `${c.label}: nothing else: the role may call exactly ${c.exact} routes (the read-only set) and no others`, inventory === c.exact, `inventory ${inventory}`);
    else if (c.role !== "student" && c.role !== "platform") R.blocked([tc], `${c.label}: 'and nothing else'`, `The code allows this role ${inventory} routes (${routes.filter((r) => r.audience === "staff" && r.allowed.includes(c.role) && r.method !== "GET").length} writes). The SRS lists functions but does not say the list is exhaustive, so whether the remaining routes are in scope is an owner decision (route-level guards are verified live by ROLE-PERM-TC-020).`);
  }
} finally {
  try { await cleanupInstitutions(env, made); for (const a of madeAdmins) await env.sb.auth.admin.deleteUser(a).catch(() => {}); if (madeAdmins.length) await env.pgc.query(`delete from "PlatformAdmin" where id = any($1)`, [madeAdmins]); } catch (e) { console.error("cleanup:", e.message); }
  await env.pgc.end(); srv.stop();
}
process.exit(R.done() ? 1 : 0);

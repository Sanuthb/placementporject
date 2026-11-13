// Gate 4: SA-TC-067 platform governance (approved A-18 scope): read-only role/permission matrix, staff role assignment, platform administrators, read-only system configuration,
// read-only integration status, platform-wide MFA minimum, configurable retention. Own dev-server instance on port 3121 with MOCK Groq and Anthropic providers on loopback
// (no real provider is contacted). Local Docker stack only; synthetic data.
import net from "node:net";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";
import { scanRoutes } from "../../scripts/lib/routeScan.mjs";
import { readdirSync, readFileSync, statSync } from "node:fs";
const srcHits = (dirs, re) => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = d + "/" + n; if (n === "node_modules" || n === ".next" || n === "generated") continue; if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|mjs)$/.test(n) && re.test(readFileSync(p, "utf8"))) out.push(p); } }; dirs.forEach(walk); return out; };

const R = recorder("g4-09-platform-governance");
const RO = ["SA-TC-004", "SA-TC-067"], SE = ["SA-TC-007", "SA-TC-067"], IN = ["SA-TC-010", "SA-TC-067"], PO = ["SA-TC-012", "SA-TC-067"];
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const PORT = 3121, BASE = `http://localhost:${PORT}`, WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }

// ---------------- mock providers (free model-list endpoints only) ----------------
const mock = { groq: "ok", claude: "ok" };
const mkSrv = (which) => http.createServer((req, res) => {
  if (mock[which] === "401") { res.writeHead(401, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: { message: "bad key" } })); }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(which === "groq" ? { data: [{ id: "llama-3.3-70b-versatile" }] } : { data: [{ id: "claude-opus-5-5", type: "model", display_name: "x", created_at: "2025-01-01T00:00:00Z" }], has_more: false, first_id: "claude-opus-5-5", last_id: "claude-opus-5-5" }));
});
const groqSrv = mkSrv("groq"), claudeSrv = mkSrv("claude");
const listen = (s, port = 0) => new Promise((r) => s.listen(port, "127.0.0.1", () => r(s.address().port)));
const gp = await listen(groqSrv), cp = await listen(claudeSrv);

const SENT = { GITHUB_TOKEN: "ghp_GOVSENTINEL0123456789abcdef", TWILIO_ACCOUNT_SID: "ACGOVSENTINELSID0123456789", TWILIO_AUTH_TOKEN: "GOVSENTINELTOKEN0123456789", TWILIO_SMS_FROM: "+15550009901", TWILIO_WHATSAPP_FROM: "+15550009902", GROQ_API_KEY: "gsk_GOVSENTINEL_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9", ANTHROPIC_API_KEY: "sk-ant-GOVSENTINEL-Aa1Bb2Cc3Dd4Ee5Ff6Gg7" };
const SECRET_VALUES = [...Object.values(SENT), process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_ANON_KEY, process.env.CRON_SECRET];
const leaks = (s) => SECRET_VALUES.filter(Boolean).some((v) => String(s).includes(v)) || /postgres(ql)?:\/\//i.test(String(s));
const env = { ...process.env, ...SENT, PORT: String(PORT), RATE_LIMIT_DISABLED: "true", FLOOD_MAX_PER_MINUTE: "100000", APP_URL: BASE, REQUIRE_LOCAL_DB: "true", GROQ_API_BASE: `http://127.0.0.1:${gp}/v1`, ANTHROPIC_BASE_URL: `http://127.0.0.1:${cp}`, GROQ_MODEL: "", GROQ_VISION_MODEL: "" };
const out = [];
const app = spawn(WIN ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], { env, detached: !WIN, stdio: ["ignore", "pipe", "pipe"], shell: WIN, windowsHide: true });
app.stdout.on("data", (d) => out.push(String(d))); app.stderr.on("data", (d) => out.push(String(d)));
const stopApp = () => { try { if (WIN) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-app.pid); } catch { /* gone */ } };
process.on("exit", stopApp);
const wait = async (path, ms = 150000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + path)).ok) return true; } catch { /* starting */ } await sleep(900); } return false; };
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
const n1 = async (sql, p = []) => Number((await rows(sql, p))[0].n);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pw = `G4-gov-${tag}-Pw!`;
const mails = { p1: `g4gov1${tag}@example.com`, p2: `g4gov2${tag}@example.com`, p3: `g4gov3${tag}@example.com`, p4: `g4gov4${tag}@example.com`, nw: `g4govnew${tag}@example.com`, b: `g4govb${tag}@example.com`, c: `g4govc${tag}@example.com`, po: `g4govpo${tag}@example.com` };
const mkAdmin = (e) => { const r = spawnSync(WIN ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: WIN, env: { ...process.env, PLATFORM_ADMIN_EMAIL: e, PLATFORM_ADMIN_NAME: "G4 Gov " + e.slice(5, 8), PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr); };
const withMfa = async (e) => { const c = client(await login(e, pw), BASE); const enr = await c("POST", "/api/platform/mfa/enroll"); const tok = (await c("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token; return client(tok, BASE); };
const raw = (m, p, b, h = {}) => fetch(BASE + p, { method: m, headers: { "content-type": "application/json", ...h }, body: b === undefined ? undefined : typeof b === "string" ? b : JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));
const created = { colleges: [] }; let savedAdmins = []; let colA = null;
const ALL_ROLES = ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY", "PRINCIPAL"];
try {
  t(PO, "the instance under test starts (with mock Groq and Anthropic providers and sentinel secrets in its environment)", await wait("/api/health/live"));
  await rows(`delete from "PlatformPolicy"`); await rows(`delete from "PlatformAuditLog" where action like 'policy.%' or action like 'retention.%'`); // earlier runs of this suite
  for (const e of [mails.p1, mails.p2, mails.p3, mails.p4]) mkAdmin(e);
  const P = await withMfa(mails.p1), P2 = await withMfa(mails.p2); await withMfa(mails.p3);
  const aal1 = client(await login(mails.p3, pw), BASE), noMfa = client(await login(mails.p4, pw), BASE);
  const p1Id = (await rows(`select id from "PlatformAdmin" where email=$1`, [mails.p1]))[0].id, p2Id = (await rows(`select id from "PlatformAdmin" where email=$1`, [mails.p2]))[0].id;
  const adminA = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD), BASE);
  colA = (await rows(`select "collegeId" id from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL]))[0].id;
  const prov = async (name, slug, email) => { await P("POST", "/api/platform/institutions", { name, slug, admin: { name: name + " Admin", email }, departments: [{ code: "CSE", name: "Computer Science" }, { code: "ECE", name: "Electronics" }] }); const id = (await rows(`select id from "College" where slug=$1`, [slug]))[0].id; created.colleges.push(id); const u = (await rows(`select id from "User" where email=$1`, [email]))[0]; await sb.auth.admin.updateUserById(u.id, { password: pw, email_confirm: true }); return { id, uid: u.id, tok: client(await login(email, pw), BASE) }; };
  const B = await prov(`G4 Gov Bravo ${tag}`, `g4-gov-b-${tag}`, mails.b), C = await prov(`G4 Gov Charlie ${tag}`, `g4-gov-c-${tag}`, mails.c);
  const mkStaff = async (college, email, name, role, deptId = null) => { const u = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true }); const id = u.data.user.id; await rows(`insert into "User"(id,"collegeId",email,name,role,"departmentId","updatedAt") values ($1,$2,$3,$4,$5::"Role",$6,now())`, [id, college, email, name, role, deptId]); return id; };
  const S = await makeStudents(adminA, 1, "GOV"); const stu = client(S.tokens.A, BASE);
  const stuRow = (await rows(`select email from "Student" where id=$1`, [S.ids.A]))[0];
  const poId = await mkStaff(colA, mails.po, "Gov Officer", "PLACEMENT_OFFICER"); const officer = client(await login(mails.po, pw), BASE);

  // ================= access control on every new endpoint =================
  const dummy = "00000000-0000-4000-8000-000000000001";
  const eps = [["GET", "/api/platform/roles"], ["GET", "/api/platform/admins"], ["DELETE", `/api/platform/admins/${dummy}`], ["GET", "/api/platform/system"], ["GET", "/api/platform/integrations"], ["GET", "/api/platform/policy"], ["PUT", "/api/platform/policy/mfa", { required: true }], ["PUT", "/api/platform/policy/retention", { jobRunDays: 60 }], ["POST", "/api/platform/policy/retention/run", {}], ["GET", `/api/platform/institutions/${B.id}/staff`], ["PATCH", `/api/platform/institutions/${B.id}/staff/${dummy}`, { roles: ["FACULTY"] }]];
  const who = [["anonymous", (m, p, b) => raw(m, p, b)], ["garbage token", (m, p, b) => raw(m, p, b, { authorization: "Bearer not.a.token" })], ["institution administrator", (m, p, b) => adminA(m, p, b)], ["placement officer", (m, p, b) => officer(m, p, b)], ["student", (m, p, b) => stu(m, p, b)], ["platform admin, no second step", (m, p, b) => aal1(m, p, b)], ["platform admin, no authenticator", (m, p, b) => noMfa(m, p, b)]];
  const snap = async () => JSON.stringify([await rows(`select * from "PlatformPolicy"`), await rows(`select id,"isActive" from "PlatformAdmin" order by id`), await rows(`select id, role, "extraRoles" from "User" where "collegeId"=$1 order by id`, [B.id]), await n1(`select count(*)::int n from "PlatformAuditLog"`)]);
  const s0 = await snap(); const bad = [];
  for (const [n, f] of who) for (const [m, p, b] of eps) { const r = await f(m, p, b); const code = r.j?.error?.code; const ok = n === "anonymous" || n === "garbage token" ? r.s === 401 : n.includes("no second step") ? r.s === 403 && code === "MFA_REQUIRED" : n.includes("no authenticator") ? r.s === 403 && code === "MFA_SETUP_REQUIRED" : r.s === 403; if (!ok) bad.push(`${n} ${m} ${p.replace(dummy, ":id").replace(B.id, ":cid")} -> ${r.s} ${code}`); }
  t([...RO, ...SE, ...IN, ...PO], "all 12 new endpoints refuse everyone but a verified platform administrator: anonymous/garbage 401; institution admin, officer, student 403; no second step MFA_REQUIRED; no authenticator MFA_SETUP_REQUIRED", bad.length === 0, bad.slice(0, 3).join("; "));
  t([...RO, ...PO], "the refused calls changed nothing: no policy row, no administrator, no staff role, no audit row", (await snap()) === s0);
  const ro = [];
  for (const p of ["/api/platform/roles", "/api/platform/system", "/api/platform/integrations"]) for (const m of ["POST", "PUT", "PATCH", "DELETE"]) { const r = await P(m, p, {}); if (r.s !== 405) ro.push(`${m} ${p} ${r.s}`); }
  for (const m of ["POST", "PATCH", "DELETE"]) { const r = await P(m, "/api/platform/policy", {}); if (r.s !== 405) ro.push(`${m} /policy ${r.s}`); }
  t([...RO, ...SE, ...IN], "the matrix, system configuration and integration screens are read-only by construction: POST, PUT, PATCH and DELETE are 405 (and the policy has no write at its root)", ro.length === 0, ro.join(", "));

  // ================= roles and permissions: read-only matrix (SA-TC-004) =================
  const mx = await P("GET", "/api/platform/roles?pageSize=200");
  const code = scanRoutes();
  t(RO, "the matrix lists exactly the endpoints found in the route files, five fixed roles, and per-role allowed and refused counts that add up", mx.s === 200 && mx.d.endpointCount === code.length && mx.d.roles.join() === ALL_ROLES.join() && ALL_ROLES.every((r) => mx.d.perRole[r].allowed + mx.d.perRole[r].refused === mx.d.audiences.staff), `${mx.d?.endpointCount} vs ${code.length}`);
  const adminOnly = (await P("GET", `/api/platform/roles?q=${encodeURIComponent("/api/settings/staff")}&audience=staff`)).d.items.filter((x) => x.path === "/api/settings/staff");
  t(RO, "the matrix says staff invitation and the staff list are Head TPO only", adminOnly.length >= 2 && adminOnly.every((x) => x.allowedRoles.join() === "TPO_ADMIN"));
  const gA = await adminA("GET", "/api/settings/staff"), gO = await officer("GET", "/api/settings/staff");
  t(RO, "THE MATRIX MATCHES REAL BEHAVIOUR: the route it lists as Head TPO only answers 200 to the Head TPO and 403 to a placement officer", gA.s === 200 && gO.s === 403, `${gA.s} ${gO.s}`);
  const onlyP = await P("GET", "/api/platform/roles?role=PRINCIPAL&pageSize=200");
  t(RO, "filtering by role lists only routes that role may call, and a principal is limited to the read-only views (far fewer routes than a Head TPO)", onlyP.d.items.length > 0 && onlyP.d.items.every((x) => x.allowedRoles.includes("PRINCIPAL")) && mx.d.perRole.PRINCIPAL.allowed < mx.d.perRole.TPO_ADMIN.allowed / 2);
  const mm = JSON.stringify(mx.j);
  t(RO, "the matrix has no custom role, no permission editor and no secret or personal data", !/"editable"|"custom"/.test(mm) && !leaks(mm) && !mm.includes(process.env.SEED_ADMIN_EMAIL));
  t(RO, "invalid matrix queries are refused (unknown role, unknown field, page size above 200)", (await P("GET", "/api/platform/roles?role=SUPERUSER")).s === 400 && (await P("GET", "/api/platform/roles?editable=1")).s === 400 && (await P("GET", "/api/platform/roles?pageSize=201")).s === 400);

  // ================= assigning existing roles to an institution's staff =================
  const depts = (await P("GET", `/api/platform/institutions/${B.id}/staff`)).d.departments;
  const cse = depts.find((d) => d.name.startsWith("Computer")).id, ece = depts.find((d) => d.name.startsWith("Elec")).id;
  const fac = await mkStaff(B.id, `g4govfac${tag}@example.com`, "Gov Faculty", "FACULTY"), coord = await mkStaff(B.id, `g4govco${tag}@example.com`, "Gov Coordinator", "DEPARTMENT_COORDINATOR", cse);
  const aOther = await mkStaff(colA, `g4govaoth${tag}@example.com`, "Gov Other College", "FACULTY");
  const lst = await P("GET", `/api/platform/institutions/${B.id}/staff`);
  t(RO, "the institution's staff are listed with name, e-mail, roles, department and status (staff only), paged, and another institution's staff are not in it", lst.s === 200 && lst.d.total === 3 && lst.d.items.every((x) => x.email && x.roles.length && "isActive" in x) && !JSON.stringify(lst.j).includes(`g4govaoth${tag}`) && !/"(phone|cgpa|enrollmentNo)"/.test(JSON.stringify(lst.j)));
  t(RO, "search and paging on the staff list work; an unknown or malformed institution is a 404", (await P("GET", `/api/platform/institutions/${B.id}/staff?q=Faculty`)).d.items.length === 1 && (await P("GET", `/api/platform/institutions/${B.id}/staff?pageSize=1&page=2`)).d.items.length === 1 && (await P("GET", `/api/platform/institutions/${dummy}/staff`)).s === 404 && (await P("GET", `/api/platform/institutions/x/staff`)).s === 404);
  const facTok = client(await login(`g4govfac${tag}@example.com`, pw), BASE);
  const before = await facTok("GET", "/api/students?limit=1");
  const as1 = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, { roles: ["PLACEMENT_OFFICER"] });
  const after = await facTok("GET", "/api/students?limit=1");
  t(RO, "assigning an existing role takes effect: a faculty-only user is refused a placement route (403) and, once made Placement Officer, is allowed (200)", as1.s === 200 && as1.d.roles.join() === "PLACEMENT_OFFICER" && before.s === 403 && after.s === 200, `${before.s} ${as1.s} ${after.s}`);
  const au1 = (await rows(`select before, after, "platformActorId", "actorId" from "AuditLog" where "collegeId"=$1 and action='staff.roles.platform_update' and "entityId"=$2 order by "createdAt"`, [B.id, fac]));
  t(RO, "the change is audited with the platform administrator as actor and the previous and new roles", au1.length === 1 && au1[0].platformActorId === p1Id && au1[0].actorId === null && au1[0].before.roles.join() === "FACULTY" && au1[0].after.roles.join() === "PLACEMENT_OFFICER");
  const as2 = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, { roles: ["PLACEMENT_OFFICER", "FACULTY"] });
  const rowF = (await rows(`select role, "extraRoles"::text[] as "extraRoles" from "User" where id=$1`, [fac]))[0];
  t(RO, "extra roles can be assigned (main role Placement Officer, extra Faculty)", as2.s === 200 && rowF.role === "PLACEMENT_OFFICER" && rowF.extraRoles.join() === "FACULTY");
  const noop = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, { roles: ["PLACEMENT_OFFICER", "FACULTY"] });
  t(RO, "repeating the same assignment succeeds without a second audit row", noop.s === 200 && noop.d.changed === false && (await n1(`select count(*)::int n from "AuditLog" where "collegeId"=$1 and action='staff.roles.platform_update' and "entityId"=$2`, [B.id, fac])) === 2);
  const c1 = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, { roles: ["DEPARTMENT_COORDINATOR"] });
  const c2 = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, { roles: ["DEPARTMENT_COORDINATOR"], departmentId: dummy });
  const c3 = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, { roles: ["DEPARTMENT_COORDINATOR"], departmentId: ece });
  const c4 = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, { roles: ["FACULTY"], departmentId: cse });
  const c5 = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, { roles: ["FACULTY"] });
  const rowC = (await rows(`select role, "departmentId" from "User" where id=$1`, [fac]))[0];
  t(RO, "the coordinator rule holds: no department 400, another institution's department refused, own department accepted; a department with a non-coordinator role 400; dropping the role clears the department", c1.s === 400 && [400, 404].includes(c2.s) && c3.s === 200 && c4.s === 400 && c5.s === 200 && rowC.role === "FACULTY" && rowC.departmentId === null, [c1.s, c2.s, c3.s, c4.s, c5.s].join());
  const inv = [["no roles", { roles: [] }], ["unknown role", { roles: ["SUPERUSER"] }], ["platform-only role name", { roles: ["PLATFORM_ADMIN"] }], ["four roles", { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "FACULTY", "PRINCIPAL"] }], ["unknown field", { roles: ["FACULTY"], permissions: ["*"] }], ["id field", { roles: ["FACULTY"], id: dummy }], ["roles as text", { roles: "TPO_ADMIN" }], ["missing roles", {}]];
  const badInv = []; for (const [k, b] of inv) { const r = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${fac}`, b); if (r.s !== 400) badInv.push(`${k}:${r.s}`); }
  t(RO, "invalid role requests are refused with 400: none, unknown or platform-only role, more than three, unknown fields (no permission editing), wrong types", badInv.length === 0 && (await rows(`select role from "User" where id=$1`, [fac]))[0].role === "FACULTY", badInv.join(","));
  const x1 = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${aOther}`, { roles: ["TPO_ADMIN"] }), x2 = await P("PATCH", `/api/platform/institutions/${colA}/staff/${fac}`, { roles: ["TPO_ADMIN"] });
  t(RO, "ISOLATION: a staff member of another institution cannot be reached through this institution's path, in either direction (404) and nothing changes", x1.s === 404 && x2.s === 404 && (await rows(`select role from "User" where id=$1`, [aOther]))[0].role === "FACULTY" && (await rows(`select role from "User" where id=$1`, [fac]))[0].role === "FACULTY");
  // self-escalation: an identity that is both a platform administrator and an institution user
  await rows(`insert into "User"(id,"collegeId",email,name,role,"updatedAt") values ($1,$2,$3,'Self Admin','FACULTY',now()) on conflict do nothing`, [p1Id, B.id, `self${tag}@example.com`]);
  const self = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${p1Id}`, { roles: ["TPO_ADMIN"] });
  t(RO, "SELF-ESCALATION: a platform administrator cannot change their own access, even where their identity also holds an institution account (403), and nothing changes", self.s === 403 && (await rows(`select role from "User" where id=$1`, [p1Id]))[0].role === "FACULTY");
  await rows(`delete from "User" where id=$1`, [p1Id]);
  // last administrator and concurrency
  const dem = await P("PATCH", `/api/platform/institutions/${B.id}/staff/${B.uid}`, { roles: ["FACULTY"] });
  t(RO, "the institution must keep an administrator: demoting its only Head TPO is refused (400)", dem.s === 400 && (await rows(`select role from "User" where id=$1`, [B.uid]))[0].role === "TPO_ADMIN", JSON.stringify(dem.j).slice(0, 150));
  const second = await mkStaff(B.id, `g4govadm2${tag}@example.com`, "Gov Admin Two", "TPO_ADMIN");
  const raceDem = await Promise.all([P("PATCH", `/api/platform/institutions/${B.id}/staff/${B.uid}`, { roles: ["FACULTY"] }), P2("PATCH", `/api/platform/institutions/${B.id}/staff/${second}`, { roles: ["FACULTY"] })]);
  t(RO, "CONCURRENCY: two administrators demoting the institution's two Head TPOs at the same moment: exactly one succeeds, the other is refused, and one administrator remains", raceDem.map((r) => r.s).sort().join() === "200,400" && (await n1(`select count(*)::int n from "User" where "collegeId"=$1 and (role='TPO_ADMIN' or 'TPO_ADMIN' = any("extraRoles")) and "isActive"`, [B.id])) === 1, raceDem.map((r) => r.s).join());
  await rows(`update "User" set role='TPO_ADMIN' where id=$1`, [B.uid]);
  const r1 = await Promise.all([P("PATCH", `/api/platform/institutions/${B.id}/staff/${coord}`, { roles: ["PLACEMENT_OFFICER"] }), P2("PATCH", `/api/platform/institutions/${B.id}/staff/${coord}`, { roles: ["PRINCIPAL"] })]);
  const aud2 = await rows(`select before, after from "AuditLog" where "collegeId"=$1 and action='staff.roles.platform_update' and "entityId"=$2 order by "createdAt"`, [B.id, coord]);
  const finalRole = (await rows(`select role, "departmentId" from "User" where id=$1`, [coord]))[0];
  t(RO, "CONCURRENCY: two simultaneous role assignments to one person both succeed one after the other: the stored role is one of them and the audit rows chain (the later 'before' is the earlier 'after')", r1.every((r) => r.s === 200) && aud2.length === 2 && aud2[1].before.roles.join() === aud2[0].after.roles.join() && ["PLACEMENT_OFFICER", "PRINCIPAL"].includes(finalRole.role) && finalRole.departmentId === null, JSON.stringify(aud2));

  // ================= platform administrators =================
  const la = await P("GET", "/api/platform/admins");
  t(RO, "the platform administrators are listed with name, e-mail, status and whether two-step sign-in is set up", la.s === 200 && la.d.items.some((x) => x.email === mails.p1 && x.isActive && x.mfaEnrolled === true) && la.d.items.some((x) => x.email === mails.p4 && x.mfaEnrolled === false));
  // keep only p1 and p2 active for the last-administrator tests (restored afterwards)
  savedAdmins = (await rows(`select id from "PlatformAdmin" where "isActive" and id not in ($1,$2)`, [p1Id, p2Id])).map((r) => r.id);
  await rows(`update "PlatformAdmin" set "isActive"=false where "isActive" and id not in ($1,$2)`, [p1Id, p2Id]);
  // DEC-01: platform administrator accounts are created by script only. No API creates, invites or re-enables one.
  const authHas = async (e) => ((await sb.auth.admin.listUsers({ perPage: 1000 })).data?.users ?? []).some((u) => u.email === e);
  const refusedMail = `g4govrefused${tag}@example.com`; const paBefore = await n1(`select count(*)::int n from "PlatformAdmin"`); const auBefore = await n1(`select count(*)::int n from "PlatformAuditLog" where action like 'platform.admin.%'`);
  const tries = [await P("POST", "/api/platform/admins", { email: refusedMail, name: "Should Not Exist" }), await P("POST", "/api/platform/admins", {}), await P("PUT", "/api/platform/admins", { email: refusedMail }), await P("PATCH", `/api/platform/admins/${p2Id}`, { isActive: true }), await P("POST", `/api/platform/admins/${p2Id}`, {}), await raw("POST", "/api/platform/admins", { email: refusedMail, name: "x" })];
  t(RO, "DEC-01: there is no API to create, invite or re-enable a platform administrator: POST, PUT and PATCH on the administrator routes are refused (never 2xx) for a verified platform administrator and for an anonymous caller", tries.every((r) => [401, 403, 404, 405].includes(r.s)), JSON.stringify(tries.map((r) => r.s)));
  t(RO, "DEC-01: the refused attempts created no administrator row, no login and no audit row", (await n1(`select count(*)::int n from "PlatformAdmin"`)) === paBefore && !(await authHas(refusedMail)) && (await n1(`select count(*)::int n from "PlatformAuditLog" where action like 'platform.admin.%'`)) === auBefore);
  t(RO, "DEC-01: no application code (app/, lib/) writes to the PlatformAdmin table; only the creation script does", srcHits(["app", "lib"], /platformAdmin\.(create|createMany|upsert)\b|INSERT INTO "PlatformAdmin"/i).length === 0, JSON.stringify(srcHits(["app", "lib"], /platformAdmin\.(create|createMany|upsert)\b|INSERT INTO "PlatformAdmin"/i)));
  mkAdmin(mails.nw); const nwRow = (await rows(`select id, email, "isActive" from "PlatformAdmin" where email=$1`, [mails.nw]))[0];
  const nw0 = client(await login(mails.nw, pw), BASE); const nwBefore = await nw0("GET", "/api/platform/roles");
  t(RO, "MFA STILL MANDATORY: an administrator created by the script can sign in but is refused every platform route until two-step sign-in is set up (MFA_SETUP_REQUIRED)", nwBefore.s === 403 && nwBefore.code === "MFA_SETUP_REQUIRED", JSON.stringify(nwBefore).slice(0, 200));
  const NW = await withMfa(mails.nw); t(RO, "after enrolling an authenticator the script-created administrator can use the platform", (await NW("GET", "/api/platform/roles")).s === 200);
  const del = await P("DELETE", `/api/platform/admins/${nwRow.id}`);
  const nwAfter = await NW("GET", "/api/platform/roles");
  t(RO, "removing a platform administrator takes effect at once: their next request is refused (403) although their session is still valid; their record and history are kept", del.s === 200 && del.d.isActive === false && nwAfter.s === 403 && (await rows(`select "isActive" from "PlatformAdmin" where id=$1`, [nwRow.id]))[0].isActive === false);
  t(RO, "removal is audited, and removing twice, an unknown id and a malformed id are refused (409/404/404)", (await n1(`select count(*)::int n from "PlatformAuditLog" where action='platform.admin.remove' and "adminId"=$1 and detail->>'targetId'=$2`, [p1Id, nwRow.id])) === 1 && (await P("DELETE", `/api/platform/admins/${nwRow.id}`)).s === 409 && (await P("DELETE", `/api/platform/admins/${dummy}`)).s === 404 && (await P("DELETE", `/api/platform/admins/nope`)).s === 404);
  const re = await P("POST", "/api/platform/admins", { email: mails.nw, name: "Back Again" });
  t(RO, "DEC-01: a deactivated administrator cannot be re-enabled through the API (POST refused); the record stays inactive (restoring one is a script operation)", [401, 403, 404, 405].includes(re.s) && (await rows(`select "isActive" from "PlatformAdmin" where id=$1`, [nwRow.id]))[0].isActive === false, String(re.s));
  const selfRm = await P("DELETE", `/api/platform/admins/${p1Id}`);
  t(RO, "SELF-REMOVAL: an administrator cannot remove themselves (409) and nothing changes", selfRm.s === 409 && selfRm.j.error.code === "SELF_REMOVAL" && (await rows(`select "isActive" from "PlatformAdmin" where id=$1`, [p1Id]))[0].isActive === true);
  await rows(`update "PlatformAdmin" set "isActive"=false where "isActive" and id not in ($1,$2)`, [p1Id, p2Id]); // the administrator added above is switched off again so exactly two remain
  const mutual = await Promise.all([P("DELETE", `/api/platform/admins/${p2Id}`), P2("DELETE", `/api/platform/admins/${p1Id}`)]);
  t(RO, "CONCURRENCY: with two administrators left, each removing the other at the same moment: exactly one removal succeeds and at least one administrator always stays active", mutual.filter((r) => r.s === 200).length === 1 && (await n1(`select count(*)::int n from "PlatformAdmin" where "isActive"`)) === 1 && mutual.some((r) => [403, 409].includes(r.s)), mutual.map((r) => r.s).join());
  await rows(`update "PlatformAdmin" set "isActive"=true where id in ($1,$2)`, [p1Id, p2Id]);

  // ================= read-only system configuration (SA-TC-007) =================
  const cfg = await P("GET", "/api/platform/system"); const cj = JSON.stringify(cfg.j);
  const items = (cfg.d?.groups ?? []).flatMap((g) => g.items); const item = (k) => items.find((x) => x.key === k);
  t(SE, "the screen shows non-secret settings in groups, each with a value and a source (environment, database, default or code)", cfg.s === 200 && cfg.d.readOnly === true && cfg.d.groups.length >= 8 && items.every((i) => ["environment", "database", "default", "code"].includes(i.source)), cj.slice(0, 150));
  t(SE, "SECRETS: not one secret appears: not the service-role key, anon key, scheduler secret, GitHub token, Twilio credentials, AI provider keys, nor any connection string (sentinel values were placed in the server's environment)", !leaks(cj), SECRET_VALUES.filter((v) => v && cj.includes(v)).join());
  t(SE, "secrets are reported only as configured yes/no (GitHub token, scheduler secret, Twilio keys, provider keys)", item("githubToken").value === true && item("cronSecret").value === true && item("channelKeys").value === true && item("ai.TEXT.key").value === true && item("ai.INTERVIEW.key").value === true);
  t(SE, "values match the real environment: mode, flood guard 100000 from the environment, rate limits disabled by the environment, application host, channels on hold", item("flood").value === 100000 && item("flood").source === "environment" && item("rateLimits").value === "disabled" && item("appHost").value === `localhost:${PORT}` && item("channelsStatus").value === "on hold");
  t(SE, "the platform minimum MFA rule, platform-admin MFA and retention appear with their database or default sources", item("platformMfa").value === "required" && item("platformMfa").source === "code" && item("adminMfaMinimum").source === "database" && item("retention.jobRun").value === "90 days" && item("retention.jobRun").source === "default");
  const sw = await P("PUT", "/api/platform/ai/global", { enabled: false });
  const cfg2 = await P("GET", "/api/platform/system"); const g2 = cfg2.d.groups.flatMap((g) => g.items).find((x) => x.key === "aiGlobal");
  await P("PUT", "/api/platform/ai/global", { enabled: true });
  t(SE, "a setting changed elsewhere in the app shows its new value with source 'database' (AI global switch off), then back on", sw.s === 200 && g2.value === "off" && g2.source === "database");
  t(SE, "an unknown query or a body cannot change anything: GET with parameters is read-only and the environment has no editing path (405 on write methods, covered above)", (await P("GET", "/api/platform/system?FLOOD_MAX_PER_MINUTE=1")).d.groups.flatMap((g) => g.items).find((x) => x.key === "flood").value === 100000);

  // ================= read-only integration status (SA-TC-010) =================
  const ig = await P("GET", "/api/platform/integrations?refresh=1"); const ij = JSON.stringify(ig.j); const st = (k) => ig.d?.items.find((x) => x.key === k);
  t(IN, "the dashboard lists exactly the approved integrations: SMTP, SMS, WhatsApp, calendar, Groq, Anthropic, GitHub, Supabase Storage", ig.s === 200 && ig.d.readOnly === true && ig.d.items.map((x) => x.key).join() === "smtp,sms,whatsapp,calendar,groq,anthropic,github,storage", ij.slice(0, 200));
  t(IN, "SECRETS: no key, token, credential or last characters of a key appears (sentinel values are in the server's environment)", !leaks(ij) && !/GOVSENTINEL/.test(ij));
  t(IN, "SMS and WhatsApp are 'disabled' and on hold, and the dashboard says the hold is enforced by the server (keys present, an institution on: still not sent)", ["sms", "whatsapp"].every((k) => st(k).state === "disabled" && st(k).onHold === true && st(k).checked === false && st(k).details.some((d) => /enforced in the server/.test(d)) && !st(k).details.some((d) => /^WARNING/.test(d))));
  {
    // the institution switches both channels ON while the server has provider keys: the hold still applies and callers are told so
    const before = (await adminA("GET", "/api/notifications/settings")).d;
    const put = await adminA("PUT", "/api/notifications/settings", { smsEnabled: true, whatsappEnabled: true }); const got = (await adminA("GET", "/api/notifications/settings")).d;
    t(IN, "an institution can still switch SMS/WhatsApp on (setting preserved) but the API reports the on-hold state and no available provider", put.s === 200 && got.smsEnabled === true && got.whatsappEnabled === true && got.onHold?.SMS === true && got.onHold?.WHATSAPP === true && got.providers?.SMS === false && got.providers?.WHATSAPP === false && /on hold/i.test(got.onHold?.reason ?? ""), JSON.stringify(got));
    await adminA("PUT", "/api/notifications/settings", { smsEnabled: !!before?.smsEnabled, whatsappEnabled: !!before?.whatsappEnabled });
  }
  t(IN, "calendar is 'configured' (feeds are built by the app; no external service) and GitHub with a token present is 'configured', neither claimed healthy", st("calendar").state === "configured" && st("github").state === "configured" && st("calendar").checked === false && st("github").checked === false);
  t(IN, "with mock providers answering, Groq and Anthropic are 'healthy' from a real authenticated model-list call (free, no tokens), with latency", st("groq").state === "healthy" && st("groq").checked && st("anthropic").state === "healthy" && st("anthropic").latencyMs !== null, JSON.stringify([st("groq"), st("anthropic")]).slice(0, 300));
  const mon = await P("GET", "/api/platform/monitoring"); const comp = (k) => mon.d.components.find((c) => c.key === k);
  const mapS = { healthy: "healthy", degraded: "unhealthy", unavailable: "unavailable", not_configured: "missing", unknown: "configured" };
  t(IN, "REUSE: SMTP and Storage states are the monitoring page's own health results (same checks, same moment), mapped one to one", st("smtp").state === mapS[comp("email").status] && st("storage").state === mapS[comp("storage").status], `${st("smtp").state}/${comp("email").status} ${st("storage").state}/${comp("storage").status}`);
  await sleep(5300); mock.groq = "401";
  const ig2 = await P("GET", "/api/platform/integrations?refresh=1");
  t(IN, "a provider that refuses the key is 'unhealthy' (mock Groq answers 401), while Anthropic stays healthy", ig2.d.items.find((x) => x.key === "groq").state === "unhealthy" && ig2.d.items.find((x) => x.key === "anthropic").state === "healthy", ig2.d.items.find((x) => x.key === "groq").summary);
  await sleep(5300); groqSrv.close(); claudeSrv.close(); mock.groq = "ok";
  const ig3 = await P("GET", "/api/platform/integrations?refresh=1");
  t(IN, "a provider that cannot be reached is 'unavailable' (both mock servers stopped)", ig3.d.items.find((x) => x.key === "groq").state === "unavailable" && ig3.d.items.find((x) => x.key === "anthropic").state === "unavailable");
  await P("PUT", "/api/platform/ai/global", { enabled: false });
  await sleep(5300); const ig4 = await P("GET", "/api/platform/integrations?refresh=1");
  await P("PUT", "/api/platform/ai/global", { enabled: true });
  t(IN, "with the AI global switch off, Groq and Anthropic are 'disabled' and are not probed", ig4.d.items.find((x) => x.key === "groq").state === "disabled" && ig4.d.items.find((x) => x.key === "anthropic").state === "disabled");
  const ig5 = await P("GET", "/api/platform/integrations?refresh=1");
  t(IN, "a forced refresh requested too soon is throttled and returns the latest result (no extra probe storm)", ig5.d.throttled === true || ig5.d.cached === true);
  t(IN, "the status counts add up to the number of integrations", Object.values(ig4.d.counts).reduce((a, b) => a + b, 0) === 8);
  t(IN, "invalid query values are refused (400)", (await P("GET", "/api/platform/integrations?refresh=banana")).s === 400);

  // ================= platform-wide MFA minimum (SA-TC-012) =================
  const pol0 = await P("GET", "/api/platform/policy");
  t(PO, "the policy starts with no platform minimum and the built-in retention defaults (job history 90, monitoring events 14, AI usage 90 days) with their allowed ranges", pol0.s === 200 && pol0.d.mfa.requireForInstitutionAdmins === false && pol0.d.retention.items.map((i) => `${i.key}:${i.days}:${i.min}-${i.max}:${i.source}`).join() === "jobRun:90:30-365:default,monitorEvent:14:7-90:default,aiUsage:90:30-365:default" && /legal/i.test(pol0.d.retention.note), JSON.stringify(pol0.d.retention.items).slice(0, 200));
  const bin = [await P("PUT", "/api/platform/policy/mfa", { required: "yes" }), await P("PUT", "/api/platform/policy/mfa", {}), await P("PUT", "/api/platform/policy/mfa", { required: true, extra: 1 })];
  t(PO, "the MFA policy accepts only a boolean (400 otherwise)", bin.every((r) => r.s === 400));
  const adminC = C.tok; const cBefore = await adminC("GET", "/api/settings/staff");
  const on = await P("PUT", "/api/platform/policy/mfa", { required: true });
  const cBlocked = await adminC("GET", "/api/settings/staff"), cMe = await adminC("GET", "/api/me"), aBlocked = await adminA("GET", "/api/settings/staff"), offStill = await officer("GET", "/api/students?limit=1");
  t(PO, "turning the platform minimum on forces administrators without an authenticator to set one up: their API calls are refused (MFA_SETUP_REQUIRED) in every institution, /api/me still answers 'setup_required' so the screen can guide them, and non-administrators are unaffected", cBefore.s === 200 && on.s === 200 && on.d.changed === true && cBlocked.s === 403 && cBlocked.code === "MFA_SETUP_REQUIRED" && aBlocked.code === "MFA_SETUP_REQUIRED" && cMe.s === 200 && cMe.d.mfa === "setup_required" && offStill.s === 200, `${cBefore.s} ${cBlocked.s}/${cBlocked.code} ${cMe.d?.mfa} ${offStill.s}`);
  const sbc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await sbc.auth.signInWithPassword({ email: mails.c, password: pw });
  const enr = await sbc.auth.mfa.enroll({ factorType: "totp", friendlyName: "gov" }); const ver = await sbc.auth.mfa.challengeAndVerify({ factorId: enr.data.id, code: totp(enr.data.totp.secret) });
  await sleep(3500); // a "not enrolled" answer is cached for 3 seconds (see lib/auth/mfa.ts)
  const cTok = client(ver.data.access_token, BASE);
  t(PO, "after setting up an authenticator and confirming the code, the administrator is allowed again", !ver.error && (await cTok("GET", "/api/settings/staff")).s === 200);
  const sec = await cTok("GET", "/api/settings/security");
  t(PO, "the institution's security screen reports the platform minimum (platformRequired true, effective true) while its own setting is off", sec.d.platformRequired === true && sec.d.effective === true && sec.d.requireMfaForAdmins === false);
  const weaken = await cTok("PATCH", "/api/settings/security", { requireMfaForAdmins: false });
  t(PO, "AN INSTITUTION CANNOT WEAKEN THE PLATFORM MINIMUM: turning its own requirement off while the platform requires it is refused (409 PLATFORM_POLICY) with a clear message", weaken.s === 409 && weaken.code === "PLATFORM_POLICY" && /stricter/i.test(weaken.j.error.message), JSON.stringify(weaken.j));
  const stricter = await cTok("PATCH", "/api/settings/security", { requireMfaForAdmins: true });
  t(PO, "an institution may be stricter: turning its own requirement on is accepted and audited", stricter.s === 200 && (await rows(`select "requireMfaForAdmins" r from "CollegeSettings" where "collegeId"=$1`, [C.id]))[0].r === true && (await n1(`select count(*)::int n from "AuditLog" where "collegeId"=$1 and action='settings.security.update'`, [C.id])) === 1);
  const off = await P("PUT", "/api/platform/policy/mfa", { required: false }), offAgain = await P("PUT", "/api/platform/policy/mfa", { required: false });
  const aFree = await adminA("GET", "/api/settings/staff");
  t(PO, "turning the platform minimum off lifts it for institutions that did not choose it themselves (the seed institution is allowed again), while the institution that chose to be stricter keeps its own rule", off.s === 200 && aFree.s === 200 && (await rows(`select "requireMfaForAdmins" r from "CollegeSettings" where "collegeId"=$1`, [C.id]))[0].r === true);
  t(PO, "setting the same value again is a no-op without a second audit row", offAgain.d.changed === false && (await n1(`select count(*)::int n from "PlatformAuditLog" where action='policy.mfa.update'`)) === 2);
  const ma = await rows(`select detail, "adminId" from "PlatformAuditLog" where action='policy.mfa.update' order by "createdAt"`);
  t(PO, "each change is audited with the administrator and the before and after value", ma.length === 2 && ma[0].adminId === p1Id && ma[0].detail.before.requireAdminMfa === false && ma[0].detail.after.requireAdminMfa === true && ma[1].detail.after.requireAdminMfa === false);
  await rows(`update "PlatformAdmin" set "isActive"=true where email=$1`, [mails.p3]); // switched off earlier for the administrator-count tests
  t(PO, "the platform minimum never lowers anything for platform administrators: a password-only platform session is still refused (MFA_REQUIRED) with the policy off", (await aal1("GET", "/api/platform/policy")).code === "MFA_REQUIRED");
  await cTok("PATCH", "/api/settings/security", { requireMfaForAdmins: false });

  // ================= retention (SA-TC-012) =================
  const ret = (b) => P("PUT", "/api/platform/policy/retention", b);
  const badR = [["job below", { jobRunDays: 29 }], ["job above", { jobRunDays: 366 }], ["events below", { monitorEventDays: 6 }], ["events above", { monitorEventDays: 91 }], ["ai below", { aiUsageDays: 29 }], ["ai above", { aiUsageDays: 366 }], ["zero", { jobRunDays: 0 }], ["negative", { jobRunDays: -1 }], ["fraction", { jobRunDays: 45.5 }], ["text", { jobRunDays: "90" }], ["unknown field", { jobRunDays: 60, studentDataDays: 1 }], ["empty", {}], ["only confirm", { confirm: true }]];
  const badRet = []; const polBefore = JSON.stringify(await rows(`select * from "PlatformPolicy"`));
  for (const [k, b] of badR) { const r = await ret(b); if (r.s !== 400) badRet.push(`${k}:${r.s}`); }
  t(PO, "retention values outside the proposed ranges, non-integers, text, unknown fields (including anything about student data) and empty requests are refused (400) and change nothing", badRet.length === 0 && JSON.stringify(await rows(`select * from "PlatformPolicy"`)) === polBefore, badRet.join(","));
  const longer = await ret({ jobRunDays: 365, monitorEventDays: 90, aiUsageDays: 365 });
  t(PO, "lengthening retention is accepted without confirmation, takes effect in the screen and in the monitoring history ('kept N days'), and is audited", longer.s === 200 && longer.d.changed === true && (await P("GET", "/api/platform/policy")).d.retention.items.every((i) => i.source === "platform setting") && (await P("GET", "/api/platform/monitoring/jobs")).d.retentionDays === 365);
  // seed old and recent records
  const old = (d) => `now() - interval '${d} days'`;
  await rows(`insert into "JobRun"(id, job, "slotAt") select gen_random_uuid(), 'g4gov-bulk', ${old(200)} - (g || ' minutes')::interval from generate_series(1, 5600) g`);
  await rows(`insert into "JobRun"(id, job, "slotAt") values (gen_random_uuid(), 'g4gov-keep', ${old(5)})`);
  await rows(`insert into "MonitorEvent"(id, at, service, code, message) select gen_random_uuid(), ${old(20)}, 'g4gov', 'G4GOV', 'old event' from generate_series(1, 40)`);
  await rows(`insert into "MonitorEvent"(id, at, service, code, message) values (gen_random_uuid(), ${old(2)}, 'g4gov', 'G4GOV', 'recent event')`);
  for (const d of [100, 101, 102]) await rows(`insert into "AiUsageDaily"(id, day, "collegeKey", purpose, provider, model, feature, calls, "updatedAt") values (gen_random_uuid(), (now() - interval '${d} days')::date, 'platform', 'TEXT', 'GROQ', 'g4gov', 'g4gov', 1, now())`);
  await rows(`insert into "AiUsageDaily"(id, day, "collegeKey", purpose, provider, model, feature, calls, "updatedAt") values (gen_random_uuid(), (now() - interval '3 days')::date, 'platform', 'TEXT', 'GROQ', 'g4gov-keep', 'g4gov', 1, now())`);
  const outside = async () => ({ jobRun: await n1(`select count(*)::int n from "JobRun" where "slotAt" < now() - interval '30 days'`), monitorEvent: await n1(`select count(*)::int n from "MonitorEvent" where "at" < now() - interval '7 days'`), aiUsage: await n1(`select count(*)::int n from "AiUsageDaily" where day < (now() - interval '30 days')::date`) });
  const o30 = await outside(); const polB = JSON.stringify(await rows(`select * from "PlatformPolicy"`));
  const nc = await ret({ jobRunDays: 30, monitorEventDays: 7, aiUsageDays: 30 });
  t(PO, "SHORTENING NEEDS CONFIRMATION: refused with 409 CONFIRMATION_REQUIRED, and the response states exactly how many records of each kind the next cleanup would delete (equal to an independent SQL count)", nc.s === 409 && nc.code === "CONFIRMATION_REQUIRED" && nc.j.error.details.wouldDelete.jobRun === o30.jobRun && nc.j.error.details.wouldDelete.monitorEvent === o30.monitorEvent && nc.j.error.details.wouldDelete.aiUsage === o30.aiUsage && o30.jobRun >= 5600, JSON.stringify(nc.j?.error?.details) + JSON.stringify(o30));
  t(PO, "the refusal changed nothing: the policy row is identical and every seeded record is still there", JSON.stringify(await rows(`select * from "PlatformPolicy"`)) === polB && (await n1(`select count(*)::int n from "JobRun" where job like 'g4gov%'`)) === 5601);
  const snapBefore = { students: await n1(`select count(*)::int n from "Student"`), docs: await n1(`select count(*)::int n from "StudentDocument"`), users: await n1(`select count(*)::int n from "User"`), colleges: await n1(`select count(*)::int n from "College"`), appAudit: await n1(`select count(*)::int n from "AuditLog" where action not like 'retention.%'`), notif: await n1(`select count(*)::int n from "Notification"`) };
  const conf = await ret({ jobRunDays: 30, monitorEventDays: 7, aiUsageDays: 30, confirm: true });
  t(PO, "with confirm: true the change is saved and audited with before, after and the number of records affected at the next cleanup; NOTHING is deleted by saving", conf.s === 200 && conf.d.changed === true && conf.d.rowsAffectedAtNextCleanup.jobRun === o30.jobRun && (await n1(`select count(*)::int n from "JobRun" where job like 'g4gov%'`)) === 5601 && (await n1(`select count(*)::int n from "MonitorEvent" where service='g4gov'`)) === 41);
  const ua = (await rows(`select detail from "PlatformAuditLog" where action='policy.retention.update' order by "createdAt" desc limit 1`))[0].detail;
  t(PO, "the audit row records the earlier values (365/90/365), the new values (30/7/30), that it was confirmed, and the rows affected", ua.before.jobRun === 365 && ua.after.jobRun === 30 && ua.after.monitorEvent === 7 && ua.confirmed === true && ua.rowsAffectedAtNextCleanup.jobRun === o30.jobRun, JSON.stringify(ua).slice(0, 250));
  t(PO, "the new period is applied where it is used: job history now reports 30 days of retention", (await P("GET", "/api/platform/monitoring/jobs")).d.retentionDays === 30);
  const cl1 = await P("POST", "/api/platform/policy/retention/run");
  const after1 = await outside();
  t(PO, "THE CLEANUP IS BOUNDED: the first run removes at most 5 batches of 1,000 job records (5,000), reports 'capped' because more remains, and the remainder is still there", cl1.s === 200 && cl1.d.jobRuns === 5000 && cl1.d.capped === true && after1.jobRun === o30.jobRun - 5000, JSON.stringify(cl1.d) + JSON.stringify(after1));
  t(PO, "the same run removed exactly the expired monitoring events and AI usage rows (equal to SQL), and kept every record inside its period", cl1.d.monitorEvents === o30.monitorEvent && cl1.d.aiUsageDays === o30.aiUsage && (await n1(`select count(*)::int n from "JobRun" where job='g4gov-keep'`)) === 1 && (await n1(`select count(*)::int n from "MonitorEvent" where message='recent event'`)) === 1 && (await n1(`select count(*)::int n from "AiUsageDaily" where model='g4gov-keep'`)) === 1 && (await n1(`select count(*)::int n from "MonitorEvent" where message='old event'`)) === 0);
  const cl2 = await P("POST", "/api/platform/policy/retention/run"), cl3 = await P("POST", "/api/platform/policy/retention/run");
  const after3 = await outside();
  t(PO, "later runs finish the backlog (second run removes the rest, third removes nothing and is not capped); nothing newer than the period is ever touched", cl2.d.jobRuns === o30.jobRun - 5000 && cl2.d.capped === false && cl3.d.jobRuns === 0 && cl3.d.monitorEvents === 0 && after3.jobRun === 0 && (await n1(`select count(*)::int n from "JobRun" where job='g4gov-keep'`)) === 1, `${cl2.d?.jobRuns} ${cl3.d?.jobRuns}`);
  const cleanAudit = await rows(`select detail, "adminId", email from "PlatformAuditLog" where action='retention.cleanup' order by "createdAt"`);
  t(PO, "every cleanup run is audited with who ran it, what was removed and whether it was capped", cleanAudit.length === 3 && cleanAudit.every((a) => a.adminId === p1Id && a.detail.trigger === "administrator") && cleanAudit[0].detail.jobRuns === 5000 && cleanAudit[0].detail.capped === true);
  const afterS = { students: await n1(`select count(*)::int n from "Student"`), docs: await n1(`select count(*)::int n from "StudentDocument"`), users: await n1(`select count(*)::int n from "User"`), colleges: await n1(`select count(*)::int n from "College"`), appAudit: await n1(`select count(*)::int n from "AuditLog" where action not like 'retention.%'`), notif: await n1(`select count(*)::int n from "Notification"`) };
  t(PO, "NO STUDENT OR INSTITUTION DATA IS TOUCHED: student, document, user, institution, institution audit and notification counts are identical before and after the cleanup", JSON.stringify(snapBefore) === JSON.stringify(afterS), JSON.stringify([snapBefore, afterS]));
  // scheduled (hourly) path
  await rows(`insert into "MonitorEvent"(id, at, service, code, message) select gen_random_uuid(), ${old(30)}, 'g4gov', 'G4GOV', 'old event' from generate_series(1, 3)`);
  const cron = await fetch(BASE + "/api/notifications/round-reminders/run", { method: "POST", headers: { authorization: "Bearer " + process.env.CRON_SECRET } });
  const sysAudit = await rows(`select detail, "adminId", email from "PlatformAuditLog" where action='retention.cleanup' and "adminId" is null`);
  t(PO, "the hourly scheduled job uses the same configured retention and audits as 'system' (no administrator) when it removed records", cron.status === 200 && sysAudit.length === 1 && sysAudit[0].email === "system" && sysAudit[0].detail.trigger === "scheduled job" && sysAudit[0].detail.monitorEvents === 3 && (await n1(`select count(*)::int n from "MonitorEvent" where message='old event'`)) === 0);
  const idle = await P("POST", "/api/platform/policy/retention/run");
  t(PO, "a run with nothing to remove is reported honestly (zeros), not capped", idle.s === 200 && idle.d.jobRuns === 0 && idle.d.monitorEvents === 0 && idle.d.capped === false);
  const race = await Promise.all([ret({ jobRunDays: 120 }), P2("PUT", "/api/platform/policy/retention", { jobRunDays: 200 })]);
  const ra = await rows(`select detail from "PlatformAuditLog" where action='policy.retention.update' order by "createdAt" desc limit 2`);
  const fin = (await rows(`select "retentionJobRunDays" d from "PlatformPolicy"`))[0].d;
  t(PO, "CONCURRENCY: two administrators changing retention at the same moment are applied one after the other: the stored value is one of them and the audit rows chain", race.every((r) => r.s === 200) && [120, 200].includes(fin) && ra.length === 2 && ra[0].detail.before.jobRun === ra[1].detail.after.jobRun && ra[0].detail.after.jobRun === fin, JSON.stringify(ra));
  const reset = await ret({ jobRunDays: null, monitorEventDays: null, aiUsageDays: null });
  const pol1 = await P("GET", "/api/platform/policy");
  t(PO, "null restores the built-in defaults (90 / 14 / 90 days, source 'default')", reset.s === 200 && pol1.d.retention.items.map((i) => `${i.days}:${i.source}`).join() === "90:default,14:default,90:default");
  t(PO, "the policy and retention responses contain no secrets and no personal data", !leaks(JSON.stringify([pol0.j, pol1.j, cl1.j])) && !JSON.stringify(pol1.j).includes(process.env.SEED_ADMIN_EMAIL));
  // ================= logo address policy (approved additional fix) =================
  const logoBad = [], tryLogo = async (url) => (await adminA("PATCH", "/api/settings/college", { logoUrl: url })).s;
  for (const u of ["javascript:alert(1)", "data:text/html;base64,AAAA", "ftp://example.com/x.png", "file:///etc/passwd", "vbscript:x", "//example.com/x.png", "not a url", "JAVASCRIPT:alert(1)"]) { if ((await tryLogo(u)) !== 400) logoBad.push(u); }
  const okHttps = await tryLogo("https://example.com/logo.png"), okHttp = await tryLogo("http://example.com/logo.png"), okNull = await tryLogo(null);
  t(["SA-TC-044", "SA-TC-067"], "LOGO POLICY: an institution's own settings accept only http and https logo addresses; javascript:, data:, ftp:, file:, vbscript:, protocol-relative and malformed values are refused (400), https/http/null are accepted", logoBad.length === 0 && okHttps === 200 && okHttp === 200 && okNull === 200, logoBad.join(" "));
  // ================= sweep =================
  const server = out.join("").split("\n").filter((l) => !/^\s*(GET|POST|PUT|PATCH|DELETE) \//.test(l)).join("\n");
  t([...SE, ...IN], "SWEEP: nothing the server printed during the run contains a sentinel secret or key", !leaks(server), server.slice(0, 200));
  const allAudit = JSON.stringify(await rows(`select detail from "PlatformAuditLog" where "createdAt" > now() - interval '2 hours'`));
  t(PO, "SWEEP: no secret or password appears in any platform audit row written during the run", !leaks(allAudit) && !allAudit.includes(pw));
} catch (e) {
  console.error(e); R.t(PO, "suite ran to completion", false, String(e?.stack ?? e), "");
} finally {
  await pgc.query(`delete from "PlatformPolicy"`).catch(() => 0);
  await pgc.query(`delete from "PlatformAuditLog" where action like 'policy.%' or action like 'retention.%'`).catch(() => 0);
  await pgc.query(`delete from "JobRun" where job like 'g4gov%'`).catch(() => 0);
  await pgc.query(`delete from "MonitorEvent" where service='g4gov'`).catch(() => 0);
  await pgc.query(`delete from "AiUsageDaily" where feature='g4gov'`).catch(() => 0);
  if (savedAdmins.length) await pgc.query(`update "PlatformAdmin" set "isActive"=true where id = any($1)`, [savedAdmins]).catch(() => 0);
  await pgc.query(`update "CollegeSettings" set "requireMfaForAdmins"=false where "collegeId" = any($1)`, [created.colleges]).catch(() => 0);
  await pgc.query(`update "College" set "logoUrl"=null where id=$1`, [colA]).catch(() => 0);
  for (const c of created.colleges) { await pgc.query(`delete from "AuditLog" where "collegeId"=$1`, [c]).catch(() => 0); await pgc.query(`update "College" set "isActive"=false where id=$1`, [c]).catch(() => 0); }
  await pgc.query(`delete from "User" where email like 'g4gov%@example.com'`).catch(() => 0);
  await pgc.end().catch(() => 0); stopApp(); try { groqSrv.close(); claudeSrv.close(); } catch { /* closed */ }
}
process.exit(R.done() ? 1 : 0);

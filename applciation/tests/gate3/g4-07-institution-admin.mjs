// Gate 4: institution detail, editing and usage (SA-TC-043, 044, 046). Own dev-server instance on port 3118, local Docker stack only, synthetic data.
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g4-07-institution-admin");
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const PORT = 3118, BASE = `http://localhost:${PORT}`, WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const env = { ...process.env, PORT: String(PORT), RATE_LIMIT_DISABLED: "true", FLOOD_MAX_PER_MINUTE: "100000", APP_URL: BASE, REQUIRE_LOCAL_DB: "true" };
const app = spawn(WIN ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], { env, detached: !WIN, stdio: "ignore", shell: WIN, windowsHide: true });
const stopApp = () => { try { if (WIN) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-app.pid); } catch { /* gone */ } };
process.on("exit", stopApp);
const wait = async (path, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + path)).ok) return true; } catch { /* starting */ } await sleep(900); } return false; };
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pw = `G4-inst-${tag}-Pw!`;
const mails = { p1: `g4in1${tag}@example.com`, p3: `g4in3${tag}@example.com`, p4: `g4in4${tag}@example.com`, b: `g4inb${tag}@example.com`, c: `g4inc${tag}@example.com`, po: `g4inpo${tag}@example.com` };
const mkAdmin = (e) => { const r = spawnSync(WIN ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: WIN, env: { ...process.env, PLATFORM_ADMIN_EMAIL: e, PLATFORM_ADMIN_NAME: "G4 Inst " + e.slice(4, 7), PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr); };
const withMfa = async (e) => { const c = client(await login(e, pw), BASE); const enr = await c("POST", "/api/platform/mfa/enroll"); const tok = (await c("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token; return client(tok, BASE); };
const raw = (m, p, b, h = {}) => fetch(BASE + p, { method: m, headers: { "content-type": "application/json", ...h }, body: b === undefined ? undefined : typeof b === "string" ? b : JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));
const created = { colleges: [] }; let colA = null; const seeded = { logins: [], docs: [], ai: [] };
const ALLM = ["ONBOARDING", "PSYCHOMETRICS", "DRIVES", "ATTENDANCE_BLOCKING", "ANALYTICS", "ASSESSMENTS", "EMPLOYER_CRM", "STUDENT_PREP", "INTERNSHIPS", "EVENTS", "LEARNING", "RECRUITER_PORTAL", "TALENT_SHOWCASE"];
try {
  t(["SA-TC-043"], "the instance under test starts", await wait("/api/health/live"));
  for (const e of [mails.p1, mails.p3, mails.p4]) mkAdmin(e);
  const P = await withMfa(mails.p1); await withMfa(mails.p3);
  const aal1 = client(await login(mails.p3, pw), BASE), noMfa = client(await login(mails.p4, pw), BASE);
  const p1Id = (await rows(`select id from "PlatformAdmin" where email=$1`, [mails.p1]))[0].id;
  const adminA = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD), BASE);
  colA = (await rows(`select "collegeId" id from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL]))[0].id;
  const prov = async (name, slug, email) => { const r = await P("POST", "/api/platform/institutions", { name, slug, admin: { name: name + " Admin", email }, departments: [{ code: "CSE", name: "Computer Science" }, { code: "ECE", name: "Electronics" }], academicYear: { name: "2026-27", startDate: "2026-06-01", endDate: "2027-05-31" } }); const id = (await rows(`select id from "College" where slug=$1`, [slug]))[0]?.id; if (id) created.colleges.push(id); const u = (await rows(`select id from "User" where email=$1`, [email]))[0]; await sb.auth.admin.updateUserById(u.id, { password: pw, email_confirm: true }); return { id, r }; };
  const B = await prov(`G4 Inst Bravo ${tag}`, `g4-inst-b-${tag}`, mails.b), C = await prov(`G4 Inst Charlie ${tag}`, `g4-inst-c-${tag}`, mails.c);
  const adminB = client(await login(mails.b, pw), BASE);
  const po = await sb.auth.admin.createUser({ email: mails.po, password: pw, email_confirm: true });
  await rows(`insert into "User"(id,"collegeId",email,name,role,"updatedAt") values ($1,$2,$3,'G4 Officer','PLACEMENT_OFFICER',now())`, [po.data.user.id, colA, mails.po]).catch(() => rows(`insert into "User"(id,"collegeId",email,name,role) values ($1,$2,$3,'G4 Officer','PLACEMENT_OFFICER')`, [po.data.user.id, colA, mails.po]));
  const officer = client(await login(mails.po, pw), BASE);
  const S = await makeStudents(adminA, 2, "INS"); const stu = client(S.tokens.A, BASE);
  const stuRows = await rows(`select name, "enrollmentNo", email from "Student" where id = any($1)`, [[S.ids.A, S.ids.B]]);

  // ============ access (all three cases) ============
  const dummy = "00000000-0000-4000-8000-000000000001";
  const eps = [["GET", `/api/platform/institutions/${B.id}`], ["GET", `/api/platform/institutions/${B.id}/usage`], ["PATCH", `/api/platform/institutions/${B.id}`, { name: "Refused Rename Name" }]];
  const who = [["anonymous", (m, p, b) => raw(m, p, b)], ["garbage token", (m, p, b) => raw(m, p, b, { authorization: "Bearer not.a.token" })], ["administrator of THAT institution", (m, p, b) => adminB(m, p, b)], ["administrator of another institution", (m, p, b) => adminA(m, p, b)], ["placement officer", (m, p, b) => officer(m, p, b)], ["student", (m, p, b) => stu(m, p, b)], ["platform admin, no second step", (m, p, b) => aal1(m, p, b)], ["platform admin, no authenticator", (m, p, b) => noMfa(m, p, b)]];
  const bad = []; const snapB = JSON.stringify(await rows(`select * from "College" where id=$1`, [B.id]));
  for (const [n, f] of who) for (const [m, p, b] of eps) { const r = await f(m, p, b); const code = r.j?.error?.code; const ok = n === "anonymous" || n === "garbage token" ? r.s === 401 : n.includes("no second step") ? r.s === 403 && code === "MFA_REQUIRED" : n.includes("no authenticator") ? r.s === 403 && code === "MFA_SETUP_REQUIRED" : r.s === 403; if (!ok) bad.push(`${n} ${m} -> ${r.s} ${code}`); }
  t(["SA-TC-043", "SA-TC-044", "SA-TC-046"], "detail, usage and edit are refused to everyone but a verified platform administrator: anonymous/garbage 401; the institution's own administrator, another institution's administrator, an officer and a student 403; no second step MFA_REQUIRED; no authenticator MFA_SETUP_REQUIRED", bad.length === 0, bad.slice(0, 3).join("; "));
  t(["SA-TC-044"], "the refused edits changed nothing and wrote no audit row", JSON.stringify(await rows(`select * from "College" where id=$1`, [B.id])) === snapB && (await rows(`select count(*)::int n from "AuditLog" where "collegeId"=$1 and action='institution.update'`, [B.id]))[0].n === 0);
  const nf = [await P("GET", `/api/platform/institutions/${dummy}`), await P("GET", `/api/platform/institutions/not-a-uuid`), await P("GET", `/api/platform/institutions/${dummy}/usage`), await P("PATCH", `/api/platform/institutions/${dummy}`, { name: "Does Not Exist" }), await P("PATCH", `/api/platform/institutions/not-a-uuid`, { name: "Does Not Exist" })];
  t(["SA-TC-043", "SA-TC-044", "SA-TC-046"], "an unknown or malformed institution id is a clean 404 on detail, usage and edit", nf.every((r) => r.s === 404), nf.map((r) => r.s).join());
  const verbs = [await P("DELETE", `/api/platform/institutions/${B.id}`), await P("POST", `/api/platform/institutions/${B.id}/usage`, {}), await P("PUT", `/api/platform/institutions/${B.id}`, {})];
  t(["SA-TC-044", "SA-TC-046"], "there is no delete route, and usage is read-only: DELETE, PUT and POST on these paths are 405", verbs.every((r) => r.s === 405), verbs.map((r) => r.s).join());

  // ============ detail (SA-TC-043) ============
  const detA = await P("GET", `/api/platform/institutions/${colA}`); const d = detA.d;
  const dbA = (await rows(`select name, slug, "logoUrl", "brandColor", "isActive", "createdAt" at time zone 'UTC' as "createdAt", "updatedAt" at time zone 'UTC' as "updatedAt" from "College" where id=$1`, [colA]))[0];
  t(["SA-TC-043"], "name, address (slug), status, created date, logo and colour equal the database", detA.s === 200 && d.name === dbA.name && d.slug === dbA.slug && d.isActive === dbA.isActive && d.registrationStatus === (dbA.isActive ? "ACTIVE" : "SUSPENDED") && new Date(d.createdAt).getTime() === dbA.createdAt.getTime() && d.logoUrl === dbA.logoUrl && d.brandColor === dbA.brandColor, JSON.stringify(detA.j).slice(0, 200));
  const mods = await rows(`select module, enabled from "CollegeModule" where "collegeId"=$1`, [colA]);
  t(["SA-TC-043"], "the module list shows every module with the stored enabled state", d.modules.length === ALLM.length && d.modules.every((m) => m.enabled === (mods.find((x) => x.module === m.module)?.enabled === true)));
  const fa = (await rows(`select name, email from "User" where "collegeId"=$1 and role='TPO_ADMIN' order by "createdAt", id limit 1`, [colA]))[0];
  t(["SA-TC-043"], "the first administrator is the earliest Head TPO account (name and e-mail only)", d.firstAdministrator?.email === fa.email && d.firstAdministrator?.name === fa.name);
  const cnt = async (sql) => (await rows(sql, [colA]))[0].n;
  t(["SA-TC-043"], "staff, student, department, programme and batch counts equal SQL", d.counts.staff === await cnt(`select count(*)::int n from "User" where "collegeId"=$1`) && d.counts.students === await cnt(`select count(*)::int n from "Student" where "collegeId"=$1`) && d.counts.activeStudents === await cnt(`select count(*)::int n from "Student" where "collegeId"=$1 and "isActive" and not "isArchived"`) && d.counts.departments === await cnt(`select count(*)::int n from "Department" where "collegeId"=$1`) && d.counts.programs === await cnt(`select count(*)::int n from "Program" where "collegeId"=$1`) && d.counts.batches === await cnt(`select count(*)::int n from "Batch" where "collegeId"=$1`), JSON.stringify(d.counts));
  const lastSql = (await rows(`select greatest((select max("createdAt") from "LoginEvent" where "collegeId"=$1), (select max("createdAt") from "AuditLog" where "collegeId"=$1 and "actorId" is not null)) at time zone 'UTC' m`, [colA]))[0].m;
  t(["SA-TC-043"], "last activity equals the latest college sign-in or staff action in the database", (d.lastActivity ? new Date(d.lastActivity).getTime() : null) === (lastSql ? lastSql.getTime() : null), `${d.lastActivity} vs ${lastSql?.toISOString()}`);
  const dj = JSON.stringify(detA.j);
  t(["SA-TC-043"], "the detail contains no college records: none of the students' names, enrolment numbers or e-mails, and no staff list", stuRows.every((r) => !dj.includes(r.name) && !dj.includes(r.enrollmentNo) && !dj.includes(r.email)) && !/"(students|users|staffList|phone|cgpa|enrollmentNo)"\s*:\s*\[/.test(dj) && !dj.includes(mails.po));
  const dB = await P("GET", `/api/platform/institutions/${B.id}`);
  t(["SA-TC-043"], "another institution's detail is its own: B's name, slug and administrator, and none of A's", dB.d.name === `G4 Inst Bravo ${tag}` && dB.d.firstAdministrator.email === mails.b && !JSON.stringify(dB.j).includes(d.name) && dB.d.counts.students === 0);
  t(["SA-TC-043"], "no billing or subscription fields are returned", !/price|plan|invoice|billing|subscription|payment/i.test(dj));

  // ============ editing (SA-TC-044) ============
  const d0 = (await P("GET", `/api/platform/institutions/${B.id}`)).d;
  const e1 = await P("PATCH", `/api/platform/institutions/${B.id}`, { name: `  G4 Inst   Bravo Renamed ${tag} `, brandColor: "#12ab34", logoUrl: "https://example.com/logo.png", expectedUpdatedAt: d0.updatedAt });
  const rB = (await rows(`select name, "brandColor", "logoUrl", "updatedAt" from "College" where id=$1`, [B.id]))[0];
  t(["SA-TC-044"], "a valid edit of name (spaces collapsed), colour and logo persists and returns the new values", e1.s === 200 && rB.name === `G4 Inst Bravo Renamed ${tag}` && rB.brandColor === "#12ab34" && rB.logoUrl === "https://example.com/logo.png" && e1.d.name === rB.name, JSON.stringify(e1.j).slice(0, 200));
  const seen = await adminB("GET", "/api/settings/college");
  t(["SA-TC-044"], "the institution sees the new name, colour and logo in its own settings", seen.d?.name === rB.name && seen.d.brandColor === "#12ab34" && seen.d.logoUrl === "https://example.com/logo.png", JSON.stringify(seen.j).slice(0, 150));
  const au1 = (await rows(`select before, after, "platformActorId", "actorId", "createdAt" from "AuditLog" where "collegeId"=$1 and action='institution.update' order by "createdAt"`, [B.id]));
  t(["SA-TC-044"], "the audit row names the platform administrator and holds before and after for exactly the changed fields", au1.length === 1 && au1[0].platformActorId === p1Id && au1[0].actorId === null && au1[0].before.name === `G4 Inst Bravo ${tag}` && au1[0].after.name === rB.name && au1[0].after.brandColor === "#12ab34" && au1[0].before.brandColor === null && !!au1[0].createdAt, JSON.stringify(au1[0]).slice(0, 250));
  const inv = [["name too short", { name: "ab" }], ["name too long", { name: "x".repeat(201) }], ["bad colour", { brandColor: "red" }], ["colour without #", { brandColor: "12ab34" }], ["javascript: logo", { logoUrl: "javascript:alert(1)" }], ["ftp logo", { logoUrl: "ftp://example.com/x.png" }], ["data: logo", { logoUrl: "data:text/html;base64,AAAA" }], ["unknown module", { modules: ["NOT_A_MODULE"] }], ["unknown field (slug)", { slug: "hacked" }], ["unknown field (id)", { id: dummy, name: "Valid Name Here" }], ["empty body", {}], ["bad expectedUpdatedAt", { name: "Valid Name Here", expectedUpdatedAt: "yesterday" }], ["isActive as string", { isActive: "yes" }]];
  const badInv = []; const snap2 = JSON.stringify(await rows(`select * from "College" where id=$1`, [B.id]));
  for (const [n, b] of inv) { const r = await P("PATCH", `/api/platform/institutions/${B.id}`, b); if (r.s !== 400) badInv.push(`${n}:${r.s}`); }
  const mj = await raw("PATCH", `/api/platform/institutions/${B.id}`, "{nope", { authorization: "Bearer " + "x" });
  t(["SA-TC-044"], "invalid edits are refused with 400 (short/long name, bad colour, javascript:/ftp:/data: logo, unknown module, unknown fields including slug and id, empty body, bad version, wrong types) and change nothing", badInv.length === 0 && JSON.stringify(await rows(`select * from "College" where id=$1`, [B.id])) === snap2, badInv.join(","));
  const dupU = await P("PATCH", `/api/platform/institutions/${B.id}`, { name: `  g4 INST charlie ${tag}  ` });
  t(["SA-TC-044"], "renaming to another institution's name (any case or spacing) is refused with 409 DUPLICATE_INSTITUTION and nothing changes", dupU.s === 409 && dupU.j?.error?.code === "DUPLICATE_INSTITUTION" && (await rows(`select name from "College" where id=$1`, [B.id]))[0].name === rB.name, JSON.stringify(dupU.j).slice(0, 150));
  const dupSelf = await P("PATCH", `/api/platform/institutions/${B.id}`, { name: `g4 inst bravo RENAMED ${tag}` });
  t(["SA-TC-044"], "changing only the letter case of the institution's own name is allowed (it is not a duplicate of itself)", dupSelf.s === 200 && (await rows(`select name from "College" where id=$1`, [B.id]))[0].name === `g4 inst bravo RENAMED ${tag}`);
  await P("PATCH", `/api/platform/institutions/${B.id}`, { name: rB.name });
  const upBefore = (await rows(`select "updatedAt" u from "College" where id=$1`, [B.id]))[0].u, auN = (await rows(`select count(*)::int n from "AuditLog" where "collegeId"=$1`, [B.id]))[0].n;
  const noop = await P("PATCH", `/api/platform/institutions/${B.id}`, { name: rB.name, brandColor: "#12ab34" });
  t(["SA-TC-044"], "an edit that changes nothing writes no audit row and leaves updatedAt alone", noop.s === 200 && (await rows(`select "updatedAt" u from "College" where id=$1`, [B.id]))[0].u.getTime() === upBefore.getTime() && (await rows(`select count(*)::int n from "AuditLog" where "collegeId"=$1`, [B.id]))[0].n === auN);
  const cBefore = JSON.stringify(await rows(`select name, "brandColor", "logoUrl" from "College" where id=$1`, [C.id]));
  t(["SA-TC-044"], "editing B did not touch institution C or A", JSON.stringify(await rows(`select name, "brandColor", "logoUrl" from "College" where id=$1`, [C.id])) === cBefore && (await rows(`select name from "College" where id=$1`, [colA]))[0].name === dbA.name);
  // modules
  const drivesBefore = await adminB("GET", "/api/drives");
  const tbl = async () => JSON.stringify([(await rows(`select count(*)::int n from "Student" where "collegeId"=$1`, [B.id]))[0].n, (await rows(`select count(*)::int n from "Department" where "collegeId"=$1`, [B.id]))[0].n, (await rows(`select count(*)::int n from "User" where "collegeId"=$1`, [B.id]))[0].n]);
  await rows(`insert into "Company"(id,"collegeId",name,"updatedAt") values (gen_random_uuid(),$1,'G4 Keep Co',now())`, [B.id]).catch(() => 0);
  const compBefore = (await rows(`select count(*)::int n from "Company" where "collegeId"=$1`, [B.id]))[0].n; const tb0 = await tbl();
  const without = ALLM.filter((m) => m !== "DRIVES");
  const rm = await P("PATCH", `/api/platform/institutions/${B.id}`, { modules: without });
  const meB = await adminB("GET", "/api/me"), drivesAfter = await adminB("GET", "/api/drives");
  t(["SA-TC-044"], "removing a module takes effect: the institution's module list no longer has it and its API refuses the module's routes (403)", rm.s === 200 && drivesBefore.s === 200 && !meB.d.modules.includes("DRIVES") && meB.d.modules.length === 12 && drivesAfter.s === 403, `${drivesBefore.s} ${drivesAfter.s}`);
  t(["SA-TC-044"], "removing a module deletes no data: the module row is kept (switched off) and the institution's rows are all still there", (await rows(`select enabled from "CollegeModule" where "collegeId"=$1 and module='DRIVES'`, [B.id]))[0]?.enabled === false && (await tbl()) === tb0 && (await rows(`select count(*)::int n from "Company" where "collegeId"=$1`, [B.id]))[0].n === compBefore);
  const auM = (await rows(`select before, after from "AuditLog" where "collegeId"=$1 and action='institution.update' order by "createdAt" desc limit 1`, [B.id]))[0];
  t(["SA-TC-044"], "the module change is audited with the previous and the new module list", auM.before.modules.includes("DRIVES") && !auM.after.modules.includes("DRIVES") && auM.after.modules.length === 12 && auM.before.modules.length === 13);
  const back = await P("PATCH", `/api/platform/institutions/${B.id}`, { modules: ALLM });
  t(["SA-TC-044"], "adding the module back restores access with the same rows (no duplicate row)", back.s === 200 && (await adminB("GET", "/api/drives")).s === 200 && (await rows(`select count(*)::int n from "CollegeModule" where "collegeId"=$1 and module='DRIVES'`, [B.id]))[0].n === 1);
  const none = await P("PATCH", `/api/platform/institutions/${C.id}`, { modules: [] });
  t(["SA-TC-044"], "an institution can be given an empty module set, which keeps all 13 rows (switched off); restoring works", none.s === 200 && (await rows(`select count(*)::int n from "CollegeModule" where "collegeId"=$1`, [C.id]))[0].n === 13 && (await rows(`select count(*)::int n from "CollegeModule" where "collegeId"=$1 and enabled`, [C.id]))[0].n === 0 && (await P("PATCH", `/api/platform/institutions/${C.id}`, { modules: ALLM })).s === 200);
  // status through the same route
  const sus = await P("PATCH", `/api/platform/institutions/${C.id}`, { isActive: false });
  const sIn = await client(await login(mails.c, pw), BASE)("GET", "/api/settings/college");
  const actC = await P("PATCH", `/api/platform/institutions/${C.id}`, { isActive: true });
  t(["SA-TC-044"], "suspending through the edit route blocks the institution's sign-ins, is audited as institution.deactivate with before/after, and reactivating restores them", sus.s === 200 && sIn.s !== 200 && actC.s === 200 && (await rows(`select action, before, after from "AuditLog" where "collegeId"=$1 and action like 'institution.%activate' order by "createdAt"`, [C.id])).map((r) => `${r.action}:${r.before.isActive}>${r.after.isActive}`).join() === "institution.deactivate:true>false,institution.activate:false>true", String(sIn.s));

  // concurrent editing
  const dc = (await P("GET", `/api/platform/institutions/${B.id}`)).d;
  const race = await Promise.all([P("PATCH", `/api/platform/institutions/${B.id}`, { brandColor: "#111111", expectedUpdatedAt: dc.updatedAt }), P("PATCH", `/api/platform/institutions/${B.id}`, { brandColor: "#222222", expectedUpdatedAt: dc.updatedAt })]);
  const winner = race.find((r) => r.s === 200), loser = race.find((r) => r.s === 409);
  t(["SA-TC-044"], "two editors who both opened the same version: exactly one save wins (200), the other is refused with 409 STALE, and the stored value is the winner's", !!winner && !!loser && loser.j.error.code === "STALE" && (await rows(`select "brandColor" c from "College" where id=$1`, [B.id]))[0].c === winner.d.brandColor, race.map((r) => r.s).join());
  const stale = await P("PATCH", `/api/platform/institutions/${B.id}`, { brandColor: "#333333", expectedUpdatedAt: dc.updatedAt });
  t(["SA-TC-044"], "saving with an old version later is refused (409 STALE) and nothing is overwritten", stale.s === 409 && stale.j.error.code === "STALE" && (await rows(`select "brandColor" c from "College" where id=$1`, [B.id]))[0].c === winner.d.brandColor);
  const nA = `G4 Inst Same Name ${tag}`;
  const race2 = await Promise.all([P("PATCH", `/api/platform/institutions/${B.id}`, { name: nA }), P("PATCH", `/api/platform/institutions/${C.id}`, { name: nA.toLowerCase() })]);
  t(["SA-TC-044"], "two simultaneous renames of two institutions to the same name: one wins, the other gets 409 DUPLICATE_INSTITUTION; there are never two with that name", race2.map((r) => r.s).sort().join() === "200,409" && (await rows(`select count(*)::int n from "College" where lower(name)=lower($1)`, [nA]))[0].n === 1, race2.map((r) => r.s).join());
  const before3 = (await rows(`select count(*)::int n from "AuditLog" where "collegeId"=$1 and action='institution.update'`, [B.id]))[0].n;
  const race3 = await Promise.all([P("PATCH", `/api/platform/institutions/${B.id}`, { logoUrl: "https://example.com/one.png" }), P("PATCH", `/api/platform/institutions/${B.id}`, { logoUrl: "https://example.com/two.png" })]);
  const aud3 = await rows(`select before, after from "AuditLog" where "collegeId"=$1 and action='institution.update' and after ? 'logoUrl' order by "createdAt" desc limit 2`, [B.id]);
  const finalLogo = (await rows(`select "logoUrl" l from "College" where id=$1`, [B.id]))[0].l;
  t(["SA-TC-044"], "two simultaneous edits without a version both succeed one after the other: the stored value is one of them, and the audit rows chain (the later 'before' is the earlier 'after')", race3.every((r) => r.s === 200) && aud3.length === 2 && aud3[0].before.logoUrl === aud3[1].after.logoUrl && aud3[0].after.logoUrl === finalLogo && (await rows(`select count(*)::int n from "AuditLog" where "collegeId"=$1 and action='institution.update'`, [B.id]))[0].n === before3 + 2, JSON.stringify(aud3));
  const detB = await P("GET", `/api/platform/institutions/${B.id}`);
  t(["SA-TC-044", "SA-TC-043"], "the detail shows the change history (who, when, before and after), newest first, with the administrator's name", detB.d.history.length >= 5 && detB.d.history[0].by?.name?.startsWith("G4 Inst") && detB.d.history[0].after && new Date(detB.d.history[0].createdAt) >= new Date(detB.d.history[1].createdAt) && detB.d.history.every((h) => h.action.startsWith("institution.")));
  const view = await P("GET", `/api/platform/audit-logs?q=${encodeURIComponent("institution.update")}&institution=${B.id}&pageSize=50`);
  t(["SA-TC-044"], "the platform audit viewer lists the edits with the administrator and institution", view.s === 200 && view.d.items.length >= 4 && view.d.items.every((e) => e.institution?.id === B.id && e.actor?.email === mails.p1));

  // ============ usage (SA-TC-046) ============
  const D = (n) => new Date(Date.UTC(2026, 4, n)).toISOString().slice(0, 10); // days in May 2026
  const stId = S.ids.A;
  const L = (day, h, m, s, ms, user) => { const id = randomUUID(); seeded.logins.push(id); return rows(`insert into "LoginEvent"(id,"collegeId","userId",kind,"sessionId","createdAt") values ($1,$2,$3,'staff',$4,$5)`, [id, colA, user, "g4inst-" + id, `${D(day)}T${h}:${m}:${s}.${ms}Z`]); };
  const u1 = randomUUID(), u2 = randomUUID();
  await L(10, "00", "00", "00", "000", u1); await L(10, "12", "00", "00", "000", u1); await L(11, "23", "59", "59", "999", u2); await L(12, "00", "00", "00", "000", u2); await L(12, "08", "00", "00", "000", u1); await L(20, "10", "00", "00", "000", u1);
  const doc = (day, size) => { const id = randomUUID(); seeded.docs.push(id); return rows(`insert into "StudentDocument"(id,"collegeId","studentId",category,"storagePath","fileName","mimeType","sizeBytes","createdAt","archivedAt") values ($1,$2,$3,'TENTH_MARKS',$4,'g4.pdf','application/pdf',$5,$6,$7)`, [id, colA, stId, "g4inst/" + id, size, `${D(day)}T09:00:00Z`, null]); };
  await doc(10, 1000); await doc(11, 2000); await doc(15, 4000);
  const arch = randomUUID(); seeded.docs.push(arch); await rows(`insert into "StudentDocument"(id,"collegeId","studentId",category,"storagePath","fileName","mimeType","sizeBytes","createdAt","archivedAt") values ($1,$2,$3,'TENTH_MARKS',$4,'g4old.pdf','application/pdf',8000,$5,now())`, [arch, colA, stId, "g4inst/" + arch, `${D(10)}T10:00:00Z`]);
  const ai = (day, purpose, calls, fail, blocked, model) => { const id = randomUUID(); seeded.ai.push(id); return rows(`insert into "AiUsageDaily"(id,day,"collegeKey",purpose,provider,model,feature,calls,failures,blocked,"totalMs","updatedAt") values ($1,$2,$3,$4::"AiPurpose",'GROQ',$5,'g4-inst',$6,$7,$8,$9,now())`, [id, D(day), colA, purpose, model, calls, fail, blocked, calls * 100]); };
  await ai(10, "TEXT", 5, 1, 0, "m-g4i-a"); await ai(11, "VISION", 7, 2, 1, "m-g4i-b"); await ai(12, "TEXT", 3, 0, 2, "m-g4i-c"); await ai(25, "TEXT", 100, 0, 0, "m-g4i-d");
  const sqlUse = async (f, to) => {
    const w = [`${f}T00:00:00Z`, `${to}T23:59:59.999Z`];
    const g = async (sql) => (await rows(sql, [colA, ...w]))[0];
    return { signIns: (await g(`select count(*)::int n from "LoginEvent" where "collegeId"=$1 and "createdAt">=$2 and "createdAt"<=$3`)).n, distinct: (await g(`select count(distinct "userId")::int n from "LoginEvent" where "collegeId"=$1 and "createdAt">=$2 and "createdAt"<=$3`)).n,
      uploads: (await g(`select count(*)::int n from "StudentDocument" where "collegeId"=$1 and "createdAt">=$2 and "createdAt"<=$3`)).n, upBytes: Number((await g(`select coalesce(sum("sizeBytes"),0)::bigint n from "StudentDocument" where "collegeId"=$1 and "createdAt">=$2 and "createdAt"<=$3`)).n),
      calls: Number((await g(`select coalesce(sum(calls),0)::bigint n from "AiUsageDaily" where "collegeKey"=$1::text and day>=$2::timestamptz::date and day<=$3::timestamptz::date`)).n), fails: Number((await g(`select coalesce(sum(failures),0)::bigint n from "AiUsageDaily" where "collegeKey"=$1::text and day>=$2::timestamptz::date and day<=$3::timestamptz::date`)).n), blocked: Number((await g(`select coalesce(sum(blocked),0)::bigint n from "AiUsageDaily" where "collegeKey"=$1::text and day>=$2::timestamptz::date and day<=$3::timestamptz::date`)).n) };
  };
  const uq = (f, to) => P("GET", `/api/platform/institutions/${colA}/usage?from=${f}&to=${to}`);
  const cmp = (r, x) => r.s === 200 && r.d.activity.signIns === x.signIns && r.d.activity.distinctSignedInUsers === x.distinct && r.d.activity.uploads === x.uploads && r.d.activity.uploadBytes === x.upBytes && r.d.activity.ai.calls === x.calls && r.d.activity.ai.failures === x.fails && r.d.activity.ai.blocked === x.blocked;
  const w1 = await uq(D(10), D(12)), x1 = await sqlUse(D(10), D(12));
  t(["SA-TC-046"], "for a chosen period the sign-ins, distinct people, uploads (count and bytes) and AI calls, failures and blocked calls equal an independent SQL count", cmp(w1, x1) && x1.signIns === 5 && x1.distinct === 2 && x1.uploads === 3 && x1.upBytes === 11000 && x1.calls === 15 && x1.fails === 3 && x1.blocked === 3, JSON.stringify([w1.d?.activity, x1]).slice(0, 300));
  const w2 = await uq(D(11), D(11)), x2 = await sqlUse(D(11), D(11));
  t(["SA-TC-046"], "one single day is handled at both ends: an event at 23:59:59.999 is inside, one at 00:00:00 on the next day is outside", cmp(w2, x2) && x2.signIns === 1 && x2.uploads === 1 && x2.calls === 7, JSON.stringify(w2.d?.activity).slice(0, 200));
  const w3 = await uq(D(12), D(12));
  t(["SA-TC-046"], "a day's range excludes the day before and after (12th: two sign-ins, no uploads)", w3.d.activity.signIns === 2 && w3.d.activity.uploads === 0 && w3.d.activity.ai.calls === 3 && w3.d.activity.ai.blocked === 2);
  const w4 = await uq("2026-05-13", "2026-05-14");
  t(["SA-TC-046"], "an empty period returns zeros, not an error", w4.s === 200 && w4.d.activity.signIns === 0 && w4.d.activity.uploads === 0 && w4.d.activity.ai.calls === 0 && w4.d.activity.ai.avgMs === null);
  const w5 = await uq(D(1), D(31)), x5 = await sqlUse(D(1), D(31));
  t(["SA-TC-046"], "a month-long period also equals SQL (includes the 100-call day)", cmp(w5, x5) && w5.d.activity.ai.calls >= 115, JSON.stringify(w5.d.activity.ai).slice(0, 200));
  const byP = w1.d.activity.ai.byPurpose;
  t(["SA-TC-046"], "AI calls by purpose add up to the total (TEXT 8, VISION 7)", byP.reduce((a, r) => a + r.calls, 0) === w1.d.activity.ai.calls && byP.find((r) => r.purpose === "TEXT")?.calls === 8 && byP.find((r) => r.purpose === "VISION")?.calls === 7);
  const todayS = new Date().toISOString().slice(0, 10); const idT = randomUUID(); seeded.ai.push(idT);
  await rows(`insert into "AiUsageDaily"(id,day,"collegeKey",purpose,provider,model,feature,calls,failures,blocked,"totalMs","updatedAt") values ($1,$2::date,$3,'TEXT','GROQ','m-g4i-t','g4-inst',9,1,0,900,now())`, [idT, todayS, colA]);
  const ref = await P("GET", `/api/platform/ai/usage?days=7`), refRow = ref.d.colleges.rows.find((r) => r.collegeKey === colA);
  const mine7 = await uq(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), todayS);
  const inWin = Number((await rows(`select coalesce(sum(calls),0)::bigint n from "AiUsageDaily" where "collegeKey"=$1 and day >= current_date - 6`, [colA]))[0].n);
  t(["SA-TC-046"], "REUSE: the institution's AI calls for the last 7 days equal this institution's row in the platform AI usage view (same table and counters) and SQL", ref.s === 200 && refRow?.calls === inWin && mine7.d.activity.ai.calls === inWin && inWin >= 9, `${refRow?.calls} / ${mine7.d.activity.ai.calls} / ${inWin}`);
  const snap = (await uq(D(1), D(31))).d.snapshot;
  const sq = async (sql) => Number((await rows(sql, [colA]))[0].n);
  t(["SA-TC-046"], "the current totals (users, active users, students, active students, stored documents and bytes) equal SQL, and archived replacements are not in the stored total", snap.users === await sq(`select count(*)::int n from "User" where "collegeId"=$1`) && snap.activeUsers === await sq(`select count(*)::int n from "User" where "collegeId"=$1 and "isActive"`) && snap.students === await sq(`select count(*)::int n from "Student" where "collegeId"=$1`) && snap.activeStudents === await sq(`select count(*)::int n from "Student" where "collegeId"=$1 and "isActive" and not "isArchived"`) && snap.documents === await sq(`select count(*)::int n from "StudentDocument" where "collegeId"=$1 and "archivedAt" is null`) && snap.storageBytes === await sq(`select coalesce(sum("sizeBytes"),0)::bigint n from "StudentDocument" where "collegeId"=$1 and "archivedAt" is null`), JSON.stringify(snap));
  const dflt = await P("GET", `/api/platform/institutions/${colA}/usage`);
  const today = new Date().toISOString().slice(0, 10), from30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  t(["SA-TC-046"], "with no dates the period is the last 30 UTC days including today, and says so", dflt.d.period.defaulted === true && dflt.d.period.to === today && dflt.d.period.from === from30, JSON.stringify(dflt.d.period));
  const bu = await P("GET", `/api/platform/institutions/${B.id}/usage?from=${D(1)}&to=${D(31)}`);
  t(["SA-TC-046"], "ISOLATION: another institution's usage contains none of A's sign-ins, uploads or AI calls", bu.s === 200 && bu.d.activity.signIns === 0 && bu.d.activity.uploads === 0 && bu.d.activity.ai.calls === 0 && bu.d.snapshot.students === 0 && bu.d.snapshot.documents === 0);
  const badQ = ["from=2026-05-12&to=2026-05-10", "from=banana", "to=2026/05/10", "from=2026-13-45", "from=2024-01-01&to=2026-05-01", "from=2026-05-10&to="];
  const bq = []; for (const q of badQ) { const r = await P("GET", `/api/platform/institutions/${colA}/usage?${q}`); if (r.s !== 400) bq.push(`${q}:${r.s}`); }
  t(["SA-TC-046"], "invalid periods are refused with 400 (reversed, non-date, wrong format, impossible date, longer than 366 days, empty value)", bq.length === 0, bq.join(" "));
  const uj = JSON.stringify(w5.j);
  t(["SA-TC-046"], "usage is counts only: no student name, e-mail or enrolment number, no user ids, no storage paths, and nothing about price or plan", stuRows.every((r) => !uj.includes(r.name) && !uj.includes(r.email) && !uj.includes(r.enrollmentNo)) && !uj.includes(u1) && !uj.includes("g4inst/") && !/price|plan|invoice|billing|subscription|payment/i.test(uj));

  // sweep
  t(["SA-TC-044", "SA-TC-046"], "pages are served: /platform/institutions/:id", (await fetch(BASE + `/platform/institutions/${B.id}`)).status === 200);
} catch (e) {
  console.error(e); R.t(["SA-TC-043"], "suite ran to completion", false, String(e?.stack ?? e));
} finally {
  await pgc.query(`delete from "LoginEvent" where "sessionId" like 'g4inst-%'`).catch(() => 0);
  await pgc.query(`delete from "StudentDocument" where "storagePath" like 'g4inst/%'`).catch(() => 0);
  await pgc.query(`delete from "AiUsageDaily" where feature='g4-inst'`).catch(() => 0);
  await pgc.query(`delete from "Company" where name='G4 Keep Co'`).catch(() => 0);
  for (const c of created.colleges) { await pgc.query(`delete from "AuditLog" where "collegeId"=$1`, [c]).catch(() => 0); await pgc.query(`update "College" set "isActive"=false where id=$1`, [c]).catch(() => 0); }
  await pgc.end().catch(() => 0); stopApp();
}
process.exit(R.done() ? 1 : 0);

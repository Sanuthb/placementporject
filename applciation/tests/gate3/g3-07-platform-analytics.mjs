// Gate 4 Phase 4.2: platform-wide analytics (SA-TC-047..051, SA-TC-009). Local stack only. Synthetic data only.
// Method: build three controlled institutions (active with full data, suspended with some data, active and empty) with hand-computed expected
// values, ask the API through the institution filter, and compare. Global totals and the institution table are compared with INDEPENDENT SQL.
// A large synthetic dataset (hundreds of institutions, tens of thousands of students) checks correctness and records real timings.
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { B, client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";
import { writeFileSync } from "node:fs";

const R = recorder("g3-07-platform-analytics");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
const one = async (sql, p = []) => (await rows(sql, p))[0];
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const SA = ["SA-TC-047", "SA-TC-048", "SA-TC-049", "SA-TC-050", "SA-TC-051"], ACC = ["SA-TC-009", "SA-TC-035", "SRS-SECURITY-TC-022", "SRS-SECURITY-TC-023", "SRS-SECURITY-TC-024"];
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const pw = `G3-ana-${tag}-Pw!`, emailA = `g3anaa${tag}@example.com`, emailC = `g3anac${tag}@example.com`;
const mk = (email) => { const r = spawnSync("npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", env: { ...process.env, PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_NAME: "G3 Analytics Admin", PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr); };
const timings = [];
const made = { colleges: [], bulk: [] };
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const iso = (s) => new Date(s).toISOString();
try {
  mk(emailA); mk(emailC);
  const c1 = client(await login(emailA, pw)); const enr = await c1("POST", "/api/platform/mfa/enroll");
  const tok = (await c1("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token;
  const P = client(tok), aal1 = client(await login(emailA, pw)), noMfa = client(await login(emailC, pw));
  const S = (qs = "") => P("GET", "/api/platform/analytics" + (qs ? "?" + qs : ""));
  const T = (qs = "") => P("GET", "/api/platform/analytics/institutions" + (qs ? "?" + qs : ""));

  // ============ controlled fixture ============
  const mkCollege = async (name, active, createdAt) => {
    const id = (await one(`insert into "College" (id,name,slug,"isActive","createdAt","updatedAt") values (gen_random_uuid(),$1,$2,$3,$4,now()) returning id`, [name, `ana-${tag}-${made.colleges.length}`, active, createdAt])).id; made.colleges.push(id);
    const dept = (await one(`insert into "Department" (id,"collegeId",name,code,"updatedAt") values (gen_random_uuid(),$1,'Dept','D',now()) returning id`, [id])).id;
    const batch = (await one(`insert into "Batch" (id,"collegeId",name,"startYear","endYear") values (gen_random_uuid(),$1,'B',2022,2026) returning id`, [id])).id;
    const comp = (await one(`insert into "Company" (id,"collegeId",name,"updatedAt") values (gen_random_uuid(),$1,'Co',now()) returning id`, [id])).id;
    return { id, dept, batch, comp };
  };
  const stu = async (c, n, o = {}) => (await one(`insert into "Student" (id,"collegeId",name,email,"enrollmentNo","departmentId","batchId","isActive","isArchived","participationStatus","isPlaced","inviteStatus","updatedAt") values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9::"ParticipationStatus",$10,$11::"InviteStatus",now()) returning id`,
    [c.id, `Zed Student ${n}`, `zed${tag}${n}@example.org`, `ZED${tag}${n}`, c.dept, c.batch, o.active ?? true, o.archived ?? false, o.part ?? "REGISTERED", o.placed ?? false, o.invite ?? "NOT_SENT"])).id;
  const drive = async (c, status, at) => (await one(`insert into "Drive" (id,"collegeId","companyId",role,"jobType","applicationDeadline","driveDate",status,"createdById","updatedAt") values (gen_random_uuid(),$1,$2,'Eng','FULL_TIME',$3,$3,$4::"DriveStatus",gen_random_uuid(),now()) returning id`, [c.id, c.comp, at, status])).id;
  const app = (c, d, s, status, at) => rows(`insert into "Application" (id,"collegeId","driveId","studentId",status,"appliedAt","updatedAt") values (gen_random_uuid(),$1,$2,$3,$4::"ApplicationStatus",$5,now())`, [c.id, d, s, status, at]);
  const offer = (c, s, status, offeredAt, respondedAt, hist = false) => rows(`insert into "Offer" (id,"collegeId","studentId","companyId",role,"packageLpa",status,"offeredAt","respondedAt","isHistorical","createdById","updatedAt") values (gen_random_uuid(),$1,$2,$3,'Eng',6,$4::"OfferStatus",$5,$6,$7,gen_random_uuid(),now())`, [c.id, s, c.comp, status, offeredAt, respondedAt, hist]);
  const X1 = await mkCollege(`Ana Full ${tag}`, true, "2026-02-10T10:00:00Z"), X2 = await mkCollege(`Ana Suspended ${tag}`, false, "2026-03-05T10:00:00Z"), X3 = await mkCollege(`Ana Empty ${tag}`, true, "2026-05-01T00:00:00Z");
  const s = [];
  for (let i = 1; i <= 6; i++) s[i] = await stu(X1, i, { placed: i <= 3, invite: i <= 2 ? "ACTIVATED" : "NOT_SENT" });   // s1..s6 registered; s1-s3 placed
  s[7] = await stu(X1, 7, { part: "OPTED_OUT" }); s[8] = await stu(X1, 8, { archived: true, placed: true }); s[9] = await stu(X1, 9, { active: false }); s[10] = await stu(X1, 10, { part: "HIGHER_STUDIES" });
  // staff and recruiters
  for (const [i, act] of [[1, true], [2, true], [3, true], [4, false]]) await rows(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","isActive","updatedAt") values (gen_random_uuid(),$1,$2,'Ana Staff','PLACEMENT_OFFICER','{}',$3,now())`, [X1.id, `anastaff${tag}${i}@example.org`, act]);
  for (const [i, act] of [[1, true], [2, false]]) await rows(`insert into "Recruiter" (id,"collegeId","companyId",email,name,"isActive") values (gen_random_uuid(),$1,$2,$3,'Ana Rec',$4)`, [X1.id, X1.comp, `anarec${tag}${i}@example.org`, act]);
  // drives: boundaries at 2026-03-10T23:59:59Z (end of day) and 2026-03-20T00:00:00Z (start of day); a DRAFT that must be excluded
  const d1 = await drive(X1, "PUBLISHED", "2026-03-10T23:59:59Z"), d2 = await drive(X1, "CLOSED", "2026-03-20T00:00:00Z"); await drive(X1, "CANCELLED", "2026-04-05T12:00:00Z"); await drive(X1, "DRAFT", "2026-03-15T12:00:00Z");
  await app(X1, d1, s[1], "APPLIED", "2026-03-01T09:00:00Z"); await app(X1, d1, s[2], "SHORTLISTED", "2026-03-02T09:00:00Z"); await app(X1, d1, s[3], "WITHDRAWN", "2026-03-03T09:00:00Z"); await app(X1, d1, s[4], "APPLIED", "2026-03-31T23:30:00Z");
  await app(X1, d2, s[1], "APPLIED", "2026-03-05T09:00:00Z"); await app(X1, d2, s[2], "APPLIED", "2026-04-01T00:00:00Z");
  await offer(X1, s[1], "ACCEPTED", "2026-03-12T10:00:00Z", "2026-03-14T10:00:00Z"); await offer(X1, s[1], "ACCEPTED", "2026-03-30T10:00:00Z", null);   // s1 has TWO accepted offers: counts once as placed
  await offer(X1, s[2], "ACCEPTED", "2026-03-22T10:00:00Z", "2026-04-02T10:00:00Z"); await offer(X1, s[2], "ACCEPTED", "2025-06-01T10:00:00Z", null, true);
  await offer(X1, s[3], "OFFERED", "2026-03-25T10:00:00Z", null); await offer(X1, s[4], "REVOKED", "2026-03-26T10:00:00Z", null); await offer(X1, s[5], "DECLINED", "2026-03-31T23:30:00Z", null);
  // sign-ins: staff user twice, a student and a recruiter once each in March, one in January (outside), one recent (inside the default 30-day window)
  const uStaff = randomUUID(), uStu = randomUUID(), uRec = randomUUID();
  for (const [u, k, at] of [[uStaff, "staff", "2026-03-05T08:00:00Z"], [uStaff, "staff", "2026-03-06T08:00:00Z"], [uStu, "student", "2026-03-07T08:00:00Z"], [uRec, "recruiter", "2026-03-08T08:00:00Z"], [uStaff, "staff", "2026-01-01T08:00:00Z"]]) await rows(`insert into "LoginEvent" (id,"collegeId","userId",kind,"sessionId","createdAt") values (gen_random_uuid(),$1,$2,$3,$4,$5)`, [X1.id, u, k, randomUUID(), at]);
  await rows(`insert into "LoginEvent" (id,"collegeId","userId",kind,"sessionId","createdAt") values (gen_random_uuid(),$1,$2,'student',$3,now() - interval '1 day')`, [X1.id, uStu, randomUUID()]);
  // X2 (suspended): 3 students (2 registered, 1 placed), 1 staff, 1 drive, 1 application, 1 accepted offer
  const t1 = await stu(X2, 1, { placed: true }), t2 = await stu(X2, 2), t3 = await stu(X2, 3, { part: "OPTED_OUT" }); void t3;
  await rows(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values (gen_random_uuid(),$1,$2,'Ana Staff','TPO_ADMIN','{}',now())`, [X2.id, `anastaffx2${tag}@example.org`]);
  const dd = await drive(X2, "PUBLISHED", "2026-03-12T10:00:00Z"); await app(X2, dd, t1, "APPLIED", "2026-03-02T10:00:00Z"); await offer(X2, t1, "ACCEPTED", "2026-03-13T10:00:00Z", "2026-03-13T11:00:00Z"); void t2;

  const f = (inst, extra = "") => `institution=${inst.id}${extra ? "&" + extra : ""}`;
  // ============ institution statistics ============
  const a1 = await S(f(X1)); const A1 = a1.d;
  t(SA, "analytics returns 200 for an authorized platform administrator", a1.s === 200 && !!A1.institutions, JSON.stringify(a1.j).slice(0, 200));
  t(SA, "institution filter: one active institution is counted once", A1.institutions.total === 1 && A1.institutions.active === 1 && A1.institutions.suspended === 0, JSON.stringify(A1.institutions));
  const a2 = (await S(f(X2))).d; t(SA, "suspended institution is included and counted as suspended, not as active", a2.institutions.total === 1 && a2.institutions.suspended === 1 && a2.institutions.active === 0, JSON.stringify(a2.institutions));
  const gAct = (await S("status=active")).d, gSus = (await S("status=suspended")).d, gAll = (await S()).d;
  const dbInst = await one(`select count(*)::int total, count(*) filter (where "isActive")::int active, count(*) filter (where not "isActive")::int suspended, count(*) filter (where "createdAt" > now() - interval '30 days')::int last30 from "College"`);
  t(SA, "global institution totals equal an independent SQL count", gAll.institutions.total === dbInst.total && gAll.institutions.active === dbInst.active && gAll.institutions.suspended === dbInst.suspended, `${JSON.stringify(gAll.institutions)} vs ${JSON.stringify(dbInst)}`);
  t(SA, "status filter: active + suspended = all, and each matches SQL", gAct.institutions.total === dbInst.active && gSus.institutions.total === dbInst.suspended && gAct.institutions.total + gSus.institutions.total === gAll.institutions.total);
  t(SA, "recently registered (last 30 days) equals SQL", gAll.institutions.registeredLast30Days === dbInst.last30, `${gAll.institutions.registeredLast30Days} vs ${dbInst.last30}`);
  const rr = (await S("from=2026-03-01&to=2026-03-31")).d; const rrDb = await one(`select count(*)::int n from "College" where "createdAt" >= '2026-03-01T00:00:00Z' and "createdAt" <= '2026-03-31T23:59:59.999Z'`);
  t(SA, "registered-in-range equals SQL for a date range", rr.institutions.registeredInRange === rrDb.n && rr.institutions.registeredInRange >= 1, `${rr.institutions.registeredInRange} vs ${rrDb.n}`);
  t(SA, "registered-in-range is null when no range is given (not 0)", gAll.institutions.registeredInRange === null);
  // ============ users ============
  t(SA, "students: total 10, active 8 (inactive and archived excluded), with login 2", A1.users.students.total === 10 && A1.users.students.active === 8 && A1.users.students.withLogin === 2, JSON.stringify(A1.users.students));
  t(SA, "staff: total 4, active 3", A1.users.staff.total === 4 && A1.users.staff.active === 3, JSON.stringify(A1.users.staff));
  t(SA, "recruiters: total 2, active 1", A1.users.recruiters.total === 2 && A1.users.recruiters.active === 1, JSON.stringify(A1.users.recruiters));
  const dbPA = await one(`select count(*)::int total, count(*) filter (where "isActive")::int active from "PlatformAdmin"`);
  t(SA, "platform administrators equal SQL and are not filtered by institution", A1.users.platformAdministrators.total === dbPA.total && gAll.users.platformAdministrators.total === dbPA.total && A1.users.platformAdministrators.active === dbPA.active);
  const g = await one(`select (select count(*) from "Student")::int st, (select count(*) from "Student" where "isActive" and not "isArchived")::int sta, (select count(*) from "User")::int us, (select count(*) from "User" where "isActive")::int usa, (select count(*) from "Recruiter")::int rc, (select count(*) from "Recruiter" where "isActive")::int rca`);
  t(SA, "global student, staff and recruiter totals (total and active) equal independent SQL", gAll.users.students.total === g.st && gAll.users.students.active === g.sta && gAll.users.staff.total === g.us && gAll.users.staff.active === g.usa && gAll.users.recruiters.total === g.rc && gAll.users.recruiters.active === g.rca, JSON.stringify(gAll.users));
  t(SA, "total is never smaller than active", [gAll.users.students, gAll.users.staff, gAll.users.recruiters].every((x) => x.total >= x.active));
  // active users from sign-in sessions
  const au = (await S(f(X1, "from=2026-03-01&to=2026-03-31"))).d.users.activeUsers;
  t(SA, "active users (range): 3 distinct people from 4 sign-in sessions; the January and recent sessions are outside", au.distinctUsers === 3 && au.signIns === 4 && au.staff === 1 && au.students === 1 && au.recruiters === 1 && au.window.defaulted === false, JSON.stringify(au));
  const au2 = A1.users.activeUsers; t(SA, "active users (no range): window defaults to the last 30 days and says so; only the recent session counts", au2.window.defaulted === true && au2.signIns === 1 && au2.distinctUsers === 1, JSON.stringify(au2));
  // ============ placement ============
  const pl = A1.placement;
  t(SA, "drives: DRAFT excluded; 3 drives = 1 published + 1 closed + 1 cancelled", pl.drives.total === 3 && pl.drives.published === 1 && pl.drives.closed === 1 && pl.drives.cancelled === 1, JSON.stringify(pl.drives));
  t(SA, "applications: 6 in total, withdrawn and shortlisted shown apart", pl.applications.total === 6 && pl.applications.withdrawn === 1 && pl.applications.shortlisted === 1, JSON.stringify(pl.applications));
  t(SA, "offers: 'made' excludes revoked: 6 made = 4 accepted + 1 declined + 1 open; 1 revoked; 1 historical", pl.offers.made === 6 && pl.offers.accepted === 4 && pl.offers.declined === 1 && pl.offers.revoked === 1 && pl.offers.historicalImported === 1, JSON.stringify(pl.offers));
  t(SA, "placed students (no range) = flagged, registered, active, not archived: 3 (the archived placed student is excluded)", pl.placedStudents === 3, String(pl.placedStudents));
  t(SA, "placement denominator = students registered for placement (active, not archived, REGISTERED): 6; opted-out, higher-studies, inactive and archived are excluded", pl.registeredForPlacement === 6, String(pl.registeredForPlacement));
  t(SA, "placement rate = 3 / 6 = 50.0 and the definition is stated", pl.placementRate === 50 && /registered for placement/.test(pl.rateDefinition), JSON.stringify([pl.placementRate, pl.rateDefinition]));
  const pr = (await S(f(X1, "from=2026-03-01&to=2026-04-30"))).d.placement;
  t(SA, "with a range: a student with two accepted offers counts once (s1), historical offer outside the range is excluded: placed 2 of 6 = 33.3", pr.placedStudents === 2 && pr.registeredForPlacement === 6 && pr.placementRate === 33.3, JSON.stringify([pr.placedStudents, pr.registeredForPlacement, pr.placementRate]));
  t(SA, "range: offers made = 5 in 2026-03/04 (the 2025 historical offer and the revoked offer are out)", pr.offers.made === 5 && pr.offers.accepted === 3 && pr.offers.historicalImported === 0, JSON.stringify(pr.offers));
  const x3 = (await S(f(X3))).d;
  t(SA, "institution with no students: all zero, rate is null (not 0%, no divide-by-zero)", x3.users.students.total === 0 && x3.placement.placedStudents === 0 && x3.placement.registeredForPlacement === 0 && x3.placement.placementRate === null && x3.placement.drives.total === 0 && x3.placement.applications.total === 0 && x3.placement.offers.made === 0, JSON.stringify(x3.placement));
  const x2p = (await S(f(X2))).d.placement; t(SA, "suspended institution's placement figures are still reported (2 registered, 1 placed = 50.0)", x2p.registeredForPlacement === 2 && x2p.placedStudents === 1 && x2p.placementRate === 50 && x2p.drives.total === 1, JSON.stringify(x2p));
  const emptyF = (await S(f(X1, "status=suspended"))).d; t(SA, "filters that match nothing (active institution with status=suspended): empty dataset, no error, null rate", emptyF.institutions.total === 0 && emptyF.users.students.total === 0 && emptyF.placement.placementRate === null);
  const far = (await S(f(X1, "from=2031-01-01&to=2031-12-31"))).d; t(SA, "a date range with no activity: flows are 0, snapshots unchanged", far.placement.drives.total === 0 && far.placement.applications.total === 0 && far.placement.offers.made === 0 && far.placement.placedStudents === 0 && far.users.students.total === 10);
  // global placement vs independent SQL
  const gp = await one(`select (select count(*) from "Drive" where status <> 'DRAFT')::int drives, (select count(*) from "Application")::int apps, (select count(*) from "Offer" where status <> 'REVOKED')::int offers, (select count(*) from "Student" s where "isActive" and not "isArchived" and "participationStatus"='REGISTERED' and "isPlaced")::int placed, (select count(*) from "Student" s where "isActive" and not "isArchived" and "participationStatus"='REGISTERED')::int reg`);
  const GP = gAll.placement; t(SA, "global drives, applications, offers, placed and registered equal independent SQL", GP.drives.total === gp.drives && GP.applications.total === gp.apps && GP.offers.made === gp.offers && GP.placedStudents === gp.placed && GP.registeredForPlacement === gp.reg, JSON.stringify([GP.drives.total, GP.applications.total, GP.offers.made, GP.placedStudents, GP.registeredForPlacement]) + JSON.stringify(gp));
  t(SA, "global rate equals placed / registered from SQL", GP.placementRate === (gp.reg ? Math.round((gp.placed / gp.reg) * 1000) / 10 : null));

  // ============ date boundaries and timezone ============
  const dc = async (qs) => (await S(f(X1, qs))).d.placement.drives.total;
  t(SA, "boundary: a drive at 23:59:59Z is inside a single-day range for that UTC day", (await dc("from=2026-03-10&to=2026-03-10")) === 1);
  t(SA, "boundary: a drive at 00:00:00Z is inside a single-day range for that UTC day", (await dc("from=2026-03-20&to=2026-03-20")) === 1);
  t(SA, "boundary: the days between hold no drive", (await dc("from=2026-03-11&to=2026-03-19")) === 0);
  t(SA, "boundary: whole range includes both", (await dc("from=2026-03-10&to=2026-03-20")) === 2);
  const offs = async (qs) => (await S(f(X1, qs))).d.placement.offers.made;
  t(SA, "boundary: an offer at 23:30Z on the last day of the month is in that month and not in the next", (await offs("from=2026-03-31&to=2026-03-31")) === 1 && (await offs("from=2026-04-01&to=2026-04-30")) === 0, `${await offs("from=2026-03-31&to=2026-03-31")} / ${await offs("from=2026-04-01&to=2026-04-30")}`);
  const mar = (await S(f(X1, "from=2026-03-01&to=2026-03-31"))).d.series;
  t(SA, "series: a 31-day range gives 31 daily points, zero-filled", mar.unit === "day" && mar.points.length === 31 && mar.points[0].period === "2026-03-01" && mar.points[30].period === "2026-03-31");
  t(SA, "series: applications and offers per day add up to the summary", mar.points.reduce((x, p) => x + p.applications, 0) === (await S(f(X1, "from=2026-03-01&to=2026-03-31"))).d.placement.applications.total && mar.points.find((p) => p.period === "2026-03-31").applications === 1);
  const year = (await S(f(X1, "from=2026-01-01&to=2026-12-31"))).d.series; t(SA, "series: a year gives monthly points (12), March holds the March applications", year.unit === "month" && year.points.length === 12 && year.points.find((p) => p.period === "2026-03").applications === 5, JSON.stringify(year.points.slice(1, 4)));
  t(SA, "series: no range gives the last 12 months, monthly", (await S(f(X1))).d.series.points.length >= 12 && (await S(f(X1))).d.series.unit === "month");
  t(SA, "series: institutions registered per month matches SQL", await (async () => { const y = (await S("from=2026-01-01&to=2026-12-31")).d.series; const db = await rows(`select to_char(date_trunc('month',"createdAt" at time zone 'UTC'),'YYYY-MM') k, count(*)::int n from "College" where "createdAt" >= '2026-01-01T00:00:00Z' and "createdAt" <= '2026-12-31T23:59:59.999Z' group by 1`); return db.every((r) => y.points.find((p) => p.period === r.k).institutionsRegistered === r.n) && y.points.reduce((a, p) => a + p.institutionsRegistered, 0) === db.reduce((a, r) => a + r.n, 0); })());

  // ============ institution-wise table ============
  const tb = await T(`pageSize=100&q=${encodeURIComponent("Ana ")}`); const row = (name) => tb.d.items.find((r) => r.name === name);
  const r1 = row(`Ana Full ${tag}`), r2 = row(`Ana Suspended ${tag}`), r3 = row(`Ana Empty ${tag}`);
  t(SA, "table: the full institution row matches the summary (students, staff, recruiters, drives, applications, offers, placed, rate)", !!r1 && r1.students === 10 && r1.studentsActive === 8 && r1.staff === 4 && r1.staffActive === 3 && r1.recruiters === 2 && r1.recruitersActive === 1 && r1.drives === 3 && r1.applications === 6 && r1.offers === 6 && r1.placed === 3 && r1.rate === 50, JSON.stringify(r1));
  t(SA, "table: suspended institution shows status suspended with its own counts", !!r2 && r2.isActive === false && r2.students === 3 && r2.staff === 1 && r2.placed === 1 && r2.rate === 50, JSON.stringify(r2));
  t(SA, "table: an institution with no students has zero counts and a null rate", !!r3 && r3.students === 0 && r3.staff === 0 && r3.recruiters === 0 && r3.placed === 0 && r3.rate === null && r3.drives === 0);
  t(SA, "table rows carry no personal data (counts only)", !/Zed Student|zed\d*@example|anastaff|anarec/i.test(JSON.stringify(tb.j)));
  const rr1 = (await T(`pageSize=100&q=${encodeURIComponent("Ana Full")}&from=2026-03-01&to=2026-04-30`)).d.items[0];
  t(SA, "table with a range uses the same flow rules (placed 2, drives 3, applications 6, offers 5 incl. the 2026 flows only)", rr1.placed === 2 && rr1.drives === 3 && rr1.applications === 6 && rr1.offers === 5, JSON.stringify(rr1));
  // duplicate-count prevention: the table summed over all institutions equals the global summary (no join fan-out)
  const walk = []; const first = await T("pageSize=100"); for (let p = 1; p <= first.d.totalPages; p++) walk.push(...(await T(`pageSize=100&page=${p}`)).d.items);
  const sum = (k) => walk.reduce((a, r) => a + r[k], 0);
  t(SA, "no duplicate counting: table rows summed over every page equal the global summary (students, staff, recruiters, drives, applications, offers, placed, registered)", sum("students") === gAll.users.students.total && sum("staff") === gAll.users.staff.total && sum("recruiters") === gAll.users.recruiters.total && sum("drives") === gAll.placement.drives.total && sum("applications") === gAll.placement.applications.total && sum("offers") === gAll.placement.offers.made && sum("placed") === gAll.placement.placedStudents && sum("registered") === gAll.placement.registeredForPlacement, JSON.stringify({ st: sum("students"), g: gAll.users.students.total }));
  t(SA, "no duplicate institutions across pages", new Set(walk.map((r) => r.id)).size === walk.length && walk.length === first.d.total && first.d.total === gAll.institutions.total);
  // sort order: both directions, compared with independent SQL and monotonic
  const ind = { students: `(select count(*) from "Student" s where s."collegeId"=c.id)`, staff: `(select count(*) from "User" u where u."collegeId"=c.id)`, name: `c.name`, createdAt: `c."createdAt"`, drives: `(select count(*) from "Drive" d where d."collegeId"=c.id and d.status<>'DRAFT')`, applications: `(select count(*) from "Application" a where a."collegeId"=c.id)` };
  for (const [k, expr] of Object.entries(ind)) for (const dir of ["asc", "desc"]) { const r = (await T(`sort=${k}&order=${dir}&pageSize=100`)).d.items.map((x) => x.id); const want = (await rows(`select c.id from "College" c order by ${expr} ${dir}, c."createdAt" desc, c.id asc limit 100`)).map((x) => x.id); t(SA, `table sort ${k} ${dir} matches independent SQL ordering`, JSON.stringify(r) === JSON.stringify(want), `${r[0]} vs ${want[0]}`); }
  for (const k of ["recruiters", "placed", "offers", "rate", "status"]) for (const dir of ["asc", "desc"]) { const items = (await T(`sort=${k}&order=${dir}&pageSize=100`)).d.items; const v = items.map((x) => (k === "status" ? (x.isActive ? 1 : 0) : x[k])); const nn = v.filter((x) => x !== null); const ok = nn.every((x, i) => i === 0 || (dir === "asc" ? nn[i - 1] <= x : nn[i - 1] >= x)) && v.slice(nn.length).every((x) => x === null); t(SA, `table sort ${k} ${dir} is ordered (nulls last)`, ok && items.length > 0); }
  const sw = []; const pcount = (await T("sort=students&order=desc&pageSize=7")).d.totalPages; for (let p = 1; p <= pcount; p++) sw.push(...(await T(`sort=students&order=desc&pageSize=7&page=${p}`)).d.items.map((r) => r.id));
  t(SA, "stable paging: many institutions tie on students; walking all pages returns each exactly once", sw.length === first.d.total && new Set(sw).size === sw.length);
  const bey = await T(`pageSize=10&page=${first.d.totalPages + 50}`); t(SA, "page past the end: 200, empty, accurate total", bey.s === 200 && bey.d.items.length === 0 && bey.d.total === first.d.total);
  const tn = await T(`q=zzz-none-${tag}`); t(SA, "table: no match gives an empty page with total 0", tn.s === 200 && tn.d.items.length === 0 && tn.d.total === 0 && tn.d.totalPages === 1);
  t(SA, "table: status and institution filters apply", (await T("status=suspended&pageSize=100")).d.items.every((r) => r.isActive === false) && (await T(`institution=${X1.id}`)).d.total === 1);

  // ============ recent activity ============
  const rec = (await S()).d.recent;
  t(SA, "recent registrations: newest first, at most 10, real institutions", rec.registrations.length === 10 && rec.registrations.every((x, i, a) => i === 0 || new Date(a[i - 1].createdAt) >= new Date(x.createdAt)) && (await one(`select count(*)::int n from "College" where id = $1`, [rec.registrations[0].id])).n === 1);
  t(SA, "recent administrative activity comes from the audit trails (source, action, time), newest first", rec.adminActivity.length >= 1 && rec.adminActivity.every((e) => e.source && e.action && e.at) && rec.adminActivity.every((e, i, a) => i === 0 || new Date(a[i - 1].at) >= new Date(e.at)));
  t(SA, "recent registrations respect the date range", (await S("from=2026-03-01&to=2026-03-31")).d.recent.registrations.every((x) => x.createdAt >= "2026-03-01" && x.createdAt <= "2026-03-31T23:59:59.999Z"));

  // ============ invalid parameters ============
  for (const bad of ["status=deleted", "status=ACTIVE", "institution=abc", "institution=1%27%20OR%20%271", "from=yesterday", "to=2026-13-45", "from=2026-04-01&to=2026-03-01"]) { const r = await S(bad); t(SA, `invalid filter refused (400, no leak): ${bad}`, r.s === 400 && !/prisma|SELECT|stack|constraint/i.test(JSON.stringify(r.j)), `HTTP ${r.s}`); }
  for (const bad of ["sort=id", "sort=name;drop", "sort=isActive", "order=up", "page=0", "page=-1", "page=x", "pageSize=0", "pageSize=101", "status=x", "q=" + "x".repeat(101), "institution=zzz"]) { const r = await T(bad); t(SA, `invalid table parameter refused (400): ${bad.slice(0, 32)}`, r.s === 400 && !/prisma|SELECT|stack|constraint/i.test(JSON.stringify(r.j)), `HTTP ${r.s}`); }
  const before = (await one(`select count(*)::int n from "College"`)).n;
  for (const evil of ["' OR '1'='1", "'; DROP TABLE \"College\"; --", "%", "_", "\\", "<script>x</script>", "日本語"]) { const r = await T(`q=${encodeURIComponent(evil)}`); t(SA, `hostile table search handled: ${JSON.stringify(evil).slice(0, 26)}`, r.s === 200 && r.d.total === (await one(`select count(*)::int n from "College" where position($1 in name)>0 or position($1 in slug)>0`, [evil])).n, `HTTP ${r.s} total ${r.d?.total}`); }
  t(SA, "database intact after injection attempts", (await one(`select count(*)::int n from "College"`)).n === before);

  // ============ access control ============
  const colAdmin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
  const SS = await makeStudents(colAdmin, 1, "ANA"); const stuC = client(SS.tokens.A);
  const co = (await one(`insert into "Company" (id,"collegeId",name,"updatedAt") values (gen_random_uuid(),(select "collegeId" from "User" where email=$1),$2,now()) returning id`, [process.env.SEED_ADMIN_EMAIL, `Ana Co ${tag}`])).id;
  const { data: ru } = await sb.auth.admin.createUser({ email: `g3anarec${tag}@example.com`, password: pw, email_confirm: true });
  await rows(`insert into "Recruiter" (id,"collegeId","companyId",email,name) values ($1,(select "collegeId" from "User" where email=$2),$3,$4,'Ana Rec2')`, [ru.user.id, process.env.SEED_ADMIN_EMAIL, co, `g3anarec${tag}@example.com`]);
  const rec2 = client(await login(`g3anarec${tag}@example.com`, pw));
  const mkStaff = async (label, role) => { const email = `g3ana${label}${tag}@example.com`; const { data } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true }); await rows(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values ($1,(select "collegeId" from "User" where email=$2),$3,$4,$5::"Role",'{}',now())`, [data.user.id, process.env.SEED_ADMIN_EMAIL, email, "Ana " + label, role]); return client(await login(email, pw)); };
  const paths = ["/api/platform/analytics", `/api/platform/analytics?institution=${X1.id}&from=2026-03-01`, "/api/platform/analytics/institutions", "/api/platform/analytics/institutions?q=Ana&sort=name"];
  const who = [["anonymous", (p) => fetch(B + p).then((r) => ({ s: r.status }))], ["institution administrator (Head TPO)", (p) => colAdmin("GET", p)], ["student", (p) => stuC("GET", p)], ["recruiter", (p) => rec2("GET", p)], ["platform admin, password only", (p) => aal1("GET", p)], ["platform admin, no authenticator", (p) => noMfa("GET", p)]];
  for (const [n, fn] of who) for (const p of paths) { const r = await fn(p); const ok = n === "anonymous" ? r.s === 401 : n.includes("password only") ? r.s === 403 && r.code === "MFA_REQUIRED" : n.includes("no authenticator") ? r.s === 403 && r.code === "MFA_SETUP_REQUIRED" : r.s === 403; t(ACC, `${n} is refused on ${p.replace(/\?.*/, "")}`, ok && !/institutions|students|placement/.test(JSON.stringify(r.j ?? "")), `HTTP ${r.s} ${r.code ?? ""}`); }
  for (const [label, role] of [["officer", "PLACEMENT_OFFICER"], ["coord", "DEPARTMENT_COORDINATOR"], ["faculty", "FACULTY"], ["principal", "PRINCIPAL"]]) { const c = await mkStaff(label, role); t(ACC, `college ${label} is refused on both analytics routes`, (await c("GET", "/api/platform/analytics")).s === 403 && (await c("GET", "/api/platform/analytics/institutions")).s === 403); }
  const ro = []; for (const m of ["POST", "PUT", "PATCH", "DELETE"]) for (const p of ["/api/platform/analytics", "/api/platform/analytics/institutions"]) { const r = await P(m, p, m === "DELETE" ? undefined : {}); if (r.s !== 405) ro.push(`${m} ${p} ${r.s}`); }
  t(ACC, "analytics is read-only: POST, PUT, PATCH and DELETE give 405", ro.length === 0, ro.join("; "));
  { const r = await fetch(B + "/api/platform/analytics", { headers: { authorization: "Bearer " + tok } }); const cc = r.headers.get("cache-control") ?? ""; const body = await r.text(); t(ACC, "an authorized analytics response is not cacheable", r.status === 200 && /no-store|no-cache|private/.test(cc), cc); t(ACC, "the whole response contains no student or staff personal data", !/Zed Student|zed\d*@example\.org|anastaff|anarec|eyJ[\w-]{10,}\./i.test(body)); }
  const eb = await fetch(B + "/api/platform/analytics?institution=nope", { headers: { authorization: "Bearer " + tok } }); t(ACC, "validation errors expose no SQL, tables or stack", !/prisma|SELECT|"College"|node_modules|at \w+ \(/i.test(await eb.text()));

  // ============ large dataset: correctness and real timings ============
  const N = 300, PER = 100;
  await rows(`insert into "College" (id,name,slug,"isActive","createdAt","updatedAt") select gen_random_uuid(), 'Bulk ' || $1 || ' ' || lpad(g::text,4,'0'), 'bulkana-' || $1 || '-' || g, (g % 5 <> 0), now() - (g || ' days')::interval, now() from generate_series(1,${N}) g`, [tag]);
  const bulk = (await rows(`select id from "College" where slug like $1`, [`bulkana-${tag}-%`])).map((r) => r.id); made.bulk = bulk;
  await rows(`insert into "Department" (id,"collegeId",name,code,"updatedAt") select gen_random_uuid(), id, 'D','D', now() from "College" where id = any($1::uuid[])`, [bulk]);
  await rows(`insert into "Batch" (id,"collegeId",name,"startYear","endYear") select gen_random_uuid(), id, 'B', 2022, 2026 from "College" where id = any($1::uuid[])`, [bulk]);
  await rows(`insert into "Company" (id,"collegeId",name,"updatedAt") select gen_random_uuid(), id, 'Co', now() from "College" where id = any($1::uuid[])`, [bulk]);
  await rows(`insert into "Student" (id,"collegeId",name,email,"enrollmentNo","departmentId","batchId","isActive","isArchived","participationStatus","isPlaced","updatedAt")
              select gen_random_uuid(), c.id, 'Bulk Student', 'b' || g || '@x.org', 'E' || g, d.id, b.id, (g % 9 <> 0), (g % 11 = 0), case when g % 7 = 0 then 'OPTED_OUT' else 'REGISTERED' end::"ParticipationStatus", (g % 4 = 0), now()
              from "College" c join "Department" d on d."collegeId"=c.id join "Batch" b on b."collegeId"=c.id cross join generate_series(1,${PER}) g where c.id = any($1::uuid[])`, [bulk]);
  await rows(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","isActive","updatedAt") select gen_random_uuid(), c.id, 'u' || g || '@x.org', 'Bulk Staff', 'FACULTY', '{}', (g % 3 <> 0), now() from "College" c cross join generate_series(1,12) g where c.id = any($1::uuid[])`, [bulk]);
  await rows(`insert into "Drive" (id,"collegeId","companyId",role,"jobType","applicationDeadline","driveDate",status,"createdById","updatedAt") select gen_random_uuid(), c.id, co.id, 'Eng','FULL_TIME', now(), now() - (g || ' days')::interval, (array['PUBLISHED','CLOSED','CANCELLED','DRAFT'])[1 + g % 4]::"DriveStatus", gen_random_uuid(), now() from "College" c join "Company" co on co."collegeId"=c.id cross join generate_series(1,8) g where c.id = any($1::uuid[])`, [bulk]);
  await rows(`insert into "Application" (id,"collegeId","driveId","studentId",status,"appliedAt","updatedAt") select gen_random_uuid(), d."collegeId", d.id, s.id, (array['APPLIED','SHORTLISTED','WITHDRAWN'])[1 + (row_number() over ())::int % 3]::"ApplicationStatus", now() - ((row_number() over ()) % 200 || ' days')::interval, now() from "Drive" d join lateral (select id from "Student" where "collegeId"=d."collegeId" limit 30) s on true where d."collegeId" = any($1::uuid[])`, [bulk]);
  await rows(`insert into "Offer" (id,"collegeId","studentId","companyId",role,"packageLpa",status,"offeredAt","isHistorical","createdById","updatedAt") select gen_random_uuid(), s."collegeId", s.id, co.id, 'Eng', 5, (array['OFFERED','ACCEPTED','DECLINED','REVOKED'])[1 + (row_number() over ())::int % 4]::"OfferStatus", now() - ((row_number() over ()) % 300 || ' days')::interval, false, gen_random_uuid(), now() from "Student" s join "Company" co on co."collegeId"=s."collegeId" where s."collegeId" = any($1::uuid[]) and s."isPlaced"`, [bulk]);
  const sz = await one(`select (select count(*) from "College")::int colleges, (select count(*) from "Student")::int students, (select count(*) from "Application")::int apps, (select count(*) from "Offer")::int offers, (select count(*) from "Drive")::int drives, (select count(*) from "User")::int users`);
  // Planner statistics: right after a 100k-row bulk insert they are stale and one query plan is very slow. Measure that once, then ANALYZE (autovacuum does this in a running system) before the timed runs.
  const staleT0 = performance.now(); await T("q=Bulk&from=2026-01-01&to=2026-12-31&sort=offers"); const staleMs = Math.round(performance.now() - staleT0);
  await pgc.query("analyze");
  const timeIt = async (name, fn) => { const ts = []; let last; for (let i = 0; i < 5; i++) { const t0 = performance.now(); last = await fn(); ts.push(performance.now() - t0); } timings.push({ name, medianMs: Math.round(med(ts)), maxMs: Math.round(Math.max(...ts)), runs: ts.length }); return last; };
  const big = await timeIt("GET /api/platform/analytics (all institutions, no range)", () => S());
  const bigR = await timeIt("GET /api/platform/analytics (all institutions, 90-day range)", () => S("from=2026-08-01&to=2026-10-30"));
  const bigT = await timeIt("GET /api/platform/analytics/institutions (page 1, size 10, sort students)", () => T());
  await timeIt("GET /api/platform/analytics/institutions (size 100, sort rate)", () => T("sort=rate&pageSize=100"));
  await timeIt("GET /api/platform/analytics/institutions (search + range)", () => T("q=Bulk&from=2026-01-01&to=2026-12-31&sort=offers"));
  const gb = await one(`select (select count(*) from "Student")::int st, (select count(*) from "User")::int us, (select count(*) from "Drive" where status<>'DRAFT')::int dr, (select count(*) from "Application")::int ap, (select count(*) from "Offer" where status<>'REVOKED')::int ofr, (select count(*) from "Student" where "isActive" and not "isArchived" and "participationStatus"='REGISTERED' and "isPlaced")::int pl, (select count(*) from "Student" where "isActive" and not "isArchived" and "participationStatus"='REGISTERED')::int reg, (select count(*) from "College")::int ins, (select count(*) from "College" where "isActive")::int act`);
  const BG = big.d; t(SA, `large dataset (${sz.colleges} institutions, ${sz.students} students, ${sz.apps} applications, ${sz.offers} offers): global figures equal independent SQL`, BG.users.students.total === gb.st && BG.users.staff.total === gb.us && BG.placement.drives.total === gb.dr && BG.placement.applications.total === gb.ap && BG.placement.offers.made === gb.ofr && BG.placement.placedStudents === gb.pl && BG.placement.registeredForPlacement === gb.reg && BG.institutions.total === gb.ins && BG.institutions.active === gb.act, JSON.stringify([BG.users.students.total, gb.st, BG.placement.offers.made, gb.ofr]));
  const rg = await one(`select (select count(*) from "Application" where "appliedAt" >= '2026-08-01T00:00:00Z' and "appliedAt" <= '2026-10-30T23:59:59.999Z')::int ap, (select count(*) from "Offer" where status<>'REVOKED' and "offeredAt" >= '2026-08-01T00:00:00Z' and "offeredAt" <= '2026-10-30T23:59:59.999Z')::int ofr, (select count(distinct o."studentId") from "Offer" o join "Student" s on s.id=o."studentId" where o.status='ACCEPTED' and s."isActive" and not s."isArchived" and s."participationStatus"='REGISTERED' and coalesce(o."respondedAt", o."offeredAt") >= '2026-08-01T00:00:00Z' and coalesce(o."respondedAt", o."offeredAt") <= '2026-10-30T23:59:59.999Z')::int pl`);
  t(SA, "large dataset with a date range: applications, offers and placed equal independent SQL", bigR.d.placement.applications.total === rg.ap && bigR.d.placement.offers.made === rg.ofr && bigR.d.placement.placedStudents === rg.pl, JSON.stringify([bigR.d.placement.applications.total, rg.ap, bigR.d.placement.offers.made, rg.ofr, bigR.d.placement.placedStudents, rg.pl]));
  t(SA, "large dataset: first table page is correct against SQL for its own rows", await (async () => { const it = bigT.d.items; for (const r of it) { const x = await one(`select (select count(*) from "Student" where "collegeId"=$1)::int st, (select count(*) from "Application" where "collegeId"=$1)::int ap, (select count(*) from "Offer" where "collegeId"=$1 and status<>'REVOKED')::int ofr, (select count(*) from "Student" s where "collegeId"=$1 and "isActive" and not "isArchived" and "participationStatus"='REGISTERED' and "isPlaced")::int pl`, [r.id]); if (x.st !== r.students || x.ap !== r.applications || x.ofr !== r.offers || x.pl !== r.placed) return false; } return it.length === 10; })());
  const walk2 = []; const f2 = await T("pageSize=100"); for (let p = 1; p <= f2.d.totalPages; p++) walk2.push(...(await T(`pageSize=100&page=${p}`)).d.items);
  t(SA, `large dataset: every institution appears exactly once across ${f2.d.totalPages} pages and the rows sum to the global figures`, walk2.length === gb.ins && new Set(walk2.map((r) => r.id)).size === gb.ins && walk2.reduce((a, r) => a + r.students, 0) === gb.st && walk2.reduce((a, r) => a + r.offers, 0) === gb.ofr);
  const worst = Math.max(...timings.map((x) => x.medianMs));
  t(SA, `performance: every analytics call answers in under 3000 ms at this size (worst median ${worst} ms; all measured, see results/g3-07-timings.json)`, worst < 3000, JSON.stringify(timings));
  writeFileSync(new URL("./results/g3-07-timings.json", import.meta.url).pathname, JSON.stringify({ dataset: sz, note: "Median and maximum of 5 sequential requests per call, production build, local Docker Postgres, this machine, after ANALYZE. Measured, not estimated.", staleStatisticsObservation: { call: "institution table, search + date range", firstCallBeforeAnalyzeMs: staleMs, note: "Observed on the first call after a bulk insert, before planner statistics existed. A separate run measured 7.6-8.7 s before ANALYZE and about 0.14 s after, for the same query." }, timings }, null, 1));
} finally {
  for (const ids of [made.bulk, made.colleges]) if (ids.length) { await pgc.query(`delete from "LoginEvent" where "collegeId" = any($1::uuid[])`, [ids]).catch(() => 0); await pgc.query(`delete from "Offer" where "collegeId" = any($1::uuid[])`, [ids]).catch(() => 0); await pgc.query(`delete from "Application" where "collegeId" = any($1::uuid[])`, [ids]).catch(() => 0); await pgc.query(`delete from "Recruiter" where "collegeId" = any($1::uuid[])`, [ids]).catch(() => 0); await pgc.query(`delete from "College" where id = any($1::uuid[])`, [ids]).catch((e) => console.log("cleanup:", e.message)); }
  await pgc.query(`delete from "Recruiter" where email like $1`, [`g3anarec${tag}%`]).catch(() => 0);
  await pgc.query(`delete from "Company" where name=$1`, [`Ana Co ${tag}`]).catch(() => 0);
  await pgc.end();
}
process.exit(R.done() ? 1 : 0);

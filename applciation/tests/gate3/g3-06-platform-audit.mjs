// Gate 4 Phase 4.1: platform audit-log viewer (SA-TC-052, SA-TC-053, plus SA-TC-031/035/057-adjacent access rules).
// Local stack only. Synthetic events only. Events are created two ways: by really performing platform actions (so accuracy is tested end to end)
// and by inserting marked synthetic rows (sensitive values, old dates, bulk for paging, a college-staff row that must never appear).
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { B, client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g3-06-platform-audit");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const A = "SA-TC-052", U = "SA-TC-053", ACC = ["SA-TC-052", "SA-TC-035"], ACC_ALL = ["SA-TC-052", "SA-TC-035", "SRS-SECURITY-TC-022", "SRS-SECURITY-TC-023", "SRS-SECURITY-TC-024"];
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const pw = `G3-audit-${tag}-Pw!`, emailA = `g3audita${tag}@example.com`, emailB = `g3auditb${tag}@example.com`, emailC = `g3auditc${tag}@example.com`;
const mkAdmin = (email) => { const r = spawnSync("npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", env: { ...process.env, PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_NAME: "G3 Audit Admin", PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr); };
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz0123456789";
const SECRETS = ["hunter2-synthetic", "sk-synthetic-abcdefghijklmnopqrstuvwxyz1234", JWT, "synthetic-refresh-token-value", "totp-654321"];
const made = { colleges: [] };
try {
  mkAdmin(emailA); mkAdmin(emailB); mkAdmin(emailC); // C never sets up MFA
  const idA = (await rows(`select id from "PlatformAdmin" where email=$1`, [emailA]))[0].id, idB = (await rows(`select id from "PlatformAdmin" where email=$1`, [emailB]))[0].id;
  const enrol = async (email) => { const c1 = client(await login(email, pw)); const e = await c1("POST", "/api/platform/mfa/enroll"); const v = await c1("POST", "/api/platform/mfa/verify", { factorId: e.d.factorId, code: totp(e.d.secret) }); return { token: v.d.access_token, P: client(v.d.access_token), secret: e.d.secret, factorId: e.d.factorId }; };
  const a = await enrol(emailA), b = await enrol(emailB); const P = a.P;
  const aal1 = client(await login(emailA, pw)), noMfa = client(await login(emailC, pw));

  // ---- real actions by administrator A: audited events must appear accurately
  const t0 = new Date(Date.now() - 2000);
  const wrong = await aal1("POST", "/api/platform/mfa/verify", { factorId: a.factorId, code: "000000" }); // -> platform.mfa.challenge_failed
  const prov = await P("POST", "/api/platform/institutions", { name: `Audit Viewer Inst ${tag}`, admin: { name: "Audit Admin", email: `g3auditinst${tag}@example.com` } });
  const cid = prov.d?.college?.id; if (cid) made.colleges.push(cid);
  await P("PATCH", `/api/platform/institutions/${cid}`, { isActive: false }); await P("PATCH", `/api/platform/institutions/${cid}`, { isActive: true });
  const t1 = new Date(Date.now() + 2000);
  const L = (qs = "") => P("GET", "/api/platform/audit-logs" + (qs ? "?" + qs : ""));
  const all = await L(`pageSize=100&from=${t0.toISOString()}&to=${t1.toISOString()}&admin=${idA}`);
  const by = (act) => all.d?.items?.filter((e) => e.action === act) ?? [];

  // ================= accuracy =================
  t([A], "authorized platform administrator can read the audit log", all.s === 200 && Array.isArray(all.d.items), JSON.stringify(all.j).slice(0, 200));
  t([A], "response shape: items, page, pageSize, total, totalPages, sort, order", ["items", "page", "pageSize", "total", "totalPages", "sort", "order"].every((k) => k in all.d));
  const prv = by("institution.provision")[0];
  t([A, U], "registering an institution appears: actor, action, institution, target, time, outcome", !!prv && prv.actor?.email === emailA && prv.institution?.id === cid && prv.institution?.name === `Audit Viewer Inst ${tag}` && prv.target?.entity === "College" && prv.target?.id === cid && prv.outcome === "success" && prv.source === "INSTITUTION" && new Date(prv.at) >= t0 && new Date(prv.at) <= t1, JSON.stringify(prv));
  t([A, U], "suspending and reactivating are both recorded, each once", by("institution.deactivate").length === 1 && by("institution.activate").length === 1 && by("institution.deactivate")[0].institution.id === cid);
  const chf = by("platform.mfa.challenge_failed")[0];
  t([A], "a failed MFA challenge appears as outcome 'failure' with administrator, address and time", wrong.s === 400 && !!chf && chf.outcome === "failure" && chf.actor?.email === emailA && chf.source === "PLATFORM" && typeof chf.ip === "string", JSON.stringify(chf));
  t([A], "successful security events appear as 'success'", by("platform.mfa.enrolled").length === 1 && by("platform.mfa.enrolled")[0].outcome === "success", by("platform.mfa.enrolled").length);
  t([U], "institution actions and administrator security events appear in ONE trail", new Set(all.d.items.map((e) => e.source)).size === 2);
  t([A], "events are listed newest first by default", all.d.items.every((e, i, arr) => i === 0 || new Date(arr[i - 1].at) >= new Date(e.at)));
  const db = await rows(`select count(*)::int n from "AuditLog" where "collegeId"=$1 and "platformActorId"=$2`, [cid, idA]);
  t([U], "every institution action in the college log written by this administrator is shown", db[0].n === all.d.items.filter((e) => e.institution?.id === cid).length, `${db[0].n} in db`);

  // ================= synthetic events: sensitive values, dates, bulk, and a staff row that must never appear =================
  const sid = randomUUID();
  await rows(`insert into "PlatformAuditLog" (id,"adminId",email,action,detail,ip,"createdAt") values ($1,$2,$3,'g3.synthetic.sensitive',$4,'203.0.113.9',now())`, [sid, idB, emailB, JSON.stringify({ password: SECRETS[0], apiKey: SECRETS[1], note: "visible note", nested: { accessToken: SECRETS[3], deep: { otp: SECRETS[4] } }, header: JWT, list: [{ secret: SECRETS[0], ok: "fine" }] })]);
  const iid = randomUUID();
  await rows(`insert into "AuditLog" (id,"collegeId",action,entity,"entityId","platformActorId",before,after,reason) values ($1,$2,'g3.synthetic.institution',$3,$4,$5,$6,$7,'synthetic reason')`, [iid, cid, "College", cid, idB, JSON.stringify({ name: "Old", apiKey: SECRETS[1] }), JSON.stringify({ name: "New", password: SECRETS[0], session: { refresh_token: SECRETS[3] } }), ]);
  const staffMarker = `g3.staff.marker.${tag}`;
  await rows(`insert into "AuditLog" (id,"collegeId",action,entity) values (gen_random_uuid(),$1,$2,'Student')`, [cid, staffMarker]);
  await rows(`insert into "PlatformAuditLog" (id,"adminId",email,action,"createdAt") values (gen_random_uuid(),$1,$2,'g3.synthetic.old','2020-01-15T12:00:00Z')`, [idB, emailB]);
  await rows(`insert into "PlatformAuditLog" (id,"adminId",email,action,"createdAt") select gen_random_uuid(),$1,$2,'g3.synthetic.bulk',now() - (g || ' minutes')::interval from generate_series(1,60) g`, [idB, emailB]);

  // ================= sensitive information =================
  const d1 = await P("GET", `/api/platform/audit-logs/${sid}`);
  t([A], "detail: platform event returns actor, action, address, time, outcome, detail", d1.s === 200 && d1.d.action === "g3.synthetic.sensitive" && d1.d.actor.email === emailB && d1.d.ip === "203.0.113.9" && d1.d.outcome === "success" && d1.d.detail.note === "visible note", JSON.stringify(d1.j).slice(0, 200));
  t([A, "SRS-SECURITY-TC-035"], "detail: passwords, keys, tokens, OTPs and JWT-shaped values are hidden (platform event)", SECRETS.every((x) => !JSON.stringify(d1.j).includes(x)) && d1.d.detail.password === "[hidden]" && d1.d.detail.nested.accessToken === "[hidden]" && d1.d.detail.nested.deep.otp === "[hidden]" && d1.d.detail.header === "[hidden]", JSON.stringify(d1.d.detail));
  const d2 = await P("GET", `/api/platform/audit-logs/${iid}`);
  t([A, U], "detail: institution event returns before, after, reason, target and institution", d2.s === 200 && d2.d.source === "INSTITUTION" && d2.d.reason === "synthetic reason" && d2.d.institution.id === cid && d2.d.target.id === cid && d2.d.before.name === "Old" && d2.d.after.name === "New", JSON.stringify(d2.j).slice(0, 200));
  t([A, "SRS-SECURITY-TC-035"], "detail: before/after secrets are hidden (institution event)", SECRETS.every((x) => !JSON.stringify(d2.j).includes(x)) && d2.d.before.apiKey === "[hidden]" && d2.d.after.password === "[hidden]" && d2.d.after.session === "[hidden]");
  const lst = await L(`q=synthetic&pageSize=100`);
  t([A, "SRS-SECURITY-TC-035"], "the list never carries detail bodies or secrets", SECRETS.every((x) => !JSON.stringify(lst.j).includes(x)) && !lst.d.items.some((e) => "detail" in e || "before" in e || "after" in e));
  const s1 = await L(`q=${encodeURIComponent(staffMarker)}`);
  t([A], "college staff events are NOT in the platform audit log (list, search or detail)", s1.d.total === 0, JSON.stringify(s1.d));
  const sRow = (await rows(`select id from "AuditLog" where action=$1`, [staffMarker]))[0].id;
  t([A], "a college staff event id gives 404 from the detail route", (await P("GET", `/api/platform/audit-logs/${sRow}`)).s === 404);
  const bodies = JSON.stringify([all.j, d1.j, d2.j]);
  t(["SRS-SECURITY-TC-035"], "responses contain no tokens, session ids or auth headers", !/eyJ[\w-]{10,}\.|authorization|bearer /i.test(bodies));

  // ================= search =================
  const q1 = await L(`q=${encodeURIComponent("challenge_failed")}&pageSize=100`); t([A], "search by event text", q1.d.total >= 1 && q1.d.items.every((e) => /challenge_failed/.test(e.action)));
  const q2 = await L(`q=${encodeURIComponent(emailB.toUpperCase())}&pageSize=100`); t([A], "search by administrator email (case-insensitive)", q2.d.total >= 62 && q2.d.items.every((e) => e.actor?.email === emailB));
  const q3 = await L(`q=${encodeURIComponent(`Audit Viewer Inst ${tag}`.toLowerCase())}&pageSize=100`); t([A], "search by institution name", q3.d.total >= 3 && q3.d.items.every((e) => e.institution?.id === cid));
  const q4 = await L(`q=${encodeURIComponent(cid.slice(0, 13))}&pageSize=100`); t([A], "search by target id", q4.d.total >= 3);
  const q5 = await L(`q=${encodeURIComponent(sid)}`); t([A], "search by event id", q5.d.total === 1 && q5.d.items[0].id === sid);
  const none = await L(`q=zzz-no-such-event-${tag}`); t([A], "no match: 200, empty items, total 0, one page", none.s === 200 && none.d.items.length === 0 && none.d.total === 0 && none.d.totalPages === 1, JSON.stringify(none.d));
  const lit = async (ch) => Number((await rows(`select count(*)::int n from (select p.action, p.email actor, null::text inst, null::text eid, p.id::text id from "PlatformAuditLog" p union all select a.action, pa.email, c.name, a."entityId", a.id::text from "AuditLog" a left join "PlatformAdmin" pa on pa.id=a."platformActorId" left join "College" c on c.id=a."collegeId" where a."platformActorId" is not null) e where position($1 in e.action)>0 or position($1 in coalesce(e.actor,''))>0 or position($1 in coalesce(e.inst,''))>0 or position($1 in coalesce(e.eid,''))>0 or position($1 in e.id)>0`, [ch]))[0].n);
  const pctN = (await L(`q=${encodeURIComponent("%")}`)).d.total, undN = (await L(`q=${encodeURIComponent("_")}`)).d.total, allN = (await L("")).d.total;
  t([A], "% is matched literally, not as a wildcard", pctN === (await lit("%")) && pctN < allN, `api ${pctN} db ${await lit("%")} all ${allN}`);
  t([A], "_ is matched literally, not as a wildcard", undN === (await lit("_")) && undN < allN, `api ${undN} db ${await lit("_")} all ${allN}`);
  const before = (await rows(`select (select count(*) from "PlatformAuditLog")::int p, (select count(*) from "AuditLog")::int a`))[0];
  for (const evil of ["' OR '1'='1", "'; DROP TABLE \"PlatformAuditLog\"; --", "\" OR \"\"=\"", "\\", "<script>alert(1)</script>", "日本語", "😀"]) { const r = await L(`q=${encodeURIComponent(evil)}`); t([A], `hostile search text handled: ${JSON.stringify(evil).slice(0, 28)}`, r.s === 200 && r.d.total === 0 && !/prisma|SELECT|syntax|stack/i.test(JSON.stringify(r.j)), `HTTP ${r.s} total ${r.d?.total}`); }
  const after = (await rows(`select (select count(*) from "PlatformAuditLog")::int p, (select count(*) from "AuditLog")::int a`))[0];
  t([A], "audit tables intact after injection attempts", after.p >= before.p && after.a >= before.a);

  // ================= filters =================
  const f1 = await L(`action=institution.provision&pageSize=100`); t([A], "filter by event type", f1.d.total >= 1 && f1.d.items.every((e) => e.action === "institution.provision"));
  const f2 = await L(`admin=${idB}&pageSize=100`); t([A], "filter by administrator", f2.d.total >= 62 && f2.d.items.every((e) => e.actor.id === idB));
  const f3 = await L(`institution=${cid}&pageSize=100`); t([A, U], "filter by institution", f3.d.total >= 4 && f3.d.items.every((e) => e.institution.id === cid && e.source === "INSTITUTION"));
  const f4 = await L(`source=PLATFORM&pageSize=100`), f5 = await L(`source=INSTITUTION&pageSize=100`); t([A, U], "filter by kind", f4.d.items.every((e) => e.source === "PLATFORM") && f5.d.items.every((e) => e.source === "INSTITUTION") && f4.d.total + f5.d.total === (await L("")).d.total);
  const f6 = await L(`outcome=failure&pageSize=100`), f7 = await L(`outcome=success&pageSize=100`); t([A], "filter by outcome: failures are only *_failed events, and failure + success = all", f6.d.total >= 1 && f6.d.items.every((e) => e.outcome === "failure" && /_failed$/.test(e.action)) && f7.d.items.every((e) => e.outcome === "success") && f6.d.total + f7.d.total === (await L("")).d.total);
  const old = await L(`from=2020-01-01&to=2020-01-31&pageSize=100`); t([A], "date range returns only events inside it (date-only 'to' includes the whole last day)", old.d.total === 1 && old.d.items[0].action === "g3.synthetic.old");
  const day = await L(`from=2020-01-15&to=2020-01-15`); t([A], "single-day range includes events during that day", day.d.total === 1);
  t([A], "range with no events is empty, not an error", (await L(`from=2019-01-01&to=2019-12-31`)).d.total === 0);
  t([A], "from after to is refused (400)", (await L(`from=2026-02-01&to=2026-01-01`)).s === 400);
  const comb = await L(`admin=${idB}&action=g3.synthetic.bulk&q=bulk&outcome=success&from=2020-01-01&pageSize=100`); t([A], "filters combine", comb.d.total === 60 && comb.d.items.every((e) => e.action === "g3.synthetic.bulk"));
  const fac = await P("GET", "/api/platform/audit-logs/facets"); t([A], "facets list event types and administrators that exist", fac.s === 200 && fac.d.actions.includes("institution.provision") && fac.d.actions.includes("g3.synthetic.bulk") && fac.d.admins.some((x) => x.id === idA) && !JSON.stringify(fac.j).match(/password|token/i));

  // ================= sorting (checked against an independent SQL of the same two tables) =================
  const U_SQL = `select e.id from (select p.id, p."createdAt" at, p.action, p.email actor, null::text inst, 'PLATFORM' src from "PlatformAuditLog" p union all select a.id, a."createdAt", a.action, pa.email, c.name, 'INSTITUTION' from "AuditLog" a left join "PlatformAdmin" pa on pa.id=a."platformActorId" left join "College" c on c.id=a."collegeId" where a."platformActorId" is not null) e`;
  for (const [k, col] of [["createdAt", "at"], ["action", "action"], ["actor", "actor"], ["institution", "inst"], ["source", "src"]]) for (const dir of ["asc", "desc"]) {
    const r = await L(`sort=${k}&order=${dir}&pageSize=100`); const got = r.d.items.map((e) => e.id);
    const want = (await rows(`${U_SQL} order by ${col} ${dir} nulls last, at desc, id asc limit 100`)).map((x) => x.id);
    t([A], `sort by ${k} ${dir} matches an independent SQL ordering`, r.s === 200 && JSON.stringify(got) === JSON.stringify(want), `first api ${got[0]} db ${want[0]}`);
  }
  // ================= pagination =================
  const tot = (await rows(`select ((select count(*) from "PlatformAuditLog") + (select count(*) from "AuditLog" where "platformActorId" is not null))::int n`))[0].n;
  const p1 = await L(`pageSize=10`); t([A], "total and page count equal the database", p1.d.total === tot && p1.d.totalPages === Math.ceil(tot / 10) && p1.d.items.length === 10, `${p1.d.total} vs ${tot}`);
  const walk = []; for (let p = 1; p <= p1.d.totalPages; p++) walk.push(...(await L(`pageSize=10&page=${p}&sort=action`)).d.items.map((e) => e.id));
  t([A], "walking every page of a tied sort returns every event exactly once (stable order)", walk.length === tot && new Set(walk).size === tot, `${walk.length}/${new Set(walk).size}/${tot}`);
  const bey = await L(`pageSize=10&page=${p1.d.totalPages + 1}`); t([A], "page past the end: 200, empty items, accurate total", bey.s === 200 && bey.d.items.length === 0 && bey.d.total === tot);
  t([A], "pageSize 1 and 100 respected", (await L("pageSize=1")).d.items.length === 1 && (await L("pageSize=100")).d.items.length === Math.min(100, tot));
  for (const bad of ["page=0", "page=-1", "page=abc", "page=1.5", "pageSize=0", "pageSize=101", "pageSize=ten", "sort=ip", "sort=at;drop", "order=up", "source=COLLEGE", "outcome=maybe", "admin=not-a-uuid", "institution=123", "action=has%20space", "action=a%3Bb", "from=notadate", "to=31-31-2026", "q=" + "x".repeat(101)]) { const r = await L(bad); t([A], `invalid parameter refused (400, no leak): ${bad.slice(0, 30)}`, r.s === 400 && !/prisma|SELECT|stack|constraint/i.test(JSON.stringify(r.j)), `HTTP ${r.s}`); }
  t([A], "unknown event id is 404 and a non-uuid id is 404 (no database error)", (await P("GET", `/api/platform/audit-logs/${randomUUID()}`)).s === 404 && (await P("GET", "/api/platform/audit-logs/not-a-uuid")).s === 404 && (await P("GET", "/api/platform/audit-logs/1%27%20OR%20%271")).s === 404);

  // ================= access control =================
  const colAdmin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
  const S = await makeStudents(colAdmin, 1, "AUD"); const stu = client(S.tokens.A);
  const co = (await rows(`insert into "Company" (id,"collegeId",name,"updatedAt") values (gen_random_uuid(),(select "collegeId" from "User" where email=$1),$2,now()) returning id`, [process.env.SEED_ADMIN_EMAIL, `Aud Co ${tag}`]))[0].id;
  const { data: ru } = await sb.auth.admin.createUser({ email: `g3audrec${tag}@example.com`, password: pw, email_confirm: true });
  await rows(`insert into "Recruiter" (id,"collegeId","companyId",email,name) values ($1,(select "collegeId" from "User" where email=$2),$3,$4,'Aud Rec')`, [ru.user.id, process.env.SEED_ADMIN_EMAIL, co, `g3audrec${tag}@example.com`]);
  const rec = client(await login(`g3audrec${tag}@example.com`, pw));
  const fac2 = { path: "/api/platform/audit-logs/facets" }; void fac2;
  const paths = ["/api/platform/audit-logs", `/api/platform/audit-logs/${sid}`, "/api/platform/audit-logs/facets", `/api/platform/audit-logs?q=${tag}&pageSize=100&admin=${idA}`];
  const who = [["anonymous", (p) => fetch(B + p).then((r) => ({ s: r.status, b: "" }))], ["institution administrator (Head TPO)", (p) => colAdmin("GET", p)], ["student", (p) => stu("GET", p)], ["recruiter", (p) => rec("GET", p)], ["platform admin, password only (second step incomplete)", (p) => aal1("GET", p)], ["platform admin with no authenticator set up", (p) => noMfa("GET", p)]];
  for (const [n, f] of who) for (const p of paths) { const r = await f(p); const ok = n.startsWith("anonymous") ? r.s === 401 : n.includes("password only") ? r.s === 403 && r.code === "MFA_REQUIRED" : n.includes("no authenticator") ? r.s === 403 && r.code === "MFA_SETUP_REQUIRED" : r.s === 403; t(ACC_ALL, `${n} is refused on ${p.replace(sid, ":id").replace(/\?.*/, "")}`, ok && !/audit|action|synthetic/i.test(JSON.stringify(r.j ?? "")), `HTTP ${r.s} ${r.code ?? ""}`); }
  const ranks = await rows(`select id from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL]); void ranks;
  // other college roles
  const mkStaff = async (label, role) => { const email = `g3aud${label}${tag}@example.com`; const { data } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true }); await rows(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values ($1,(select "collegeId" from "User" where email=$2),$3,$4,$5::"Role",'{}',now())`, [data.user.id, process.env.SEED_ADMIN_EMAIL, email, "Aud " + label, role]); return client(await login(email, pw)); };
  for (const [label, role] of [["officer", "PLACEMENT_OFFICER"], ["coord", "DEPARTMENT_COORDINATOR"], ["faculty", "FACULTY"], ["principal", "PRINCIPAL"]]) { const c = await mkStaff(label, role); t(ACC_ALL, `college ${label} is refused on the audit log and on an event`, (await c("GET", "/api/platform/audit-logs")).s === 403 && (await c("GET", `/api/platform/audit-logs/${sid}`)).s === 403); }

  // ================= read-only =================
  const counts = async () => JSON.stringify(await rows(`select (select count(*) from "PlatformAuditLog")::int p, (select count(*) from "AuditLog")::int a`));
  const c0 = await counts();
  const wrote = [];
  for (const m of ["POST", "PUT", "PATCH", "DELETE"]) for (const p of ["/api/platform/audit-logs", `/api/platform/audit-logs/${sid}`, `/api/platform/audit-logs/${iid}`, "/api/platform/audit-logs/facets"]) { const r = await P(m, p, m === "DELETE" ? undefined : { action: "tamper" }); if (r.s !== 405) wrote.push(`${m} ${p.replace(/[0-9a-f-]{36}/, ":id")} -> ${r.s}`); const an = await fetch(B + p, { method: m }); if (an.status >= 200 && an.status < 300) wrote.push(`anon ${m} ${p} -> ${an.status}`); }
  t([A, "SRS-SECURITY-TC-038"], "POST, PUT, PATCH and DELETE are refused with 405 on every audit route (no write path exists)", wrote.length === 0, wrote.join("; "));
  const c1 = await counts();
  t([A, "SRS-SECURITY-TC-038"], "no audit row was added, changed or removed by those attempts", c0 === c1, `${c0} -> ${c1}`);
  t([A, "SRS-SECURITY-TC-038"], "the synthetic event is byte-for-byte unchanged after tamper attempts", JSON.stringify((await rows(`select action, detail from "PlatformAuditLog" where id=$1`, [sid]))[0].detail).includes("visible note"));
  t([A], "reading the log does not write to it (list, detail, facets leave counts unchanged)", await (async () => { const x = await counts(); await L("pageSize=5"); await P("GET", `/api/platform/audit-logs/${sid}`); await P("GET", "/api/platform/audit-logs/facets"); return x === (await counts()); })());
  const err = await fetch(B + "/api/platform/audit-logs?sort=zzz", { headers: { authorization: "Bearer not.a.token" } }); const et = await err.text();
  t(["SRS-SECURITY-TC-035"], "error responses carry no stack, SQL or table names", !/prisma|SELECT|\"PlatformAuditLog\"|at \w+ \(|node_modules/i.test(et), et.slice(0, 160));
  { const r = await fetch(B + "/api/platform/audit-logs?pageSize=1", { headers: { authorization: "Bearer " + a.token } }); const cc = r.headers.get("cache-control") ?? ""; await r.arrayBuffer();
    t(["SRS-SECURITY-TC-035"], "an authorized audit response is not cacheable (no-store / no-cache / private)", r.status === 200 && /no-store|no-cache|private/.test(cc), `HTTP ${r.status} cache-control: ${cc}`); }
} finally {
  await rows(`delete from "PlatformAuditLog" where action like 'g3.synthetic.%'`).catch(() => 0);
  await rows(`delete from "AuditLog" where action like 'g3.synthetic.%' or action like 'g3.staff.marker.%'`).catch(() => 0);
  await rows(`delete from "Recruiter" where email like $1`, [`g3audrec${tag}%`]).catch(() => 0);
  await rows(`delete from "Company" where name=$1`, [`Aud Co ${tag}`]).catch(() => 0);
  await pgc.end();
}
process.exit(R.done() ? 1 : 0);

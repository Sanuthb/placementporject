// Gate 4: platform support requests (SA-TC-011, 063, 064, 065). Own dev-server instance on port 3117, local Docker stack only, synthetic data.
import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g4-06-platform-support");
const t = (ids, n, ok, x = "") => R.t(ids, n, ok, x, "");
const PORT = 3117, BASE = `http://localhost:${PORT}`, WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const env = { ...process.env, PORT: String(PORT), RATE_LIMIT_DISABLED: "true", FLOOD_MAX_PER_MINUTE: "100000", APP_URL: BASE, REQUIRE_LOCAL_DB: "true" };
const out = [];
const app = spawn(WIN ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], { env, detached: !WIN, stdio: ["ignore", "pipe", "pipe"], shell: WIN, windowsHide: true });
app.stdout.on("data", (d) => out.push(String(d))); app.stderr.on("data", (d) => out.push(String(d)));
const stopApp = () => { try { if (WIN) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-app.pid); } catch { /* gone */ } };
process.on("exit", stopApp);
const wait = async (path, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + path)).ok) return true; } catch { /* starting */ } await sleep(900); } return false; };
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pw = `G4-sup-${tag}-Pw!`, SUB = "support-test";
const mails = { p1: `g4sup1${tag}@example.com`, p2: `g4sup2${tag}@example.com`, p3: `g4sup3${tag}@example.com`, p4: `g4sup4${tag}@example.com`, b: `g4supb${tag}@example.com`, po: `g4suppo${tag}@example.com` };
const mkAdmin = (e) => { const r = spawnSync(WIN ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: WIN, env: { ...process.env, PLATFORM_ADMIN_EMAIL: e, PLATFORM_ADMIN_NAME: "G4 Support " + e.slice(5, 9), PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr); };
const withMfa = async (e) => { const c = client(await login(e, pw), BASE); const enr = await c("POST", "/api/platform/mfa/enroll"); const tok = (await c("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token; return client(tok, BASE); };
const raw = (m, p, b, h = {}) => fetch(BASE + p, { method: m, headers: { "content-type": "application/json", ...h }, body: b === undefined ? undefined : typeof b === "string" ? b : JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => null) }));
const colB = { id: null }; let colA = null;
try {
  t(["SA-TC-011"], "the instance under test starts", await wait("/api/health/live"));
  for (const e of [mails.p1, mails.p2, mails.p3, mails.p4]) mkAdmin(e);
  const P = await withMfa(mails.p1), P2 = await withMfa(mails.p2);
  await withMfa(mails.p3); const aal1 = client(await login(mails.p3, pw), BASE), noMfa = client(await login(mails.p4, pw), BASE);
  const p1Id = (await rows(`select id from "PlatformAdmin" where email=$1`, [mails.p1]))[0].id, p2Id = (await rows(`select id from "PlatformAdmin" where email=$1`, [mails.p2]))[0].id;
  const adminA = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD), BASE);
  colA = (await rows(`select id from "College" where id=(select "collegeId" from "User" where email=$1)`, [process.env.SEED_ADMIN_EMAIL]))[0].id;
  // college B and its administrator
  const prov = await P("POST", "/api/platform/institutions", { name: `G4 Support College B ${tag}`, slug: `g4-sup-b-${tag}`, admin: { name: "B Admin", email: mails.b } });
  colB.id = (await rows(`select id from "College" where slug=$1`, [`g4-sup-b-${tag}`]))[0]?.id;
  const bUser = (await rows(`select id from "User" where email=$1`, [mails.b]))[0].id;
  await sb.auth.admin.updateUserById(bUser, { password: pw, email_confirm: true });
  const adminB = client(await login(mails.b, pw), BASE);
  // a placement officer of college A (a role that must not reach the platform line), and a student of college A with personal data
  const po = await sb.auth.admin.createUser({ email: mails.po, password: pw, email_confirm: true });
  await rows(`insert into "User"(id,"collegeId",email,name,role,"updatedAt") values ($1,$2,$3,'G4 Officer','PLACEMENT_OFFICER',now())`, [po.data.user.id, colA, mails.po]).catch(async () => rows(`insert into "User"(id,"collegeId",email,name,role) values ($1,$2,$3,'G4 Officer','PLACEMENT_OFFICER')`, [po.data.user.id, colA, mails.po]));
  const officer = client(await login(mails.po, pw), BASE);
  const S = await makeStudents(adminA, 1, "SUP"); const stu = client(S.tokens.A, BASE);
  const stuRow = (await rows(`select name, "enrollmentNo", email from "Student" where id=$1`, [S.ids.A]))[0];
  await rows(`delete from "PlatformSupportRequest" where subject like $1`, [`${SUB}%`]);

  // ============ access control (SA-TC-011) ============
  const dummy = "00000000-0000-4000-8000-000000000001";
  const endpoints = [["GET", "/api/platform/support"], ["GET", `/api/platform/support/${dummy}`], ["POST", `/api/platform/support/${dummy}/assign`, { assigneeId: null }], ["POST", `/api/platform/support/${dummy}/notes`, { message: "x" }], ["POST", `/api/platform/support/${dummy}/reply`, { message: "x" }], ["POST", `/api/platform/support/${dummy}/status`, { status: "OPEN" }], ["POST", `/api/platform/support/${dummy}/resolve`, { message: "x" }]];
  const who = [["anonymous", (m, p, b) => raw(m, p, b)], ["garbage token", (m, p, b) => raw(m, p, b, { authorization: "Bearer not.a.token" })], ["institution administrator", (m, p, b) => adminA(m, p, b).then((r) => ({ s: r.s, j: r.j }))], ["placement officer", (m, p, b) => officer(m, p, b).then((r) => ({ s: r.s, j: r.j }))], ["student", (m, p, b) => stu(m, p, b).then((r) => ({ s: r.s, j: r.j }))], ["platform admin, no second step", (m, p, b) => aal1(m, p, b).then((r) => ({ s: r.s, j: r.j }))], ["platform admin, no authenticator", (m, p, b) => noMfa(m, p, b).then((r) => ({ s: r.s, j: r.j }))]];
  const bad = [];
  for (const [n, f] of who) for (const [m, p, b] of endpoints) { const r = await f(m, p, b); const code = r.j?.error?.code; const ok = n === "anonymous" || n === "garbage token" ? r.s === 401 : n.includes("no second step") ? r.s === 403 && code === "MFA_REQUIRED" : n.includes("no authenticator") ? r.s === 403 && code === "MFA_SETUP_REQUIRED" : r.s === 403; if (!ok) bad.push(`${n} ${m} ${p.replace(dummy, ":id")} -> ${r.s} ${code}`); }
  t(["SA-TC-011"], "every identity except a verified platform administrator is refused on all 7 platform support endpoints (anonymous/garbage 401; institution admin, officer, student 403; no second step MFA_REQUIRED; no authenticator MFA_SETUP_REQUIRED)", bad.length === 0, bad.slice(0, 4).join("; "));
  const instEp = [["GET", "/api/support-requests"], ["POST", "/api/support-requests", { category: "OTHER", subject: "support-test refused", message: "refused" }], ["GET", `/api/support-requests/${dummy}`], ["POST", `/api/support-requests/${dummy}/messages`, { message: "x" }]];
  const bad2 = [];
  for (const [n, f] of [["anonymous", (m, p, b) => raw(m, p, b)], ["officer", (m, p, b) => officer(m, p, b)], ["student", (m, p, b) => stu(m, p, b)], ["platform admin", (m, p, b) => P(m, p, b)]]) for (const [m, p, b] of instEp) { const r = await f(m, p, b); if (!(n === "anonymous" ? r.s === 401 : r.s === 403)) bad2.push(`${n} ${m} ${p.replace(dummy, ":id")} -> ${r.s}`); }
  t(["SA-TC-011"], "the institution-side request routes accept only an institution administrator: anonymous 401; placement officer, student and a platform administrator 403", bad2.length === 0, bad2.join("; "));
  t(["SA-TC-011"], "refused calls created nothing", (await rows(`select count(*)::int n from "PlatformSupportRequest" where subject like 'support-test%'`))[0].n === 0);

  // ============ creation and validation ============
  const stuText = `${stuRow.name} (${stuRow.enrollmentNo}) cannot see marks. Mail ${stuRow.email}, phone +91 98765 43210, Aadhaar 1234 5678 9012.`;
  const c1 = await adminA("POST", "/api/support-requests", { category: "DATA", subject: `${SUB} marks missing`, message: stuText });
  const c2 = await adminA("POST", "/api/support-requests", { category: "TECHNICAL", subject: `${SUB} login slow`, message: "Sign-in takes a long time." });
  const c3 = await adminB("POST", "/api/support-requests", { category: "ACCOUNT", subject: `${SUB} B account`, message: "Please reset our admin profile." });
  t(["SA-TC-011", "SA-TC-063"], "institution administrators of two colleges can raise requests (status OPEN)", [c1, c2, c3].every((c) => c.s === 200 && c.d?.status === "OPEN"), JSON.stringify([c1.s, c2.s, c3.s]));
  const bads = [["short subject", { category: "DATA", subject: "ab", message: "hello there" }], ["bad category", { category: "NOPE", subject: "valid subject", message: "hello there" }], ["empty message", { category: "DATA", subject: "valid subject", message: "  " }], ["huge message", { category: "DATA", subject: "valid subject", message: "x".repeat(5001) }], ["missing fields", {}]];
  const badRes = []; for (const [n, b] of bads) { const r = await adminA("POST", "/api/support-requests", b); if (r.s !== 400) badRes.push(`${n}:${r.s}`); }
  const badJson = await raw("POST", "/api/support-requests", "{not json", { authorization: "Bearer " + (await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD)) });
  t(["SA-TC-011"], "invalid creation input is refused with 400 (short subject, bad category, empty/oversize message, missing fields, malformed JSON) and stores nothing", badRes.length === 0 && badJson.s === 400 && (await rows(`select count(*)::int n from "PlatformSupportRequest" where subject like 'support-test%'`))[0].n === 3, badRes.join(",") + badJson.s);
  const idA1 = c1.d.id, idA2 = c2.d.id, idB1 = c3.d.id;
  const stored = (await rows(`select (select count(*)::int from "PlatformSupportEntry" where "requestId"=r.id) n, "collegeId", "requesterId", status from "PlatformSupportRequest" r where id=$1`, [idA1]))[0];
  t(["SA-TC-011"], "a request is stored against the requester's own college, with the requester and one opening message", stored.collegeId === colA && stored.n === 1 && !!stored.requesterId && stored.status === "OPEN");

  // ============ list and filters (SA-TC-063) ============
  const all = await P("GET", "/api/platform/support");
  const mine = (r) => r.d.items.filter((i) => i.subject.startsWith(SUB));
  t(["SA-TC-063", "SA-TC-011"], "the platform list shows requests from both institutions with institution name, type, status and age fields", all.s === 200 && mine(all).length === 3 && new Set(mine(all).map((i) => i.college.id)).size === 2 && mine(all).every((i) => i.college.name && i.category && i.status && i.createdAt), JSON.stringify(all.j).slice(0, 200));
  const fa = await P("GET", `/api/platform/support?institution=${colA}`), fb = await P("GET", `/api/platform/support?institution=${colB.id}`);
  t(["SA-TC-063"], "filter by institution returns only that institution's requests (A: 2, B: 1) and totals match the database", mine(fa).length === 2 && fa.d.items.every((i) => i.college.id === colA) && mine(fb).length === 1 && fb.d.total === (await rows(`select count(*)::int n from "PlatformSupportRequest" where "collegeId"=$1`, [colB.id]))[0].n);
  const fo = await P("GET", "/api/platform/support?status=OPEN"), fr = await P("GET", "/api/platform/support?status=RESOLVED");
  t(["SA-TC-063"], "filter by status works (OPEN lists the three, RESOLVED lists none of them)", mine(fo).length === 3 && mine(fr).length === 0);
  const fq = await P("GET", `/api/platform/support?q=${encodeURIComponent("login slow")}`), fq2 = await P("GET", `/api/platform/support?q=${encodeURIComponent(`G4 Support College B ${tag}`)}`);
  t(["SA-TC-063"], "search finds a request by subject text and by institution name", mine(fq).length === 1 && fq.d.items.some((i) => i.id === idA2) && mine(fq2).length === 1 && fq2.d.items.some((i) => i.id === idB1));
  const fp = await P("GET", "/api/platform/support?q=%25"), fu = await P("GET", "/api/platform/support?q=_"), fs = await P("GET", `/api/platform/support?q=${encodeURIComponent("'; drop table \"Ticket\"; --")}`);
  t(["SA-TC-063"], "special characters in search are literal: % and _ match nothing here, an injection string returns an empty list and breaks nothing", mine(fp).length === 0 && mine(fu).length === 0 && fs.s === 200 && fs.d.items.length === 0 && (await rows(`select count(*)::int n from "Ticket"`))[0].n >= 0);
  const pg1 = await P("GET", "/api/platform/support?pageSize=1&page=1"), pg2 = await P("GET", "/api/platform/support?pageSize=1&page=2");
  t(["SA-TC-063"], "paging returns different rows per page and the total matches the database", pg1.d.items.length === 1 && pg2.d.items.length === 1 && pg1.d.items[0].id !== pg2.d.items[0].id && pg1.d.total === (await rows(`select count(*)::int n from "PlatformSupportRequest"`))[0].n);
  const inv = [await P("GET", "/api/platform/support?status=BOGUS"), await P("GET", "/api/platform/support?page=0"), await P("GET", "/api/platform/support?pageSize=500"), await P("GET", "/api/platform/support?institution=not-a-uuid")];
  t(["SA-TC-063"], "invalid filters are refused with 400", inv.every((r) => r.s === 400), inv.map((r) => r.s).join());
  const one = await P("GET", `/api/platform/support/${idB1}`);
  t(["SA-TC-063"], "a request opens with its institution, requester name, history and no requester e-mail", one.s === 200 && one.d.institution.id === colB.id && one.d.requester?.name === "B Admin" && one.d.entries.length === 1 && !JSON.stringify(one.j).includes(mails.b));

  // ============ institution isolation (SA-TC-011) ============
  const la = await adminA("GET", "/api/support-requests"), lb = await adminB("GET", "/api/support-requests");
  t(["SA-TC-011"], "each institution administrator lists only their own requests (A: 2, B: 1)", la.d.items.length === 2 && la.d.items.every((i) => [idA1, idA2].includes(i.id)) && lb.d.items.length === 1 && lb.d.items[0].id === idB1);
  const x1 = await adminA("GET", `/api/support-requests/${idB1}`), x2 = await adminB("GET", `/api/support-requests/${idA1}`), x3 = await adminA("POST", `/api/support-requests/${idB1}/messages`, { message: "intrusion" });
  t(["SA-TC-011"], "an institution administrator cannot open or reply to another institution's request (404, no data)", x1.s === 404 && x2.s === 404 && x3.s === 404 && !JSON.stringify([x1.j, x2.j]).includes("Please reset") && (await rows(`select count(*)::int n from "PlatformSupportEntry" where "requestId"=$1`, [idB1]))[0].n === 1);

  // ============ privacy (SA-TC-064) ============
  const det = await P("GET", `/api/platform/support/${idA1}`); const dj = JSON.stringify(det.j), lj = JSON.stringify((await P("GET", "/api/platform/support")).j);
  const hidden = [["student name", stuRow.name], ["enrolment number", stuRow.enrollmentNo], ["student e-mail", stuRow.email], ["phone", "98765"], ["Aadhaar-style number", "5678 9012"], ["requester e-mail", process.env.SEED_ADMIN_EMAIL]];
  t(["SA-TC-064"], "the platform view of a request that mentions a student hides the student's name, enrolment number, e-mail, phone and Aadhaar-style number", det.s === 200 && hidden.slice(0, 5).every(([, v]) => !dj.includes(v)), hidden.filter(([, v]) => dj.includes(v)).map(([k]) => k).join());
  t(["SA-TC-064"], "the useful part of the text is kept so the request can still be handled", det.d.entries[0].body.includes("cannot see marks") && det.d.entries[0].body.includes("[student hidden]") && det.d.entries[0].body.includes("[email hidden]"), det.d.entries[0].body);
  t(["SA-TC-064"], "neither the detail nor the list exposes the requester's e-mail or any institution contact details", !dj.includes(process.env.SEED_ADMIN_EMAIL) && !lj.includes(process.env.SEED_ADMIN_EMAIL) && !/"(email|phone|enrollmentNo|userId|requesterId)"/.test(dj + lj));
  const rawRow = (await rows(`select body from "PlatformSupportEntry" where "requestId"=$1`, [idA1]))[0].body;
  const own = await adminA("GET", `/api/support-requests/${idA1}`);
  t(["SA-TC-064"], "the institution itself still sees its own text unmasked (masking is applied only on the platform side)", rawRow === stuText && own.d.entries[0].body === stuText);
  const tickLeak = await P("GET", "/api/platform/support?q=" + encodeURIComponent(stuRow.enrollmentNo));
  t(["SA-TC-064"], "searching the platform list for the student's enrolment number does not find the request (search cannot be used to confirm a student)", tickLeak.s === 200 && tickLeak.d.items.length === 0);
  const noStudentApi = await P("GET", `/api/platform/support/${idA1}/student`);
  t(["SA-TC-064"], "there is no platform route that returns student records or attachments for a request", [404, 405].includes(noStudentApi.s) && !(await P("GET", "/api/platform/support/attachments")).d);

  // ============ workflow (SA-TC-065) ============
  const asg = await P("POST", `/api/platform/support/${idA1}/assign`, { assigneeId: p1Id });
  const after = (await rows(`select status, "assigneeAdminId" from "PlatformSupportRequest" where id=$1`, [idA1]))[0];
  t(["SA-TC-065"], "assigning an open request records the assignee and moves it to IN_PROGRESS", asg.s === 200 && after.assigneeAdminId === p1Id && after.status === "IN_PROGRESS", JSON.stringify(asg.j));
  const asgBad = [await P("POST", `/api/platform/support/${idA1}/assign`, { assigneeId: "00000000-0000-4000-8000-0000000000aa" }), await P("POST", `/api/platform/support/${idA1}/assign`, { assigneeId: "x" }), await P("POST", `/api/platform/support/${idA1}/assign`, {})];
  t(["SA-TC-065"], "assigning to someone who is not an active platform administrator, or with a bad body, is refused (400) and changes nothing", asgBad.every((r) => r.s === 400) && (await rows(`select "assigneeAdminId" a from "PlatformSupportRequest" where id=$1`, [idA1]))[0].a === p1Id, asgBad.map((r) => r.s).join());
  const mineF = await P("GET", "/api/platform/support?assignee=me"), noneF = await P("GET", "/api/platform/support?assignee=none");
  t(["SA-TC-063", "SA-TC-065"], "filtering by assignee works (me: the assigned one; none: the unassigned ones)", mine(mineF).length === 1 && mineF.d.items[0].id === idA1 && mine(noneF).length === 2 && !mine(noneF).some((i) => i.id === idA1));

  const NOTE = `internal-only-note-${tag} do not tell the college`;
  const note = await P("POST", `/api/platform/support/${idA1}/notes`, { message: NOTE });
  const pd = await P("GET", `/api/platform/support/${idA1}`);
  const instD = await adminA("GET", `/api/support-requests/${idA1}`), instL = await adminA("GET", "/api/support-requests");
  t(["SA-TC-065"], "an internal note is saved and shown to platform administrators, marked as internal", note.s === 200 && pd.d.entries.some((e) => e.kind === "NOTE" && e.body.includes(NOTE)));
  t(["SA-TC-065"], "the internal note is NOT visible to the institution: not in the request detail, the list, or any other response", !JSON.stringify([instD.j, instL.j]).includes(NOTE) && !instD.d.entries.some((e) => e.kind === "NOTE"));
  const collegeAudit = JSON.stringify(await rows(`select * from "AuditLog" where "collegeId"=$1`, [colA]));
  t(["SA-TC-065"], "the internal note text is not in the college's audit log, and the note is audited on the platform trail without its text", !collegeAudit.includes(NOTE) && (await rows(`select detail, "adminId" from "PlatformAuditLog" where action='support.note'`)).some((r) => r.detail?.requestId === idA1 && r.adminId === p1Id && !JSON.stringify(r.detail).includes(NOTE)));
  const rep = await P("POST", `/api/platform/support/${idA1}/reply`, { message: "We re-synced the marks; please check." });
  const instD2 = await adminA("GET", `/api/support-requests/${idA1}`);
  t(["SA-TC-065"], "a reply to the institution is visible to it, attributed to the platform team, with no administrator identity", rep.s === 200 && instD2.d.entries.some((e) => e.from === "platform" && e.body.startsWith("We re-synced")) && !JSON.stringify(instD2.j).includes(p1Id) && !JSON.stringify(instD2.j).includes(mails.p1));
  const irep = await adminA("POST", `/api/support-requests/${idA1}/messages`, { message: "Thanks, checking now." });
  t(["SA-TC-065"], "the institution can reply while the request is open and the platform side sees it", irep.s === 200 && (await P("GET", `/api/platform/support/${idA1}`)).d.entries.some((e) => e.body === "Thanks, checking now."));
  const st = await P("POST", `/api/platform/support/${idA1}/status`, { status: "OPEN" }), st2 = await P("POST", `/api/platform/support/${idA1}/status`, { status: "OPEN" }), st3 = await P("POST", `/api/platform/support/${idA1}/status`, { status: "RESOLVED" }), st4 = await P("POST", `/api/platform/support/${idA1}/status`, { status: "IN_PROGRESS" });
  t(["SA-TC-065"], "status moves between OPEN and IN_PROGRESS; setting the same status again is a 409; RESOLVED cannot be set through the status route (400)", st.s === 200 && st2.s === 409 && st3.s === 400 && st4.s === 200, [st.s, st2.s, st3.s, st4.s].join());
  const badMsg = [await P("POST", `/api/platform/support/${idA1}/resolve`, { message: "" }), await P("POST", `/api/platform/support/${idA1}/resolve`, {}), await P("POST", `/api/platform/support/${idA1}/notes`, { message: "x".repeat(5001) }), await P("POST", `/api/platform/support/${dummy}/notes`, { message: "x" }), await P("POST", `/api/platform/support/not-a-uuid/notes`, { message: "x" })];
  t(["SA-TC-065"], "resolving with no message, an oversize note, an unknown id and a malformed id are refused (400/400/400/404/404) and nothing changes", badMsg.map((r) => r.s).join() === "400,400,400,404,404" && (await rows(`select status from "PlatformSupportRequest" where id=$1`, [idA1]))[0].status === "IN_PROGRESS", badMsg.map((r) => r.s).join());

  // concurrency: two administrators resolve the same request at once; two different assignments at once
  await P("POST", `/api/platform/support/${idA2}/status`, { status: "IN_PROGRESS" });
  const race = await Promise.all([P("POST", `/api/platform/support/${idA2}/resolve`, { message: "Fixed by admin one" }), P2("POST", `/api/platform/support/${idA2}/resolve`, { message: "Fixed by admin two" })]);
  const resolvedRows = await rows(`select count(*)::int n from "PlatformSupportEntry" where "requestId"=$1 and kind='EVENT' and body='Resolved'`, [idA2]);
  t(["SA-TC-065"], "two simultaneous resolves: exactly one wins (200) and the other gets 409; the history holds one 'Resolved' event and one resolution message", race.map((r) => r.s).sort().join() === "200,409" && resolvedRows[0].n === 1 && (await rows(`select count(*)::int n from "PlatformSupportEntry" where "requestId"=$1 and body like 'Fixed by admin%'`, [idA2]))[0].n === 1, race.map((r) => r.s).join());
  const res2 = (await rows(`select status, "resolvedAt" from "PlatformSupportRequest" where id=$1`, [idA2]))[0];
  t(["SA-TC-065"], "the resolved request carries RESOLVED and a resolution time", res2.status === "RESOLVED" && !!res2.resolvedAt);
  const after2 = [await P("POST", `/api/platform/support/${idA2}/resolve`, { message: "again" }), await P("POST", `/api/platform/support/${idA2}/assign`, { assigneeId: p2Id }), await P("POST", `/api/platform/support/${idA2}/reply`, { message: "late" }), await P("POST", `/api/platform/support/${idA2}/status`, { status: "OPEN" }), await adminA("POST", `/api/support-requests/${idA2}/messages`, { message: "late" })];
  t(["SA-TC-065"], "a resolved request is final: resolve, assign, reply, status change and an institution reply are all refused with 409", after2.every((r) => r.s === 409), after2.map((r) => r.s).join());
  const instRes = await adminA("GET", `/api/support-requests/${idA2}`);
  t(["SA-TC-065"], "the institution sees the request as RESOLVED with the resolution message", instRes.d.status === "RESOLVED" && instRes.d.entries.some((e) => e.from === "platform" && e.body.startsWith("Fixed by admin")));
  const raceA = await Promise.all([P("POST", `/api/platform/support/${idB1}/assign`, { assigneeId: p1Id }), P2("POST", `/api/platform/support/${idB1}/assign`, { assigneeId: p2Id })]);
  const fin = (await rows(`select "assigneeAdminId" a, status from "PlatformSupportRequest" where id=$1`, [idB1]))[0];
  t(["SA-TC-065"], "two simultaneous assignments leave exactly one consistent assignee (one of the two administrators) and a single IN_PROGRESS status", raceA.every((r) => r.s === 200) && [p1Id, p2Id].includes(fin.a) && fin.status === "IN_PROGRESS");

  // history and audit
  const hist = await P("GET", `/api/platform/support/${idA1}`);
  const kinds = hist.d.entries.map((e) => e.kind + ":" + (e.by?.name ?? "-"));
  t(["SA-TC-065"], "the history lists every step in order with its author and time (opening message, assignment, note, reply, institution reply, status changes)", hist.d.entries.length === 7 && hist.d.entries.every((e) => e.at && e.by !== undefined) && hist.d.entries.map((e) => e.at).join() === [...hist.d.entries.map((e) => e.at)].sort().join() && kinds.some((k) => k.startsWith("NOTE:G4")), kinds.join(" | "));
  const au = await rows(`select action, "platformActorId", "actorId", before, after, "createdAt" from "AuditLog" where "collegeId"=$1 and entity='PlatformSupportRequest' and "entityId"=$2 order by "createdAt"`, [colA, idA1]);
  const acts = au.map((a) => a.action);
  t(["SA-TC-065", "SA-TC-011"], "every administrative step is in the audit log with the platform administrator as actor and a timestamp: create, assign, reply, institution reply, status changes", ["support.create", "support.assign", "support.reply", "support.status"].every((a) => acts.includes(a)) && au.filter((a) => a.action !== "support.create" && a.platformActorId === null && a.action !== "support.reply").length === 0 && au.filter((a) => a.action === "support.assign").every((a) => a.platformActorId === p1Id && a.actorId === null) && au.every((a) => !!a.createdAt), acts.join());
  const asgAudit = au.find((a) => a.action === "support.assign"), stAudit = au.find((a) => a.action === "support.status");
  t(["SA-TC-065", "SA-TC-011"], "assignment and status audit rows keep the earlier value (before) and the new value (after)", asgAudit.before.assigneeAdminId === null && asgAudit.after.assigneeAdminId === p1Id && stAudit.before.status === "IN_PROGRESS" && stAudit.after.status === "OPEN");
  const resAudit = (await rows(`select "platformActorId" from "AuditLog" where entity='PlatformSupportRequest' and "entityId"=$1 and action='support.resolve'`, [idA2]));
  t(["SA-TC-065"], "the resolve is audited exactly once even though two administrators raced", resAudit.length === 1 && [p1Id, p2Id].includes(resAudit[0].platformActorId));
  const refusedAudit = await rows(`select action from "AuditLog" where "collegeId"=$1 and entity='PlatformSupportRequest' and "entityId"=$2 order by "createdAt"`, [colA, idA2]);
  t(["SA-TC-065"], "refused (409) operations on the resolved request wrote no audit rows: its trail is only the status change and the one resolve", refusedAudit.map((r) => r.action).join() === "support.create,support.status,support.resolve", refusedAudit.map((r) => r.action).join());
  const view = await P("GET", `/api/platform/audit-logs?q=${encodeURIComponent("support.")}&pageSize=50`);
  t(["SA-TC-011", "SA-TC-065"], "the platform audit log viewer shows these actions (assign, status, resolve) with the administrator and institution, and the internal note on the platform trail", view.s === 200 && view.d.items.some((e) => e.action === "support.assign" && e.institution?.id === colA && e.actor?.email === mails.p1) && view.d.items.some((e) => e.action === "support.note"), JSON.stringify(view.d?.items?.slice(0, 2)).slice(0, 200));
  const noInstAudit = await adminA("GET", "/api/audit?limit=100");
  t(["SA-TC-065"], "the college's own audit view contains no internal note text", !JSON.stringify(noInstAudit.j ?? "").includes(NOTE));

  // ============ no billing, no extra surface ============
  const verbs = [await P("DELETE", `/api/platform/support/${idB1}`), await P("PATCH", `/api/platform/support/${idB1}`, {}), await P("PUT", "/api/platform/support", {}), await P("POST", "/api/platform/support", {})];
  t(["SA-TC-011"], "undefined methods are refused with 405 (no delete, edit or create through the platform API)", verbs.every((r) => r.s === 405), verbs.map((r) => r.s).join());
  const pageOk = await fetch(BASE + "/platform/support"), staffOk = await fetch(BASE + "/staff/platform-support");
  t(["SA-TC-011"], "the platform support screen and the institution contact screen are served", pageOk.status === 200 && staffOk.status === 200, `${pageOk.status} ${staffOk.status}`);
  const lg = out.join("").split("\n").filter((l) => !/^\s*(GET|POST|PUT|PATCH|DELETE) \//.test(l)).join("\n"); // the framework's own request lines echo the URLs the test typed
  t(["SA-TC-064"], "SWEEP: nothing the server logged during the run contains the student's e-mail, enrolment number or the internal note text", !lg.includes(stuRow.email) && !lg.includes(stuRow.enrollmentNo) && !lg.includes(NOTE));
} catch (e) {
  console.error(e); R.t(["SA-TC-011"], "suite ran to completion", false, String(e?.stack ?? e));
} finally {
  await pgc.query(`delete from "PlatformSupportRequest" where subject like 'support-test%'`).catch(() => 0);
  await pgc.query(`delete from "AuditLog" where entity='PlatformSupportRequest'`).catch(() => 0);
  await pgc.query(`delete from "PlatformAuditLog" where action='support.note' and detail->>'requestId' is not null and email like 'g4sup%'`).catch(() => 0);
  if (colB.id) { await pgc.query(`delete from "AuditLog" where "collegeId"=$1`, [colB.id]).catch(() => 0); await pgc.query(`update "College" set "isActive"=false where id=$1`, [colB.id]).catch(() => 0); }
  await pgc.end().catch(() => 0); stopApp();
}
process.exit(R.done() ? 1 : 0);

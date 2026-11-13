// Gate 3: System Administrator (platform administrator) workstream, SA-TC-013..067. Local stack only; synthetic data.
// Features the Gate 1 audit found missing are probed for existence: an absent endpoint is recorded as FAIL (feature missing), never as a pass.
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { B, client, login, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g3-03-system-admin");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonSb = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
function totp(secret, offset = 0) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
const email = `g3plat${tag}@example.com`, pw = `G3-platform-${tag}-Pw!`;
const created = { colleges: [], auth: [] };
const MISSING = "Feature not built (Gate 1 audit: Missing)";
try {
  // SA-TC-018: creation is script-only. Use the real script, and prove the API offers no way to do it.
  const sc = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_NAME: "G3 Platform", PLATFORM_ADMIN_PASSWORD: pw } });
  R.t(["SA-TC-018"], "create-platform-admin script creates an administrator", sc.status === 0 && /created/.test(sc.stdout), sc.stderr + sc.stdout);
  const short = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: `g3short${tag}@example.com`, PLATFORM_ADMIN_NAME: "x", PLATFORM_ADMIN_PASSWORD: "short" } });
  R.t(["SA-TC-018"], "script refuses a password under 12 characters", short.status !== 0);
  const noApi = [await fetch(B + "/api/platform/admins", { method: "POST" }), await fetch(B + "/api/platform/admin", { method: "POST" })];
  R.t(["SA-TC-018"], "no API route can create a platform administrator (DEC-01: creation is script-only; a verified platform administrator is refused too, tested in g4-09)", noApi.every((r) => r.status === 404 || r.status === 401 || r.status === 403 || r.status === 405), noApi.map((r) => r.status).join(","));
  const uid = (await pgc.query(`select id from "PlatformAdmin" where email=$1`, [email])).rows[0]?.id; created.auth.push(uid);

  // SA-TC-014 invalid login
  const bad = await anonSb().auth.signInWithPassword({ email, password: "wrong-password-123" });
  R.t(["SA-TC-014"], "wrong password is refused by the auth server", !!bad.error && !bad.data.session, bad.error?.message);
  const none = await fetch(B + "/api/platform/me"); R.t(["SA-TC-014"], "no token: /api/platform/me refused", none.status === 401 || none.status === 403, none.status);
  const junk = await fetch(B + "/api/platform/me", { headers: { authorization: "Bearer not.a.token" } }); R.t(["SA-TC-014"], "forged token refused", junk.status === 401 || junk.status === 403, junk.status);

  // SA-TC-015 MFA is forced before any platform action
  const plat = client(await login(email, pw));
  const me0 = await plat("GET", "/api/platform/me");
  R.t(["SA-TC-015", "SA-TC-020"], "password-only session: /me reports MFA setup required", me0.d?.mfa === "setup_required", JSON.stringify(me0.j));
  const l0 = await plat("GET", "/api/platform/institutions");
  R.t(["SA-TC-015"], "without MFA the institution list is refused (MFA_SETUP_REQUIRED)", l0.s === 403 && l0.code === "MFA_SETUP_REQUIRED", JSON.stringify(l0.j));
  const p0 = await plat("POST", "/api/platform/institutions", { name: "Sneaky", admin: { name: "S", email: "s@example.com" } });
  R.t(["SA-TC-015"], "without MFA provisioning is refused", p0.s === 403 && p0.code === "MFA_SETUP_REQUIRED", JSON.stringify(p0.j));
  // SA-TC-016 verification and limits
  const enr = await plat("POST", "/api/platform/mfa/enroll"); R.t(["SA-TC-016"], "enrolment returns a secret", enr.s === 200 && !!enr.d?.secret, JSON.stringify(enr.j).slice(0, 150));
  const wrong = await plat("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: "000000" });
  R.t(["SA-TC-016"], "wrong code rejected (INVALID_CODE)", wrong.s === 400 && wrong.code === "INVALID_CODE", JSON.stringify(wrong.j));
  R.t(["SA-TC-016"], "malformed code refused", (await plat("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: "12" })).s === 400);
  R.t(["SA-TC-016"], "unknown factor id refused", (await plat("POST", "/api/platform/mfa/verify", { factorId: crypto.randomUUID(), code: "123456" })).s === 400);
  const ok = await plat("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) });
  R.t(["SA-TC-016", "SA-TC-013"], "correct code completes enrolment and upgrades the session", ok.s === 200 && !!ok.d?.access_token, JSON.stringify(ok.j).slice(0, 150));
  const P = client(ok.d.access_token);
  // SA-TC-013 /me fields
  const me = await P("GET", "/api/platform/me");
  R.t(["SA-TC-013", "SA-TC-020"], "/me returns only email, name and MFA state", me.s === 200 && Object.keys(me.d).every((k) => ["email", "name", "mfa", "id"].includes(k)), JSON.stringify(me.j));
  const aal1 = client(await login(email, pw));
  R.t(["SA-TC-013", "SA-TC-015"], "a fresh password-only sign-in is refused (MFA_REQUIRED)", (await aal1("GET", "/api/platform/institutions")).code === "MFA_REQUIRED");
  const fid = (await sb.auth.admin.mfa.listFactors({ userId: uid })).data.factors[0].id;
  const ch = await aal1("POST", "/api/platform/mfa/verify", { factorId: fid, code: totp(enr.d.secret, 1) });
  R.t(["SA-TC-013", "SA-TC-016"], "second step with a valid code grants platform access", ch.s === 200 && (await client(ch.d.access_token)("GET", "/api/platform/institutions")).s === 200, JSON.stringify(ch.j).slice(0, 150));

  // SA-TC-021..024, 032 institutions
  const list = await P("GET", "/api/platform/institutions");
  R.t(["SA-TC-021"], "institution list returns a page of id, name, slug, status and counts, with total and page info", list.s === 200 && Array.isArray(list.d?.items) && list.d.items[0] && "isActive" in list.d.items[0] && "_count" in list.d.items[0] && typeof list.d.total === "number", JSON.stringify(list.j).slice(0, 200));
  R.t(["SA-TC-032"], "list contains counts only, no college records", !/email|phone|enrollment|cgpa/i.test(JSON.stringify(list.d)), "");
  const body = { name: `G3 Provisioned ${tag}`, slug: `g3-prov-${tag}`, admin: { name: "G3 Admin", email: `g3admin${tag}@example.com` }, departments: [{ code: "CSE", name: "Computer Science" }], academicYear: { name: "2026-27", startDate: "2026-06-01", endDate: "2027-05-31" }, modules: ["ONBOARDING", "DRIVES"] };
  const prov = await P("POST", "/api/platform/institutions", body);
  R.t(["SA-TC-022"], "register an institution with its first administrator", prov.s === 200 || prov.s === 201, JSON.stringify(prov.j).slice(0, 250));
  const cid = (await pgc.query(`select id from "College" where slug=$1`, [body.slug])).rows[0]?.id; if (cid) created.colleges.push(cid);
  if (cid) {
    const au = (await pgc.query(`select action,"platformActorId","actorId" from "AuditLog" where "collegeId"=$1 and action='institution.provision'`, [cid])).rows[0];
    R.t(["SA-TC-031", "SA-TC-022"], "provisioning is audited with the platform actor (no college user)", au?.platformActorId === uid && au.actorId === null, JSON.stringify(au));
    R.t(["SA-TC-022"], "first administrator and department exist", (await pgc.query(`select count(*)::int n from "User" where "collegeId"=$1 and role='TPO_ADMIN'`, [cid])).rows[0].n === 1 && (await pgc.query(`select count(*)::int n from "Department" where "collegeId"=$1`, [cid])).rows[0].n === 1);
    R.t(["SA-TC-023"], "duplicate slug refused", (await P("POST", "/api/platform/institutions", { ...body, admin: { name: "Dee", email: `g3dee${tag}@example.com` } })).s === 409);
    // SA-TC-045 duplicate NAME rules are tested in g3-05-institution-registry.mjs
    const dupMail = await P("POST", "/api/platform/institutions", { ...body, slug: `g3-prov3-${tag}`, name: `G3 Other ${tag}` });
    R.t(["SA-TC-023"], "duplicate admin email refused", dupMail.s === 409 || dupMail.s === 400, `HTTP ${dupMail.s} ${JSON.stringify(dupMail.j).slice(0, 200)}`);
    const d3 = (await pgc.query(`select id from "College" where slug=$1`, [`g3-prov3-${tag}`])).rows[0]?.id; if (d3) created.colleges.push(d3);
    // 024 validation
    for (const [n, b] of [["missing admin", { name: "x" }], ["bad slug", { ...body, slug: "Bad Slug!" }], ["bad email", { ...body, slug: `g3v${tag}`, admin: { name: "A", email: "nope" } }]]) R.t(["SA-TC-024"], `validation: ${n} refused`, (await P("POST", "/api/platform/institutions", b)).s === 400);
    // 026/027/028 suspend and reactivate
    const off = await P("PATCH", `/api/platform/institutions/${cid}`, { isActive: false });
    R.t(["SA-TC-026"], "deactivate institution", off.s === 200 && off.d?.isActive === false, JSON.stringify(off.j));
    const a1 = (await pgc.query(`select action from "AuditLog" where "collegeId"=$1 and action='institution.deactivate'`, [cid])).rows;
    R.t(["SA-TC-026", "SA-TC-031"], "deactivation is audited", a1.length === 1);
    const on = await P("PATCH", `/api/platform/institutions/${cid}`, { isActive: true });
    R.t(["SA-TC-026"], "activate institution", on.s === 200 && on.d?.isActive === true);
    R.t(["SA-TC-026"], "unknown institution id gives 404", (await P("PATCH", `/api/platform/institutions/${crypto.randomUUID()}`, { isActive: false })).s === 404);
    R.t(["SA-TC-026"], "non-boolean status refused", (await P("PATCH", `/api/platform/institutions/${cid}`, { isActive: "no" })).s === 400);
    // rollback (025): a failing provisioning must leave nothing behind
    const before = (await pgc.query(`select count(*)::int n from "College"`)).rows[0].n;
    await P("POST", "/api/platform/institutions", { ...body, slug: `g3-rb-${tag}`, name: `G3 RB ${tag}`, admin: { name: "A", email: `g3admin${tag}@example.com` } });
    R.t(["SA-TC-025"], "a failed provisioning leaves no half-created institution", (await pgc.query(`select count(*)::int n from "College"`)).rows[0].n === before && (await pgc.query(`select count(*)::int n from "College" where slug=$1`, [`g3-rb-${tag}`])).rows[0].n === 0);
  }
  // SA-TC-035 matrix on platform routes (negative direction for every non-platform identity)
  const colAdmin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
  const routes = [["GET", "/api/platform/me"], ["GET", "/api/platform/institutions"], ["POST", "/api/platform/institutions"], ["PATCH", `/api/platform/institutions/${crypto.randomUUID()}`], ["POST", "/api/platform/mfa/enroll"], ["DELETE", "/api/platform/mfa"]];
  const badOnes = [];
  for (const [m, p] of routes) { const a = await fetch(B + p, { method: m, headers: { "content-type": "application/json" }, body: m === "GET" ? undefined : "{}" }); if (![401, 403].includes(a.status)) badOnes.push(`anon ${m} ${p} ${a.status}`); const t = await colAdmin(m, p, m === "GET" ? undefined : {}); if (![401, 403].includes(t.s)) badOnes.push(`TPO ${m} ${p} ${t.s}`); }
  R.t(["SA-TC-035", "SA-TC-037"], "anonymous and college administrator refused on all platform routes", badOnes.length === 0, badOnes.join("; "));
  // Not testable here, recorded honestly
  // SA-TC-025, 030, 033 and 034 were Blocked here for want of a harness; Gate 4 WP-01 built it and tests them in g4-10-platform-harness.mjs.
  R.blocked(["SA-TC-038", "SA-TC-039", "SA-TC-040"], "/platform page states, create/suspend flow, accessibility", "Browser (Playwright) run not built in this pass; the page is a client of the APIs tested above");

  // Missing features: probe for any plausible endpoint; none exists in the code base => FAIL as expected
  const probe = async (paths) => { const out = []; for (const p of paths) { const r = await P("GET", p); out.push(`${p}:${r.s}`); if (r.s === 200) return { found: true, out }; } return { found: false, out }; };
  const missing = [
    // SA-TC-043, 044, 046: built in Gate 4 and tested in g4-07-institution-admin.mjs (the "missing" probes were retired).
    [["SA-TC-047", "SA-TC-048", "SA-TC-049", "SA-TC-050", "SA-TC-051", "SA-TC-009"], "platform analytics", ["/api/platform/analytics", "/api/platform/stats", "/api/platform/overview"]],
    [["SA-TC-052", "SA-TC-053"], "platform audit-log viewer", ["/api/platform/audit-logs", "/api/platform/audit"]],
    [["SA-TC-058", "SA-TC-059", "SA-TC-060", "SA-TC-061", "SA-TC-062", "SA-TC-006"], "AI configuration and usage", ["/api/platform/ai", "/api/platform/ai-config", "/api/platform/settings/ai"]],
    // SA-TC-011, 063, 064, 065: built in Gate 4 and tested in g4-06-platform-support.mjs (the "missing" probe was retired).
    // SA-TC-004, 007, 010, 012, 067: built under the approved A-18 scope and tested in g4-09-platform-governance.mjs (the "missing" probe was retired).
  ];
  for (const [ids, name, paths, extra] of missing) {
    const r = paths.length ? await probe(paths) : { found: false, out: ["no endpoint exists"] };
    const works = r.found && (!extra || (await extra()));
    R.t(ids, `System Administrator: ${name} exists and works`, works, r.found ? `Endpoint exists but does not do the job: the list ignores the q/sort/limit parameters (returns all institutions). Probed ${r.out.join(", ")}` : `${MISSING}. Probed ${r.out.join(", ")}`, works ? "" : r.found ? "SA-PARTIAL" : "SA-MISSING");
  }
  R.t(["SA-TC-066"], "subscriptions and billing are documented as future scope (not built, no endpoint)", [await fetch(B + "/api/platform/billing"), await fetch(B + "/api/platform/subscriptions")].every((r) => r.status === 404 || r.status === 401), "documented in test plan section 7");
  // SA-TC-017 MFA removal
  R.t(["SA-TC-017"], "MFA removal with a wrong code refused", (await P("DELETE", "/api/platform/mfa", { code: "000000" })).code === "INVALID_CODE");
  R.t(["SA-TC-017"], "MFA removal from a password-only session refused", (await aal1("DELETE", "/api/platform/mfa", { code: totp(enr.d.secret, 1) })).s === 403);
  // SA-TC-019 recovery script
  const rec = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/platform-mfa-recovery.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: email, PLATFORM_RECOVERY_CONFIRM: email } });
  R.t(["SA-TC-019"], "recovery script removes the authenticator with matching confirmation", rec.status === 0 && (await sb.auth.admin.mfa.listFactors({ userId: uid })).data.factors.length === 0, rec.stderr);
  const rec2 = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/platform-mfa-recovery.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: email, PLATFORM_RECOVERY_CONFIRM: "other@x.com" } });
  R.t(["SA-TC-019"], "recovery script refused without the matching confirmation", rec2.status !== 0);
  R.t(["SA-TC-031"], "MFA enrolment/removal/recovery are in the platform audit trail", (await pgc.query(`select count(*)::int n from "PlatformAuditLog" where "adminId"=$1`, [uid])).rows[0].n >= 3);

} finally {
  for (const c of created.colleges) { await pgc.query(`delete from "AuditLog" where "collegeId"=$1`, [c]).catch(() => 0); }
  await pgc.query(`update "College" set "isActive"=true where slug like 'g3-prov%'`);
  await pgc.end();
}
process.exit(R.done() ? 1 : 0);

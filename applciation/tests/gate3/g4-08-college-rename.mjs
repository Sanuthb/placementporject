// Gate 4: an institution renaming itself (PATCH /api/settings/college) follows the same name-uniqueness rule as registration and platform editing.
// Own dev-server instance on port 3120, local Docker stack only, synthetic data. Cases are recorded under SA-TC-044 and SA-TC-045 (name rules) and M02-TC-001 (institution settings).
import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { client, login, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g4-08-college-rename");
const ID = ["SA-TC-044", "SA-TC-045"];
const t = (n, ok, x = "") => R.t(ID, n, ok, x, "");
const PORT = 3120, BASE = `http://localhost:${PORT}`, WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function totp(secret) { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0"); const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0"); }
const app = spawn(WIN ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], { env: { ...process.env, PORT: String(PORT), RATE_LIMIT_DISABLED: "true", FLOOD_MAX_PER_MINUTE: "100000", APP_URL: BASE, REQUIRE_LOCAL_DB: "true" }, detached: !WIN, stdio: "ignore", shell: WIN, windowsHide: true });
const stopApp = () => { try { if (WIN) spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-app.pid); } catch { /* gone */ } };
process.on("exit", stopApp);
const wait = async (path, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if ((await fetch(BASE + path)).ok) return true; } catch { /* starting */ } await sleep(900); } return false; };
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pw = `G4-ren-${tag}-Pw!`, pe = `g4ren${tag}@example.com`;
const created = [];
try {
  t("the instance under test starts", await wait("/api/health/live"));
  const r = spawnSync(WIN ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: WIN, env: { ...process.env, PLATFORM_ADMIN_EMAIL: pe, PLATFORM_ADMIN_NAME: "G4 Rename Admin", PLATFORM_ADMIN_PASSWORD: pw } }); if (r.status !== 0) throw new Error(r.stderr);
  const c0 = client(await login(pe, pw), BASE); const enr = await c0("POST", "/api/platform/mfa/enroll");
  const P = client((await c0("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token, BASE);
  const prov = async (name, slug, email) => { await P("POST", "/api/platform/institutions", { name, slug, admin: { name: "Admin " + slug, email } }); const id = (await rows(`select id from "College" where slug=$1`, [slug]))[0].id; created.push(id); const u = (await rows(`select id from "User" where email=$1`, [email]))[0]; await sb.auth.admin.updateUserById(u.id, { password: pw, email_confirm: true }); return { id, tok: client(await login(email, pw), BASE) }; };
  const NB = `G4 Ren Bravo ${tag}`, NC = `G4 Ren Charlie ${tag}`, ND = `G4 Ren Delta, Inc. ${tag}`;
  const B = await prov(NB, `g4-ren-b-${tag}`, `g4renb${tag}@example.com`), C = await prov(NC, `g4-ren-c-${tag}`, `g4renc${tag}@example.com`), D = await prov(ND, `g4-ren-d-${tag}`, `g4rend${tag}@example.com`);
  const name = async (id) => (await rows(`select name from "College" where id=$1`, [id]))[0].name;
  const audits = async (id) => rows(`select before, after, "actorId" from "AuditLog" where "collegeId"=$1 and action='college.update' order by "createdAt"`, [id]);
  const ren = (who, n, extra = {}) => who.tok("PATCH", "/api/settings/college", { name: n, ...extra });

  // normal
  const n1 = await ren(B, `  G4 Ren   Bravo  Renamed ${tag} `);
  t("normal rename: 200, stored with spaces trimmed and collapsed, returned, and the institution's own settings show it", n1.s === 200 && await name(B.id) === `G4 Ren Bravo Renamed ${tag}` && n1.d.name === `G4 Ren Bravo Renamed ${tag}` && (await B.tok("GET", "/api/settings/college")).d.name === `G4 Ren Bravo Renamed ${tag}`, JSON.stringify(n1.j).slice(0, 150));
  const a1 = await audits(B.id);
  t("the rename is audited with the old name (before) and the new name (after), by the institution's own administrator", a1.length === 1 && a1[0].before.name === NB && a1[0].after.name === `G4 Ren Bravo Renamed ${tag}` && !!a1[0].actorId, JSON.stringify(a1[0]));
  t("a platform administrator sees the new name in the institution list and detail", (await P("GET", `/api/platform/institutions/${B.id}`)).d.name === `G4 Ren Bravo Renamed ${tag}`);
  // keep own name / case-only / whitespace-only
  const cur = await name(B.id);
  t("keeping the institution's own current name is allowed (200, not a duplicate of itself)", (await ren(B, cur)).s === 200 && await name(B.id) === cur);
  const co = await ren(B, cur.toUpperCase());
  t("changing only the letter case of its own name is allowed, and the new case is stored", co.s === 200 && await name(B.id) === cur.toUpperCase());
  const ws = await ren(B, `   ${cur.toLowerCase().replace(/ /g, "    ")}\t `);
  t("changing only the whitespace of its own name is allowed and is stored normalised (single spaces, trimmed)", ws.s === 200 && await name(B.id) === cur.toLowerCase(), await name(B.id));
  await ren(B, cur);
  // duplicates
  const before = JSON.stringify(await rows(`select name, "updatedAt" from "College" where id=$1`, [B.id])), aN = (await audits(B.id)).length;
  const dups = [["exact", NC], ["other case", NC.toUpperCase()], ["lower case", NC.toLowerCase()], ["leading/trailing spaces", `   ${NC}   `], ["repeated spaces", NC.replace(/ /g, "   ")], ["tabs and spaces", NC.replace(/ /g, " \t ")]];
  const bad = []; for (const [k, v] of dups) { const x = await ren(B, v); if (!(x.s === 409 && x.code === "DUPLICATE_INSTITUTION")) bad.push(`${k}:${x.s}`); }
  t("another institution's name is refused with 409 DUPLICATE_INSTITUTION in every spelling: exact, any case, padded, repeated spaces, tabs", bad.length === 0, bad.join(","));
  t("a refused rename changes nothing (name, updatedAt) and writes no audit row", JSON.stringify(await rows(`select name, "updatedAt" from "College" where id=$1`, [B.id])) === before && (await audits(B.id)).length === aN);
  const dx = await ren(B, NC);
  t("the conflict response is clear: a plain message that names no other institution's details", /already registered/i.test(dx.j?.error?.message ?? "") && !JSON.stringify(dx.j).includes(C.id) && !JSON.stringify(dx.j).includes(`g4renc${tag}`));
  await P("PATCH", `/api/platform/institutions/${C.id}`, { isActive: false });
  const susp = await ren(B, NC);
  t("a suspended institution still owns its name: renaming to it is refused", susp.s === 409 && susp.code === "DUPLICATE_INSTITUTION");
  await P("PATCH", `/api/platform/institutions/${C.id}`, { isActive: true });
  // punctuation significance
  const p1 = await ren(B, ND.replace(", Inc.", " Inc")), p2 = await ren(B, `G4 Ren St. Joseph ${tag}`), p3 = await ren(C, `G4 Ren St Joseph ${tag}`), p4 = await ren(B, ND);
  t("punctuation is significant: 'Delta, Inc.' is not 'Delta Inc', and 'St. Joseph' is not 'St Joseph' (allowed), while the exact punctuated name is still refused", p1.s === 200 && p2.s === 200 && p3.s === 200 && p4.s === 409, [p1.s, p2.s, p3.s, p4.s].join());
  await ren(B, cur); await ren(C, NC);
  // validation and other fields
  const v = [await ren(B, "x"), await ren(B, "   "), await ren(B, "a".repeat(201)), await B.tok("PATCH", "/api/settings/college", { name: 123 })];
  t("invalid names are refused with 400 (one character, only spaces, 201 characters, wrong type) and change nothing", v.every((x) => x.s === 400) && await name(B.id) === cur, v.map((x) => x.s).join());
  const colr = await B.tok("PATCH", "/api/settings/college", { brandColor: "#0a0b0c" });
  t("existing behaviour is kept: a colour-only change still works, and does not run the name check or touch the name", colr.s === 200 && (await rows(`select "brandColor" c from "College" where id=$1`, [B.id]))[0].c === "#0a0b0c" && await name(B.id) === cur);
  const own = await B.tok("PATCH", "/api/settings/college", { name: cur, logoUrl: null, brandColor: null });
  t("a combined change (name kept, colour and logo cleared) works", own.s === 200 && (await rows(`select "brandColor" c, "logoUrl" l from "College" where id=$1`, [B.id]))[0].c === null);
  // roles and isolation
  const anon = await fetch(BASE + "/api/settings/college", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Anonymous Rename Attempt" }) });
  const po = await sb.auth.admin.createUser({ email: `g4renpo${tag}@example.com`, password: pw, email_confirm: true });
  await rows(`insert into "User"(id,"collegeId",email,name,role,"updatedAt") values ($1,$2,$3,'Officer','PLACEMENT_OFFICER',now())`, [po.data.user.id, B.id, `g4renpo${tag}@example.com`]).catch(() => rows(`insert into "User"(id,"collegeId",email,name,role) values ($1,$2,$3,'Officer','PLACEMENT_OFFICER')`, [po.data.user.id, B.id, `g4renpo${tag}@example.com`]));
  const off = client(await login(`g4renpo${tag}@example.com`, pw), BASE);
  t("only the institution's Head TPO can rename: anonymous 401, placement officer 403, and nothing changed", anon.status === 401 && (await off("PATCH", "/api/settings/college", { name: "Officer Rename Attempt" })).s === 403 && await name(B.id) === cur);
  t("a rename affects only the caller's own institution (C and D unchanged)", await name(C.id) === NC && await name(D.id) === ND);

  // concurrency
  const X = `G4 Ren Race ${tag}`;
  const r1 = await Promise.all([ren(B, X), ren(C, X.toLowerCase())]);
  const holders = await rows(`select id, name from "College" where lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = $1`, [X.toLowerCase()]);
  t("two institutions renaming to the same name at the same moment: exactly one wins (200), the other gets 409 DUPLICATE_INSTITUTION, and one institution holds the name", r1.map((x) => x.s).sort().join() === "200,409" && holders.length === 1 && r1.find((x) => x.s === 409).code === "DUPLICATE_INSTITUTION", r1.map((x) => x.s).join());
  const loser = r1[0].s === 409 ? B : C, winner = loser === B ? C : B;
  t("the loser keeps its previous name and has no audit row for the failed attempt", await name(loser.id) === (loser === B ? cur : NC) && (await audits(loser.id)).every((a) => a.after.name !== X && a.after.name !== X.toLowerCase()));
  await ren(winner, winner === B ? cur : NC);
  const Y = `G4 Ren Race Two ${tag}`;
  const r2 = await Promise.all([ren(B, Y), P("PATCH", `/api/platform/institutions/${C.id}`, { name: Y.toUpperCase() })]);
  t("a rename by the institution racing a rename by a platform administrator to the same name: one 200 and one 409, one holder", r2.map((x) => x.s).sort().join() === "200,409" && (await rows(`select count(*)::int n from "College" where lower(name)=lower($1)`, [Y]))[0].n === 1, r2.map((x) => x.s).join());
  await ren(B, cur); await P("PATCH", `/api/platform/institutions/${C.id}`, { name: NC });
  const Z = `G4 Ren Race Three ${tag}`;
  const r3 = await Promise.all([ren(B, Z), P("POST", "/api/platform/institutions", { name: Z.toUpperCase(), slug: `g4-ren-z-${tag}`, admin: { name: "Zed", email: `g4renz${tag}@example.com` } })]);
  const zid = (await rows(`select id from "College" where slug=$1`, [`g4-ren-z-${tag}`]))[0]?.id; if (zid) created.push(zid);
  t("a rename racing a new registration of the same name: exactly one institution holds the name", (await rows(`select count(*)::int n from "College" where lower(name)=lower($1)`, [Z]))[0].n === 1 && r3.some((x) => x.s === 200) && r3.some((x) => x.s === 409), r3.map((x) => x.s).join());
  const many = await Promise.all([ren(B, `G4 Ren Many ${tag}`), ren(C, `g4 ren many ${tag}`), ren(D, `G4  REN  MANY ${tag}`), ren(B, `G4 Ren Many ${tag} `), ren(C, ` G4 Ren Many ${tag}`)]);
  t("five simultaneous renames from three institutions to one name: never more than one institution holds it, every response is 200 or 409, no server error", (await rows(`select count(*)::int n from "College" where lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = $1`, [`g4 ren many ${tag}`]))[0].n === 1 && many.every((x) => x.s === 200 || x.s === 409), many.map((x) => x.s).join());
  const dupNames = await rows(`select lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) k, count(*)::int n from "College" where name ilike $1 group by 1 having count(*) > 1`, [`%${tag}%`]);
  t("at the end of all attempts no two test institutions share a normalised name", dupNames.length === 0, JSON.stringify(dupNames));
} catch (e) { console.error(e); R.t(ID, "suite ran to completion", false, String(e?.stack ?? e), ""); }
finally {
  for (const c of created) { await pgc.query(`delete from "AuditLog" where "collegeId"=$1`, [c]).catch(() => 0); await pgc.query(`update "College" set "isActive"=false where id=$1`, [c]).catch(() => 0); }
  await pgc.end().catch(() => 0); stopApp();
}
process.exit(R.done() ? 1 : 0);

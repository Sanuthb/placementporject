// Gate 4 Phase 3 regression: duplicate institution registration (SA-TC-045) and institution list search / sort / paging (SA-TC-041, -042).
// Local stack only. Synthetic data. Bulk rows are inserted by SQL (130+ institutions) to exercise large result sets; they are removed at the end.
import { createHmac, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { B, client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g3-05-institution-registry");
const t = (ids, name, ok, extra = "") => R.t(ids, name, ok, extra, ids.includes("SA-TC-045") ? "SA-45" : ids.includes("SA-TC-041") || ids.includes("SA-TC-042") ? "SA-PARTIAL" : "");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
function totp(secret) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
const rows = async (sql, p = []) => (await pgc.query(sql, p)).rows;
const DUP = ["SA-TC-045", "SA-TC-023"], SRCH = ["SA-TC-041"], FILT = ["SA-TC-042"], ACC = ["SA-TC-035", "SA-TC-037"];
const email = `g3reg${tag}@example.com`, pw = `G3-registry-${tag}-Pw!`;
const bulkIds = [], mkEmail = (n) => `g3reg${tag}x${n}@example.com`;
let admins = 0;
try {
  const sc = spawnSync("npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", env: { ...process.env, PLATFORM_ADMIN_EMAIL: email, PLATFORM_ADMIN_NAME: "G3 Registry", PLATFORM_ADMIN_PASSWORD: pw } });
  if (sc.status !== 0) throw new Error("admin script: " + sc.stderr);
  const p1 = client(await login(email, pw)); const enr = await p1("POST", "/api/platform/mfa/enroll");
  const P = client((await p1("POST", "/api/platform/mfa/verify", { factorId: enr.d.factorId, code: totp(enr.d.secret) })).d.access_token);
  const aal1 = client(await login(email, pw));
  const reg = (name, over = {}) => P("POST", "/api/platform/institutions", { name, ...over, admin: { name: "Reg Admin", email: over.adminEmail ?? mkEmail(++admins) }, ...(over.adminEmail ? { admin: { name: "Reg Admin", email: over.adminEmail } } : {}) });
  const resetLimits = () => rows(`delete from "RateLimitBucket"`);
  const countColleges = async () => (await rows(`select count(*)::int n from "College"`))[0].n;
  const authCount = async () => (await sb.auth.admin.listUsers({ perPage: 1000 })).data.users.length;

  // ================= duplicate registration =================
  const base = `Registry Test Institute ${tag}`;
  const first = await reg(base);
  t(DUP, "first registration of a name succeeds", first.s === 200, JSON.stringify(first.j).slice(0, 200));
  const stored = (await rows(`select name from "College" where id=$1`, [first.d?.college?.id]))[0]?.name;
  t(DUP, "stored name is the cleaned name", stored === base, stored);
  await resetLimits(); const c0 = await countColleges(), a0 = await authCount();
  const variants = [["exact repeat", base], ["upper case", base.toUpperCase()], ["lower case", base.toLowerCase()], ["leading/trailing spaces", `   ${base}   `], ["internal extra spaces", base.replace(/ /g, "    ")], ["tabs and newline", base.replace(/ /, "\t").replace(/ /, "\n")], ["mixed case + spaces", `  rEgIsTrY   test INSTITUTE ${tag} `]];
  for (const [label, name] of variants) {
    const r = await reg(name);
    t(DUP, `duplicate refused: ${label}`, r.s === 409 && r.code === "DUPLICATE_INSTITUTION", `HTTP ${r.s} ${r.code}`);
  }
  const msg = JSON.stringify(((j) => ({ ...j, error: { ...j.error, requestId: undefined } }))((await reg(base)).j));
  t(DUP, "refusal message is clear and exposes no ids, SQL or database details", /already registered/.test(msg) && !/[0-9a-f]{8}-[0-9a-f]{4}-|prisma|constraint|SELECT|"College"|stack/i.test(msg), msg.slice(0, 200));
  t(DUP, "refused attempts created nothing: no college, no invited login", (await countColleges()) === c0 && (await authCount()) === a0, `${c0}->${await countColleges()} / ${a0}->${await authCount()}`);
  t(DUP, "the original institution is untouched", (await rows(`select name,"isActive" from "College" where id=$1`, [first.d.college.id]))[0].name === base);
  const other = await reg(`${base} Two`);
  t(DUP, "a genuinely different name is accepted", other.s === 200, JSON.stringify(other.j).slice(0, 200));
  const punct = await reg(`Registry-Test Institute ${tag}`, { slug: `punct-${tag}` });
  t(DUP, "a name differing by punctuation is accepted (documented: exact match after trim, space collapse and case only)", punct.s === 200, `HTTP ${punct.s}`);
  // inactive institution still owns its name
  await P("PATCH", `/api/platform/institutions/${first.d.college.id}`, { isActive: false });
  t(DUP, "duplicate of a SUSPENDED institution is still refused", (await reg(base.toUpperCase())).s === 409);
  await P("PATCH", `/api/platform/institutions/${first.d.college.id}`, { isActive: true });
  // legacy row saved before this rule, with untidy whitespace
  const legacyId = (await rows(`insert into "College" (id,name,slug,"updatedAt") values (gen_random_uuid(),$1,$2,now()) returning id`, [`  Legacy   Mess ${tag}  `, `legacy-mess-${tag}`]))[0].id; bulkIds.push(legacyId);
  t(DUP, "a clean name is refused against an untidy legacy row", (await reg(`legacy mess ${tag}`)).s === 409);
  // slug conflict still refused cleanly
  const slugDup = await reg(`Slug Dup ${tag}`, { slug: first.d.college.slug });
  t(DUP, "duplicate slug refused with 409, not a server error", slugDup.s === 409, `HTTP ${slugDup.s} ${JSON.stringify(slugDup.j).slice(0, 120)}`);
  // concurrency: same name, 8 simultaneous requests (different admin emails and slugs, case variants)
  await resetLimits(); const cname = `Concurrent Institute ${tag}`;
  const cc0 = await countColleges(); const aBurst = await authCount();
  const burst = await Promise.all(Array.from({ length: 8 }, (_, i) => reg(i % 2 ? cname.toUpperCase() : ` ${cname} `, { slug: `conc-${tag}-${i}` })));
  const ok = burst.filter((r) => r.s === 200), dup = burst.filter((r) => r.s === 409);
  t(DUP, "concurrent duplicate registration: exactly one succeeds", ok.length === 1 && dup.length === 7, burst.map((r) => r.s).join(","));
  t(DUP, "concurrent duplicate registration: exactly one institution row exists for the name", (await rows(`select count(*)::int n from "College" where lower(regexp_replace(btrim(name),'\\s+',' ','g'))=$1`, [cname.toLowerCase()]))[0].n === 1 && (await countColleges()) === cc0 + 1);
  t(DUP, "concurrent losers get a clean error, never a 500", burst.every((r) => r.s !== 500));
  { const immediate = await authCount(); let settled = immediate; for (let i = 0; i < 10 && settled !== aBurst + 1; i++) { await new Promise((r) => setTimeout(r, 500)); settled = await authCount(); }
    t(DUP, "after the burst only the winner has an invited login: losers' logins were removed", settled === aBurst + 1, `before ${aBurst}, right after ${immediate}, settled ${settled}`); }
  await resetLimits(); const sname = `Same Slug ${tag}`; const sb2 = await Promise.all([reg(`${sname} A`, { slug: `shared-slug-${tag}` }), reg(`${sname} B`, { slug: `shared-slug-${tag}` })]);
  t(DUP, "concurrent same-slug registrations: one succeeds, the other is refused with 409", sb2.filter((r) => r.s === 200).length === 1 && sb2.filter((r) => r.s === 409).length === 1, sb2.map((r) => r.s).join(","));

  // ================= list: bulk data =================
  await rows(`insert into "College" (id,name,slug,"isActive","createdAt","updatedAt") select gen_random_uuid(), 'Bulk ' || $1 || ' ' || lpad(g::text,3,'0') || case when g % 7 = 0 then ' 50%_off' else '' end, 'bulk-' || $1 || '-' || g, (g % 4 <> 0), now() - (g || ' hours')::interval, now() from generate_series(1,130) g`, [tag]);
  const bulk = await rows(`select id from "College" where slug like $1`, [`bulk-${tag}-%`]); bulk.forEach((r) => bulkIds.push(r.id));
  // administrators with searchable emails and varied counts
  const some = bulk.slice(0, 5);
  for (const [i, b] of some.entries()) for (let k = 0; k <= i; k++) await rows(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values (gen_random_uuid(),$1,$2,'Bulk Admin','TPO_ADMIN','{}',now())`, [b.id, `bulkadmin${tag}${i}${k}@example.org`]);
  const total = (await rows(`select count(*)::int n from "College"`))[0].n;
  const L = (qs) => P("GET", "/api/platform/institutions" + (qs ? "?" + qs : ""));
  const idsOf = (r) => r.d.items.map((x) => x.id);

  const d = await L("");
  t(SRCH.concat(FILT), "default list: shape, defaults and accurate totals", d.s === 200 && d.d.page === 1 && d.d.pageSize === 20 && d.d.total === total && d.d.totalPages === Math.ceil(total / 20) && d.d.items.length === 20, JSON.stringify({ ...d.d, items: d.d?.items?.length }));
  t(["SA-TC-032"], "list items carry only id, name, slug, status, date and counts (no college records, no emails)", d.d.items.every((x) => Object.keys(x).sort().join() === "_count,createdAt,id,isActive,name,slug") && !/@/.test(JSON.stringify(d.d)), Object.keys(d.d.items[0]).join());
  // search
  const s1 = await L(`q=${encodeURIComponent("bulk " + tag + " 005")}`); t(SRCH, "search by part of the name (case-insensitive)", s1.d.total === 1 && s1.d.items[0].name.includes("005"), `total ${s1.d?.total}`);
  const s1u = await L(`q=${encodeURIComponent(("BULK " + tag + " 005").toUpperCase())}`); t(SRCH, "search is case-insensitive", s1u.d.total === 1);
  const s2 = await L(`q=${encodeURIComponent(`bulk-${tag}-17`)}&pageSize=100`); t(SRCH, "search by slug", s2.d.total === (await rows(`select count(*)::int n from "College" where slug ilike $1`, [`%bulk-${tag}-17%`]))[0].n && s2.d.total >= 1, `total ${s2.d?.total}`);
  const s3 = await L(`q=${encodeURIComponent(`bulkadmin${tag}3`)}`); t(SRCH, "search by administrator email finds the institution but never returns the email", s3.d.total === 1 && !/bulkadmin/.test(JSON.stringify(s3.d)), `total ${s3.d?.total}`);
  const s4 = await L(`q=${encodeURIComponent(`zzz-no-such-${tag}`)}`); t(SRCH, "no match: 200 with empty items, total 0, one page", s4.s === 200 && s4.d.items.length === 0 && s4.d.total === 0 && s4.d.totalPages === 1, JSON.stringify(s4.d));
  const pct = await L(`q=${encodeURIComponent("50%_off")}&pageSize=100`); const pctDb = (await rows(`select count(*)::int n from "College" where name like $1 escape '\\'`, [`%50\\%\\_off%`]))[0].n;
  t(SRCH, "special characters % and _ are matched literally, not as wildcards", pct.d.total === pctDb && pct.d.total > 0, `api ${pct.d?.total} db ${pctDb}`);
  const wild = await L(`q=${encodeURIComponent("%")}`); t(SRCH, "a lone % does not match everything", wild.d.total === (await rows(`select count(*)::int n from "College" where position('%' in name) > 0 or position('%' in slug) > 0`))[0].n, `total ${wild.d?.total}`);
  for (const evil of ["' OR '1'='1", "'; DROP TABLE \"College\"; --", "\" OR \"\"=\"", "\\", "<script>alert(1)</script>", "%00", "../../etc", "日本語", "😀"]) { const r = await L(`q=${encodeURIComponent(evil)}`); t(SRCH, `hostile search text handled: ${JSON.stringify(evil).slice(0, 30)}`, r.s === 200 && r.d.total === 0, `HTTP ${r.s} total ${r.d?.total}`); }
  t(SRCH, "the College table survived the injection attempts", (await countColleges()) === total);
  t(SRCH, "search text over 100 characters is refused (400)", (await L("q=" + "a".repeat(101))).s === 400);
  t(SRCH, "whitespace-only search behaves as no search", (await L("q=%20%20")).d.total === total);
  // status filter
  const act = await L("status=active&pageSize=100"), ina = await L("status=inactive&pageSize=100");
  const dbAct = (await rows(`select count(*)::int n from "College" where "isActive"`))[0].n;
  t(FILT, "status filter: active and inactive totals equal the database", act.d.total === dbAct && ina.d.total === total - dbAct && act.d.items.every((x) => x.isActive) && ina.d.items.every((x) => !x.isActive), `${act.d.total}/${dbAct}`);
  const both = await L(`status=inactive&q=${encodeURIComponent("bulk " + tag)}&pageSize=100`); t(FILT, "status and search combine", both.d.total === (await rows(`select count(*)::int n from "College" where not "isActive" and name ilike $1`, [`bulk ${tag}%`]))[0].n);
  // sorting in both directions, compared with the database's own ordering
  const dbOrder = async (col, dir) => (await rows(`select c.id from "College" c order by ${col === "staff" ? `(select count(*) from "User" u where u."collegeId"=c.id)` : col === "students" ? `(select count(*) from "Student" s where s."collegeId"=c.id)` : `c."${col}"`} ${dir}, c.id asc limit 100`)).map((r) => r.id);
  for (const [key, col] of [["name", "name"], ["createdAt", "createdAt"], ["slug", "slug"], ["staff", "staff"], ["students", "students"]]) for (const dir of ["asc", "desc"]) {
    const r = await L(`sort=${key}&order=${dir}&pageSize=100`); const want = await dbOrder(col, dir);
    t(FILT, `sort by ${key} ${dir} matches the database order (ties broken by id)`, r.s === 200 && JSON.stringify(idsOf(r)) === JSON.stringify(want), `first api ${idsOf(r)[0]} db ${want[0]}`);
  }
  // stable paging across all pages where many rows tie (staff count is 0 for most)
  const seen = [], pages = (await L("sort=staff&order=asc&pageSize=7")).d.totalPages;
  for (let p = 1; p <= pages; p++) seen.push(...idsOf(await L(`sort=staff&order=asc&pageSize=7&page=${p}`)));
  t(FILT, "stable paging: walking every page of a tied sort returns every institution exactly once", seen.length === total && new Set(seen).size === total, `${seen.length} rows, ${new Set(seen).size} distinct, expected ${total}`);
  // pagination boundaries
  const last = await L(`pageSize=20&page=${Math.ceil(total / 20)}`); t(FILT, "last page holds the remainder", last.d.items.length === (total % 20 || 20), `${last.d.items.length}`);
  const beyond = await L(`pageSize=20&page=${Math.ceil(total / 20) + 1}`); t(FILT, "page past the end: 200, empty items, total still accurate", beyond.s === 200 && beyond.d.items.length === 0 && beyond.d.total === total);
  t(FILT, "pageSize 1 and 100 are accepted and respected", (await L("pageSize=1")).d.items.length === 1 && (await L("pageSize=100")).d.items.length === Math.min(100, total));
  const big = []; const bp = (await L("pageSize=100")).d.totalPages; for (let p = 1; p <= bp; p++) big.push(...idsOf(await L(`pageSize=100&page=${p}`)));
  t(FILT, `large result set (${total} institutions) pages through completely with no gaps or repeats`, big.length === total && new Set(big).size === total);
  // invalid parameters
  for (const bad of ["page=0", "page=-1", "page=abc", "page=1.5", "page=1000001", "pageSize=0", "pageSize=101", "pageSize=-3", "pageSize=ten", "sort=id", "sort=isActive", "sort=name;drop%20table", "sort=" + encodeURIComponent("name desc"), "order=up", "order=ASC", "status=deleted"]) { const r = await L(bad); t(FILT, `invalid parameter refused (400, no leak): ${bad}`, r.s === 400 && !/prisma|SELECT|stack|constraint/i.test(JSON.stringify(r.j)), `HTTP ${r.s}`); }
  // ================= access control =================
  const colAdmin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
  const S = await makeStudents(colAdmin, 1, "REG"); const stu = client(S.tokens.A);
  const probes = [["anonymous", (qs) => fetch(B + "/api/platform/institutions" + qs).then((r) => ({ s: r.status }))], ["college TPO admin", (qs) => colAdmin("GET", "/api/platform/institutions" + qs)], ["student", (qs) => stu("GET", "/api/platform/institutions" + qs)], ["platform admin without second step", (qs) => aal1("GET", "/api/platform/institutions" + qs)]];
  for (const [who, f] of probes) for (const qs of ["", `?q=${encodeURIComponent("bulk " + tag)}&sort=name&page=1`, "?pageSize=100"]) { const r = await f(qs); t(ACC.concat(SRCH), `${who} is refused (401/403) on the list${qs ? " with search/paging" : ""}`, r.s === 401 || r.s === 403, `HTTP ${r.s}`); }
  const cross = await colAdmin("GET", `/api/platform/institutions?q=${encodeURIComponent(base)}`);
  t(ACC.concat(["SA-TC-037"]), "an institution administrator searching for ANOTHER institution by name gets nothing (refused)", (cross.s === 403 || cross.s === 401) && !JSON.stringify(cross.j).includes(base));
  const wrCol = await colAdmin("POST", "/api/platform/institutions", { name: `Rogue ${tag}`, admin: { name: "R", email: `rogue${tag}@example.com` } });
  t(ACC.concat(DUP), "an institution administrator cannot register an institution (refused)", wrCol.s === 403 || wrCol.s === 401);
} finally {
  if (bulkIds.length) { await pgc.query(`delete from "User" where "collegeId" = any($1::uuid[])`, [bulkIds]).catch(() => 0); await pgc.query(`delete from "College" where id = any($1::uuid[])`, [bulkIds]).catch((e) => console.log("cleanup:", e.message)); }
  await pgc.end();
}
process.exit(R.done() ? 1 : 0);

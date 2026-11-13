// Gate 3: access-control sweep over EVERY documented API endpoint (docs/ROUTES.md, generated from the route files).
// Negative direction only (an identity that must be refused must get 401/403): anonymous, student, recruiter, each staff role.
// Also: a read-only principal must never get 2xx on a write; the platform administrator must not reach college routes.
// Target: a production build (BASE_URL), so routes are not compiled lazily. Synthetic data, local stack only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url"; // a file URL's .pathname is "/D:/..." on Windows, which became "D:D:..."; fileURLToPath is correct on every platform
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { B, client, login, makeStudents, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g3-02-access-sweep");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const pw = `Swp-${tag}-pw1!`;
const made = { auth: [], users: [], rec: [], co: [] };

// ---- route index -----------------------------------------------------------------------------------------------------
const rows = []; let section = "";
for (const l of readFileSync("docs/ROUTES.md", "utf8").split("\n")) {
  if (l.startsWith("## ")) section = l.slice(3).trim();
  const m = /^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)` \| ([^|]*)\|/.exec(l);
  if (m) rows.push({ method: m[1], path: m[2], who: m[3].trim(), section });
}
const ZERO = "00000000-0000-4000-8000-000000000000";
const concrete = (p) => p.replace(/:(\w+)/g, (_, n) => (/token/i.test(n) ? "x".repeat(43) : ZERO));
const moduleOf = (p) => {
  const q = [[/auth|\/api\/me|settings\/(staff|invitations|security)/, "Authentication and User Management"], [/psychometrics|assessments/, "Student Assessment and Career Profiling"], [/roadmaps/, "Career Roadmap and Student Development"], [/courses|learning/, "Learning Management System"], [/resources/, "Resource Management System"], [/projects|project-review/, "Project Management and Portfolio"], [/internship/, "Internship Management"], [/resume/, "Dynamic Resume Engine"], [/\/jds/, "Job Description Management and AI Analysis"], [/matching|\/matches/, "AI Candidate Matching Engine"], [/campaigns|\/prep/, "Job-Specific Preparation Campaign"], [/mock-?tests?|\/tests/, "Mock Test Engine"], [/interviews/, "AI Mock Interview Engine"], [/reports/, "Report Generation"], [/readiness/, "Job Readiness Engine"], [/placements|drives|companies|offers|approvals|recruiter/, "Placement Management"], [/discussions/, "Group Discussion and Communication Simulator"], [/notifications|calendar|announcements|communications/, "Notification Centre"], [/dashboard|analytics/, "Dashboards and Analytics"], [/students|verification|showcase|student\//, "Student Registration and Profile"], [/settings|faculty/, "Institution Management"]];
  return (q.find(([re]) => re.test(p)) ?? [0, "Authentication and User Management"])[1];
};
const caseIds = new Map(); // "Unauthorised API access: <module>" -> id ; "Cross-institution access: <module>" -> id
for (const l of readFileSync("../claude/full-application-test-plan.csv", "utf8").split("\n")) { const m = /^(M\d\d-TC-\d+),[^,]*,(Unauthorised API access|Cross-institution access): ([^,]+),/.exec(l); if (m) caseIds.set(`${m[2]}: ${m[3]}`, m[1]); }
const ua = (p) => caseIds.get("Unauthorised API access: " + moduleOf(p)) ?? "M01-TC-019";

// ---- identities ------------------------------------------------------------------------------------------------------
const college = (await pgc.query(`select "collegeId" c from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).rows[0].c;
async function staff(label, role) {
  const email = `swp${tag}${label}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (error) throw new Error(error.message);
  made.auth.push(data.user.id);
  await pgc.query(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values ($1,$2,$3,$4,$5::"Role",'{}',now())`, [data.user.id, college, email, `Swp ${label}`, role]); made.users.push(data.user.id);
  return await login(email, pw);
}
const admin = await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const ids = { anon: null, tpo: admin, officer: await staff("o", "PLACEMENT_OFFICER"), coord: await staff("c", "DEPARTMENT_COORDINATOR"), faculty: await staff("f", "FACULTY"), principal: await staff("p", "PRINCIPAL") };
const adminC = client(admin);
const S = await makeStudents(adminC, 1, "SWP"); ids.student = S.tokens.A;
{ const co = (await pgc.query(`insert into "Company" (id,"collegeId",name,"updatedAt") values (gen_random_uuid(),$1,$2,now()) returning id`, [college, `Swp Co ${tag}`])).rows[0].id; made.co.push(co);
  const email = `swp${tag}rec@example.com`; const { data } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true }); made.auth.push(data.user.id);
  await pgc.query(`insert into "Recruiter" (id,"collegeId","companyId",email,name) values ($1,$2,$3,$4,'Swp Rec')`, [data.user.id, college, co, email]); made.rec.push(data.user.id); ids.recruiter = await login(email, pw); }
// a platform administrator is a login with no User row
{ const email = `swp${tag}plat@example.com`; const { data } = await sb.auth.admin.createUser({ email, password: pw, email_confirm: true }); made.auth.push(data.user.id);
  await pgc.query(`insert into "PlatformAdmin" (id,email,name) values ($1,$2,'Swp Platform')`, [data.user.id, email]); ids.platform = await login(email, pw); }

// ---- who may call what -------------------------------------------------------------------------------------------------
const STAFF = ["tpo", "officer", "coord", "faculty", "principal"];
const allowedStaff = (who) => {
  const w = who.toLowerCase(); if (/^public|scheduler|^student|^recruiter/.test(w)) return [];
  const a = new Set(); if (/any staff/.test(w)) { a.add("tpo"); a.add("officer"); a.add("coord"); a.add("faculty"); a.add("principal"); } // "any staff": loosest reading, so a refusal is never required
  if (/admin/.test(w)) a.add("tpo"); if (/officer/.test(w)) a.add("officer"); if (/coordinator/.test(w)) a.add("coord"); if (/faculty/.test(w)) a.add("faculty"); if (/principal/.test(w)) a.add("principal");
  return [...a];
};
const refused = (s) => s === 401 || s === 403;
async function call(token, method, path) { try { const r = await fetch(B + path, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json" }, body: method === "GET" ? undefined : "{}", redirect: "manual" }); await r.arrayBuffer(); return r.status; } catch { return 0; } }
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }

const sweep = { anon: [], student: [], recruiter: [], staffAsStudent: [], role: [], principalWrite: [], platform: [] };
const jobs = [];
for (const r of rows) {
  const p = concrete(r.path), pub = /^(public|scheduler)/.test(r.who);
  if (!pub && r.section !== "Public") jobs.push(["anon", r, p, null]);
  if (r.section === "Staff and system" && !pub) { jobs.push(["student", r, p, ids.student]); jobs.push(["recruiter", r, p, ids.recruiter]); jobs.push(["platform", r, p, ids.platform]); }
  if (r.section === "Student app" && !pub) { jobs.push(["staffAsStudent", r, p, ids.tpo]); jobs.push(["recruiter", r, p, ids.recruiter]); }
  if (r.section === "Recruiter portal" && !pub) { jobs.push(["student", r, p, ids.student]); jobs.push(["staffAsStudent", r, p, ids.tpo]); }
  if (r.section === "Staff and system" && !pub) { const ok = allowedStaff(r.who); for (const s of STAFF) if (!ok.includes(s)) jobs.push(["role", r, p, ids[s], s]); if (r.method !== "GET" && !/PRINCIPAL/.test(r.who) && r.path !== "/api/notifications/read" /* by design: principalOk, a viewer marks their OWN notifications read (documented exception) */) jobs.push(["principalWrite", r, p, ids.principal]); }
}
console.log(`${rows.length} endpoints, ${jobs.length} probes`);
let done = 0;
await pool(jobs, 8, async ([kind, r, p, tok, who]) => { const s = await call(tok, r.method, p); if (!refused(s) && !(s === 404 && kind === "anon" && false)) sweep[kind].push({ route: `${r.method} ${r.path}`, who: who ?? kind, status: s, mod: moduleOf(r.path), ua: ua(r.path) }); if (++done % 500 === 0) console.log(done + " probes"); });

const summarise = (list) => list.slice(0, 12).map((x) => `${x.who} ${x.route} -> ${x.status}`).join("; ") + (list.length > 12 ? ` ... +${list.length - 12} more` : "");
const count = (kind) => jobs.filter((j) => j[0] === kind).length;
R.t(["M01-TC-019", "SRS-SECURITY-TC-001"], `anonymous caller is refused (401/403) on all ${count("anon")} protected endpoints`, sweep.anon.length === 0, summarise(sweep.anon));
R.t(["M01-TC-014", "ROLE-STU-TC-005"], `a student token is refused on all ${count("student")} staff/recruiter endpoints`, sweep.student.length === 0, summarise(sweep.student));
R.t(["M01-TC-014"], `a staff token is refused on all ${count("staffAsStudent")} student-app/recruiter endpoints`, sweep.staffAsStudent.length === 0, summarise(sweep.staffAsStudent));
R.t(["M01-TC-014", "ROLE-EMP-TC-001"], `a recruiter token is refused on staff and student endpoints (${count("recruiter")} probes)`, sweep.recruiter.length === 0, summarise(sweep.recruiter));
R.t(["SA-TC-036", "SA-TC-035"], `a platform administrator token is refused on every college route (${count("platform")} probes)`, sweep.platform.length === 0, summarise(sweep.platform));
R.t(["ROLE-GEN-TC-001", "ROLE-PERM-TC-001", "M01-TC-014"], `staff roles outside a route's documented roles are refused (${count("role")} probes)`, sweep.role.length === 0, summarise(sweep.role));
R.t(["ROLE-PRN-TC-005", "ROLE-PERM-TC-001"], `read-only principal is refused on every write endpoint (${count("principalWrite")} probes)`, sweep.principalWrite.length === 0, summarise(sweep.principalWrite));
// per-module unauthorised-API cases: one assertion each, from the anonymous + role sweeps
const mods = new Map();
for (const r of rows) { if (r.section !== "Public" && !/^(public|scheduler)/.test(r.who)) { const id = ua(r.path); mods.set(id, (mods.get(id) ?? 0) + 1); } }
for (const [id, n] of mods) { const bad = [...sweep.anon, ...sweep.student, ...sweep.recruiter, ...sweep.staffAsStudent, ...sweep.role].filter((x) => x.ua === id); R.t([id], `module endpoints (${n}) refuse unauthorised callers: anonymous, wrong portal, wrong staff role`, bad.length === 0, summarise(bad)); }
// full list kept for the evidence file
import("node:fs").then((fs) => fs.writeFileSync(fileURLToPath(new URL("./results/g3-02-sweep-detail.json", import.meta.url)), JSON.stringify(sweep, null, 1)));

for (const k of made.rec) await pgc.query(`delete from "Recruiter" where id=$1`, [k]);
for (const k of made.co) await pgc.query(`delete from "Company" where id=$1`, [k]);
await pgc.query(`delete from "PlatformAdmin" where email like $1`, [`swp${tag}%`]);
for (const k of made.users) await pgc.query(`delete from "User" where id=$1`, [k]);
await pgc.end();
process.exit(R.done() ? 1 : 0);

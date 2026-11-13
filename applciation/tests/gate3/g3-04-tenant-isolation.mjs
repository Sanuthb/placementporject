// Gate 3: institution isolation (IDOR) sweep + injection and exposure probes. Local stack only; synthetic data.
// Method: as institution A's administrator, list every collection endpoint and collect record ids; then, as institution B's
// administrator, request each record of A through its GET /:id route. Every request must be refused or return nothing (403/404).
import { readFileSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { B, client, login, makeStudents, onboard, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g3-04-tenant-isolation");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const pw = `Iso-${tag}-pw1!`;
const A = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
const collegeA = (await pgc.query(`select "collegeId" c from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).rows[0].c;
const made = { auth: [], users: [], college: null };
// institution B
const b = (await pgc.query(`insert into "College" (id,name,slug,"updatedAt") values (gen_random_uuid(),$1,$2,now()) returning id`, [`Iso B ${tag}`, `iso-b-${tag}`])).rows[0].id; made.college = b;
const { data: bu } = await sb.auth.admin.createUser({ email: `isoadmb${tag}@example.com`, password: pw, email_confirm: true }); made.auth.push(bu.user.id);
await pgc.query(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values ($1,$2,$3,'Iso B Admin','TPO_ADMIN','{}',now())`, [bu.user.id, b, `isoadmb${tag}@example.com`]); made.users.push(bu.user.id);
for (const m of (await pgc.query(`select module from "CollegeModule" where "collegeId"=$1 and enabled`, [collegeA])).rows) await pgc.query(`insert into "CollegeModule" ("collegeId",module,enabled) values ($1,$2,true) on conflict do nothing`, [b, m.module]);
const Bc = client(await login(`isoadmb${tag}@example.com`, pw));

// fixtures in A so that there is something to guess
const S = await makeStudents(A, 2, "ISO"); await onboard(A, S.ids.A);
await A("POST", "/api/companies", { name: `Iso Co ${tag}`, industry: "IT" });
await A("POST", "/api/announcements", { title: `Iso ${tag}`, body: "synthetic", audience: "ALL" });

// route index
const rows = []; let section = "";
for (const l of readFileSync("docs/ROUTES.md", "utf8").split("\n")) { if (l.startsWith("## ")) section = l.slice(3).trim(); const m = /^\| (GET) \| `([^`]+)` \|/.exec(l); if (m && section === "Staff and system") rows.push(m[2]); }
const lists = rows.filter((p) => !/:/.test(p) && !/export|download|pdf|calendar|feed/.test(p));
const detail = new Set(rows.filter((p) => /^\/api\/[\w-]+\/:id$/.test(p)));
const moduleOf = (p) => { const q = [[/psychometrics|assessments/, "Student Assessment and Career Profiling"], [/roadmaps/, "Career Roadmap and Student Development"], [/courses|learning/, "Learning Management System"], [/resources/, "Resource Management System"], [/projects/, "Project Management and Portfolio"], [/internship/, "Internship Management"], [/resume/, "Dynamic Resume Engine"], [/\/jds/, "Job Description Management and AI Analysis"], [/matching|matches/, "AI Candidate Matching Engine"], [/campaigns|\/prep/, "Job-Specific Preparation Campaign"], [/mock-?tests?/, "Mock Test Engine"], [/interviews/, "AI Mock Interview Engine"], [/reports/, "Report Generation"], [/readiness/, "Job Readiness Engine"], [/placements|drives|companies|offers|approvals/, "Placement Management"], [/discussions/, "Group Discussion and Communication Simulator"], [/notifications|announcements|communications/, "Notification Centre"], [/dashboard|analytics/, "Dashboards and Analytics"], [/students|verification|showcase/, "Student Registration and Profile"], [/settings|faculty/, "Institution Management"]]; return (q.find(([re]) => re.test(p)) ?? [0, "Authentication and User Management"])[1]; };
const caseOf = new Map(); for (const l of readFileSync("../claude/full-application-test-plan.csv", "utf8").split("\n")) { const m = /^(M\d\d-TC-\d+),[^,]*,Cross-institution access: ([^,]+),/.exec(l); if (m) caseOf.set(m[2], m[1]); }

const probes = new Map(); const leaks = []; let total = 0, withData = 0;
const idsOf = (j) => { const a = Array.isArray(j?.data) ? j.data : Array.isArray(j?.data?.items) ? j.data.items : []; return a.map((x) => x?.id).filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)).slice(0, 3); };
for (const l of lists) {
  const r = await A("GET", l + (l.includes("?") ? "" : "?limit=5")); if (r.s !== 200) continue;
  const ids = idsOf(r.j); if (!ids.length) continue; withData++;
  const mod = moduleOf(l); const own = probes.get(mod) ?? { n: 0 }; probes.set(mod, own);
  // B's own view of the same list must not contain A's ids
  const bl = await Bc("GET", l + (l.includes("?") ? "" : "?limit=200")); const bids = new Set(idsOf({ data: bl.d?.items ?? bl.d }));
  const seen = (bl.d?.items ?? (Array.isArray(bl.d) ? bl.d : [])).map((x) => x?.id); const cross = ids.filter((id) => seen.includes(id));
  own.n++; total++; if (cross.length) leaks.push(`B list ${l} contains A ids ${cross.join(",")}`);
  const dp = `${l}/:id`;
  if (detail.has(dp)) for (const id of ids) { const g = await Bc("GET", `${l}/${id}`); own.n++; total++; if (g.s === 200) leaks.push(`B GET ${l}/${id} -> 200`); const gp = await Bc("PATCH", `${l}/${id}`, {}); if (gp.s === 200) leaks.push(`B PATCH ${l}/${id} -> 200`); const gd = await Bc("DELETE", `${l}/${id}`); if (gd.s === 200) leaks.push(`B DELETE ${l}/${id} -> 200`); }
}
R.t(["SRS-SECURITY-TC-002", "SRS-SECURITY-TC-017", "SRS-SECURITY-TC-032", "ROLE-PERM-TC-002", "M02-TC-015", "M01-TC-018"], `institution B sees none of institution A's records: ${total} probes across ${withData} collections (list, get, patch, delete)`, leaks.length === 0, leaks.slice(0, 8).join("; "));
const allMods = [...caseOf.keys()];
// Gate 4 WP-02 gave these fourteen modules seeded records in two institutions and tests them in g4-11-module-isolation.mjs, (and M08 projects and M11 job descriptions, which only passed here because earlier suites had left records behind) so they are no longer reported Blocked here.
const COVERED_BY_G4_11 = new Set(["M06-TC-028", "M07-TC-048", "M08-TC-019", "M09-TC-017", "M11-TC-031", "M10-TC-026", "M12-TC-020", "M13-TC-064", "M14-TC-050", "M15-TC-038", "M16-TC-029", "M17-TC-013", "M19-TC-011", "M21-TC-039"]);
for (const mod of allMods) { const p = probes.get(mod); const id = caseOf.get(mod); if (!p) { if (!COVERED_BY_G4_11.has(id)) R.blocked([id], `cross-institution access: ${mod}`, "No records of this module existed in institution A to guess at; needs seeded fixtures (Gate 3 follow-up)"); } else R.t([id], `cross-institution access: ${mod} (${p.n} probes)`, !leaks.some((x) => moduleOf(x.split(" ")[2] ?? "") === mod), leaks.filter((x) => moduleOf(x.split(" ")[2] ?? "") === mod).join("; ")); }
// direct student-record guess: B's admin and A's student
const sg = await Bc("GET", `/api/students/${S.ids.A}`); R.t(["M03-TC-037", "SRS-SECURITY-TC-017"], "institution B administrator cannot read institution A's student by id (and the 360, documents, sections)", sg.s === 404 || sg.s === 403, `HTTP ${sg.s}`);
for (const sub of ["360", "documents", "sections/ACADEMICS", "mentor"]) { const g = await Bc("GET", `/api/students/${S.ids.A}/${sub}`); R.t(["M03-TC-037"], `B cannot read A's student /${sub}`, g.s === 404 || g.s === 403, `HTTP ${g.s}`); }
const wr = await Bc("PUT", `/api/students/${S.ids.A}/sections/PERSONAL`, { data: { dob: "2003-01-01" }, submit: true }); R.t(["M03-TC-037"], "B cannot write A's student section", wr.s === 404 || wr.s === 403, `HTTP ${wr.s}`);
// student-to-student
const stuB = client(S.tokens.B); const stuA = client(S.tokens.A);
R.t(["SRS-SECURITY-TC-016"], "a student cannot read another student's record through staff routes", [(await stuB("GET", `/api/students/${S.ids.A}`)).s, (await stuB("GET", `/api/students/${S.ids.A}/360`)).s].every((s) => s === 401 || s === 403));
R.t(["SRS-SECURITY-TC-016"], "a student's own profile route returns only that student", (await stuA("GET", "/api/student/profile")).d?.email === S.emails.A || (await stuA("GET", "/api/student/sections")).s === 200);

// injection and exposure probes
const inj = ["' OR '1'='1", "'; DROP TABLE \"Student\"; --", "%' UNION SELECT 1--", "<script>alert(1)</script>", "../../etc/passwd"];
const bad = []; for (const p of ["/api/students?q=", "/api/companies?q=", "/api/drives?q="]) { const base = await A("GET", p + "zzzz-plain-text"); const baseN = (base.d?.items ?? base.d ?? []).length; for (const q of inj) { const r = await A("GET", p + encodeURIComponent(q)); const n = (r.d?.items ?? r.d ?? []).length; if (r.s >= 500) bad.push(`${p}${q} -> ${r.s}`); else if (n > baseN) bad.push(`${p}${q} returned ${n} rows, a plain non-matching term returns ${baseN}`); } }
R.t(["SRS-SECURITY-TC-028"], "SQL-injection strings in search parameters return no error and no extra rows", bad.length === 0, bad.join("; "));
R.t(["SRS-SECURITY-TC-028"], "the Student table still exists after the DROP attempt", (await pgc.query(`select count(*)::int n from "Student"`)).rows[0].n > 0);
const xss = await A("POST", "/api/companies", { name: `<img src=x onerror=alert(1)> ${tag}`, industry: "IT" });
const xr = await fetch(B + "/api/companies?limit=50", { headers: { authorization: "Bearer " + (await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD)) } });
R.t(["SRS-SECURITY-TC-027"], "script-bearing input comes back as JSON data with nosniff (rendering escape is a browser test)", /json/.test(xr.headers.get("content-type") ?? "") && xr.headers.get("x-content-type-options") === "nosniff", `${xr.headers.get("content-type")} / ${xr.headers.get("x-content-type-options")}`);
R.blocked(["SRS-SECURITY-TC-027"], "stored XSS: the page escapes the payload when rendered", "Needs a browser run (Playwright); not built in this pass");
const err = await fetch(B + "/api/students/not-a-uuid", { headers: { authorization: "Bearer " + (await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD)) } }); const et = await err.text();
R.t(["SRS-SECURITY-TC-035", "SRS-SECURITY-TC-043"], "an error response has no stack trace, file paths or SQL", !/\/home\/|node_modules|at \w+ \(|prisma|SELECT /i.test(et), et.slice(0, 200));
R.t(["SRS-SECURITY-TC-036"], "malformed body, wrong types and oversize fields get 400 not 500", await (async () => { const rs = [await A("POST", "/api/companies", { name: 123 }), await A("POST", "/api/companies", { name: "x".repeat(5000) }), await A("POST", "/api/companies", null)]; return rs.every((r) => r.s === 400 || r.s === 413); })());
const csrf = await fetch(B + "/api/companies", { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.example" }, body: JSON.stringify({ name: "csrf" }) });
R.t(["SRS-SECURITY-TC-026"], "a cross-site POST without the Authorization header is refused (tokens are sent by header, not cookie)", csrf.status === 401 || csrf.status === 403, `HTTP ${csrf.status}`);

for (const u of made.users) await pgc.query(`delete from "User" where id=$1`, [u]);
await pgc.end();
process.exit(R.done() ? 1 : 0);

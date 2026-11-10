// Gate 3 security: does a SUSPENDED institution stay reachable through public token surfaces? (defect candidate A-02)
// Method per surface: prove the link works while the institution is active (control), suspend the institution, probe again.
// Authenticated controls (staff + student API) must be refused after suspension; token surfaces are the thing under test.
// Stop rule: once a read probe proves exposure on a surface, that surface's write probe is NOT run (recorded as skipped).
// Local stack only. Synthetic data. Restores the institution to active and removes what it creates.
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { B, client, login, makeStudents, onboard, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "")) { console.error("Refusing: SUPABASE_URL is not local"); process.exit(2); }
const R = recorder("g3-01-suspended-institution");
const IDS = ["SA-TC-029", "SRS-SECURITY-TC-039"], ISSUE = "A-02";
const t = (name, ok, extra = "") => R.t(/^SUSPENDED/.test(name) ? IDS : /^AUTH/.test(name) ? ["SA-TC-027"] : ["SA-TC-029"], name, ok, extra, /^SUSPENDED/.test(name) ? ISSUE : "");
const done = R.done;
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const sha = (s) => createHash("sha256").update(s).digest("hex");
const tok = () => randomBytes(32).toString("base64url");
const get = async (p) => { const r = await fetch(B + p); const b = await r.text(); return { s: r.status, b }; };
const post = async (p, body) => { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { s: r.status, b: await r.text() }; };
const findings = [];
const refused = (s) => s === 404 || s === 403 || s === 410 || s === 401;
const admin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
const collegeId = (await pgc.query(`select "collegeId" c from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).rows[0].c;
const created = { students: [] };
try {
  await pgc.query(`insert into "CollegeModule" ("collegeId",module,enabled) values ($1,'TALENT_SHOWCASE',true) on conflict ("collegeId",module) do update set enabled=true`, [collegeId]);
  const S = await makeStudents(admin, 2, "SUS"); created.students.push(...Object.values(S.ids));
  const stu = client(S.tokens.A); await onboard(admin, S.ids.A); await admin("PUT", `/api/students/${S.ids.A}/sections/SKILLS`, { data: { skills: ["SQL"] }, submit: true }); await admin("POST", `/api/students/${S.ids.A}/sections/SKILLS/approve`, {});
  const sid = S.ids.A, uid = (await pgc.query(`select "userId" u from "Student" where id=$1`, [sid])).rows[0].u;

  // ---- set-up of every token, through the product's own endpoints where they exist
  const sc = await stu("PUT", "/api/student/showcase", { enabled: true, headline: "g3 synthetic" });
  const showcaseToken = sc.d?.link?.split("/").pop();
  const cal = await stu("POST", "/api/student/calendar/feed");
  const calToken = cal.d?.url?.split("/").pop();
  // an invitation for a second, not-yet-accepted student
  const [dept, batch] = await Promise.all([pgc.query(`select id from "Department" where "collegeId"=$1 limit 1`, [collegeId]), pgc.query(`select id,"startYear" y from "Batch" where "collegeId"=$1 limit 1`, [collegeId])]);
  const inv = await admin("POST", "/api/students/invitations", { name: "Sus Invitee", enrollmentNo: `SUSI${tag}`, email: `susi${tag}@example.com`, departmentId: dept.rows[0].id, batchId: batch.rows[0].id, admissionYear: batch.rows[0].y ?? 2021 });
  created.students.push(inv.d?.studentId);
  const lk = await admin("POST", `/api/students/${inv.d?.studentId}/invitation/link`);
  const invToken = lk.d?.link ? new URLSearchParams(lk.d.link.split("#")[1]).get("t") : null;
  // a project team and an internship, with mentor links
  const adminId = (await pgc.query(`select id from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).rows[0].id;
  const proj = (await pgc.query(`insert into "Project" (id,"collegeId",title,"problemStatement",skills,status,"updatedAt") values (gen_random_uuid(),$1,'G3 project','p',$2,'OPEN',now()) returning id`, [collegeId, ["x"]])).rows[0].id;
  const team = (await pgc.query(`insert into "ProjectTeam" (id,"projectId","collegeId",name,"leaderId",status,"updatedAt") values (gen_random_uuid(),$1,$2,'G3 team',$3,'ACTIVE',now()) returning id`, [proj, collegeId, sid])).rows[0].id;
  await pgc.query(`insert into "ProjectMember" (id,"teamId","projectId","studentId","collegeId") values (gen_random_uuid(),$1,$2,$3,$4)`, [team, proj, sid, collegeId]);
  const pTok = tok();
  await pgc.query(`insert into "ProjectMentorInvite" (id,"teamId","collegeId",name,email,"tokenHash","expiresAt","createdById") values (gen_random_uuid(),$1,$2,'Mentor P','mp@example.com',$3,now()+interval '7 days',$4)`, [team, collegeId, sha(pTok), adminId]);
  const intern = (await pgc.query(`insert into "Internship" (id,"collegeId","studentId","companyName",role,"startDate","endDate",status,"createdById","updatedAt") values (gen_random_uuid(),$1,$2,'G3 Co','Intern',current_date-10,current_date+30,'ONGOING',$3,now()) returning id`, [collegeId, sid, adminId])).rows[0].id;
  const iTok = tok();
  await pgc.query(`insert into "InternshipMentorLink" (id,"internshipId","collegeId",name,email,"tokenHash","expiresAt","createdById") values (gen_random_uuid(),$1,$2,'Mentor I','mi@example.com',$3,now()+interval '7 days',$4)`, [intern, collegeId, sha(iTok), adminId]);
  t("setup: all six tokens issued", !!(showcaseToken && calToken && invToken), JSON.stringify({ sc: sc.s, cal: cal.s, inv: inv.s, lk: lk.s }));

  // ---- control: everything works while the institution is ACTIVE
  t("CONTROL showcase page works while active", (await get(`/api/showcase/${showcaseToken}`)).s === 200);
  { const rp = await get(`/api/showcase/${showcaseToken}/resume.pdf`); t("CONTROL showcase resume PDF works while active", rp.s === 200, `HTTP ${rp.s} ${rp.b.slice(0,200)}`); }
  t("CONTROL calendar feed works while active", (await get(`/api/calendar/feed/${calToken}`)).s === 200);
  t("CONTROL project review link works while active", (await get(`/api/project-review/${pTok}`)).s === 200);
  t("CONTROL internship feedback link works while active", (await get(`/api/internship-feedback/${iTok}`)).s === 200);
  t("CONTROL invitation lookup works while active", (await post("/api/invitations/lookup", { token: invToken })).s === 200);

  // ---- suspend (same operation the System Administrator performs: College.isActive=false)
  await pgc.query(`update "College" set "isActive"=false where id=$1`, [collegeId]);

  // ---- authenticated controls: must be refused
  const staffAfter = await admin("GET", "/api/students?limit=1");
  const stuAfter = await stu("GET", "/api/student/showcase");
  t("AUTH staff API refused after suspension", staffAfter.s === 403 || staffAfter.s === 401, staffAfter.s);
  t("AUTH student API refused after suspension", stuAfter.s === 403 || stuAfter.s === 401, stuAfter.s);
  const staffWrite = await admin("POST", "/api/settings/departments", { name: "Should Not Exist " + tag, code: "SNE" + tag });
  t("AUTH staff WRITE refused after suspension", staffWrite.s === 403 || staffWrite.s === 401, staffWrite.s);

  // ---- surfaces under test (reads first; a proven exposure skips that surface's write probe)
  const probe = async (name, p, write) => {
    const r = await get(p);
    const ok = refused(r.s);
    t(`SUSPENDED ${name}: read refused`, ok, `HTTP ${r.s}  <-- EXPOSED to a suspended institution`);
    if (!ok) { findings.push({ name, status: r.s, writeSkipped: true }); if (write) R.blocked(IDS, `SUSPENDED ${name}: write probe`, "Not run: stop rule (read exposure already proven on this surface)", ISSUE); return; }
    if (write) { const w = await write(); t(`SUSPENDED ${name}: write refused`, refused(w.s), `HTTP ${w.s}`); }
  };
  await probe("showcase page", `/api/showcase/${showcaseToken}`);
  await probe("showcase resume PDF", `/api/showcase/${showcaseToken}/resume.pdf`);
  await probe("calendar feed", `/api/calendar/feed/${calToken}`);
  await probe("project mentor review", `/api/project-review/${pTok}`, () => post(`/api/project-review/${pTok}`, { scores: {} }));
  await probe("internship mentor feedback", `/api/internship-feedback/${iTok}`, () => post(`/api/internship-feedback/${iTok}`, { score: 50 }));
  const il = await post("/api/invitations/lookup", { token: invToken });
  t("SUSPENDED invitation lookup: refused", refused(il.s), `HTTP ${il.s}  <-- EXPOSED to a suspended institution`);
  if (!refused(il.s)) { findings.push({ name: "invitation lookup", status: il.s, writeSkipped: true }); R.blocked(IDS, "SUSPENDED invitation accept: write probe", "Not run: stop rule (lookup already exposed)", ISSUE); }
  else t("SUSPENDED invitation accept: refused", refused((await post("/api/invitations/accept", { token: invToken, email: `susi${tag}@example.com`, password: "Passw0rd-x1" })).s));
  // page routes (frontend)
  // ---- reactivation (SA-TC-028): sessions and links work again, nothing was lost
  await pgc.query(`update "College" set "isActive"=true where id=$1`, [collegeId]);
  R.t(["SA-TC-028"], "REACTIVATED staff API works with the old token", (await admin("GET", "/api/students?limit=1")).s === 200);
  R.t(["SA-TC-028"], "REACTIVATED student API works with the old token", (await stu("GET", "/api/student/showcase")).s === 200);
  R.t(["SA-TC-028"], "REACTIVATED showcase link works again", (await get(`/api/showcase/${showcaseToken}`)).s === 200);
  R.t(["SA-TC-027"], "AUTH new sign-in refused while suspended (suspended again for this check)", await (async () => { await pgc.query(`update "College" set "isActive"=false where id=$1`, [collegeId]); const fresh = client(await login(S.emails.A, "Stud-" + tag + "A-pw!")); const r = await fresh("GET", "/api/student/showcase"); await pgc.query(`update "College" set "isActive"=true where id=$1`, [collegeId]); return r.s === 403; })());
} finally {
  await pgc.query(`update "College" set "isActive"=true where id=$1`, [collegeId]);
  const ids = created.students.filter(Boolean);
  if (ids.length) {
    await pgc.query(`delete from "ProjectMentorInvite" where "collegeId"=$1 and name='Mentor P'`, [collegeId]);
    await pgc.query(`delete from "ProjectMember" where "studentId" = any($1::uuid[])`, [ids]);
    await pgc.query(`delete from "ProjectTeam" where name='G3 team' and "collegeId"=$1`, [collegeId]);
    await pgc.query(`delete from "Project" where title='G3 project' and "collegeId"=$1`, [collegeId]);
    await pgc.query(`delete from "InternshipMentorLink" where name='Mentor I' and "collegeId"=$1`, [collegeId]);
    await pgc.query(`delete from "Internship" where "companyName"='G3 Co' and "collegeId"=$1`, [collegeId]);
  }
  await pgc.end();
  console.log("FINDINGS " + JSON.stringify(findings));
}
process.exit(done() ? 1 : 0);

// A-02 regression: a SUSPENDED institution must be unreachable through every public token surface, for reads AND writes.
// Surfaces: showcase page, showcase resume PDF, calendar feed, project mentor review, internship mentor feedback, invitation lookup + accept.
// Sequence: active (works) -> suspend (all refuse; writes attempted; database proven unchanged) -> reactivate (works again, tokens unspent).
// Also: expired, invalid, used and revoked tokens keep being rejected. All calls are direct HTTP (the browser pages call these same APIs).
// Local stack only; synthetic data; the institution is restored to active at the end.
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { B, client, login, makeStudents, onboard, tag } from "../e2e/lib.mjs";
import { recorder } from "./rec.mjs";

const R = recorder("g3-01-suspended-institution");
const ISSUE = "A-02";
const IDS = ["SA-TC-029", "SRS-SECURITY-TC-039", "SRS-SECURITY-TC-040"];
const t = (ids, name, ok, extra = "") => R.t(ids, name, ok, extra, ISSUE);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const sha = (s) => createHash("sha256").update(s).digest("hex");
const tok = () => randomBytes(32).toString("base64url");
const get = async (p) => { const r = await fetch(B + p); return { s: r.status, b: await r.text() }; };
const post = async (p, body) => { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { s: r.status, b: await r.text() }; };
const refused = (s) => s === 404 || s === 403 || s === 410 || s === 401;
const q1 = async (sql, p = []) => (await pgc.query(sql, p)).rows[0];
const admin = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD));
const collegeId = (await q1(`select "collegeId" c from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).c;
const adminId = (await q1(`select id from "User" where email=$1`, [process.env.SEED_ADMIN_EMAIL])).id;
const setActive = (v) => pgc.query(`update "College" set "isActive"=$2 where id=$1`, [collegeId, v]);
const created = { students: [] };
try {
  await pgc.query(`insert into "CollegeModule" ("collegeId",module,enabled) values ($1,'TALENT_SHOWCASE',true) on conflict ("collegeId",module) do update set enabled=true`, [collegeId]);
  const S = await makeStudents(admin, 2, "SUS"); created.students.push(...Object.values(S.ids));
  const stu = client(S.tokens.A); const sid = S.ids.A;
  await onboard(admin, sid); await admin("PUT", `/api/students/${sid}/sections/SKILLS`, { data: { skills: ["SQL"] }, submit: true }); await admin("POST", `/api/students/${sid}/sections/SKILLS/approve`, {});

  // ---- tokens, through the product's own endpoints where they exist
  const showcaseToken = (await stu("PUT", "/api/student/showcase", { enabled: true, headline: "g3 synthetic" })).d?.link?.split("/").pop();
  const calToken = (await stu("POST", "/api/student/calendar/feed")).d?.url?.split("/").pop();
  const [dept, batch] = await Promise.all([q1(`select id from "Department" where "collegeId"=$1 limit 1`, [collegeId]), q1(`select id,"startYear" y from "Batch" where "collegeId"=$1 limit 1`, [collegeId])]);
  const invEmail = `susi${tag}@example.com`;
  const inv = await admin("POST", "/api/students/invitations", { name: "Sus Invitee", enrollmentNo: `SUSI${tag}`, email: invEmail, departmentId: dept.id, batchId: batch.id, admissionYear: batch.y ?? 2021 });
  const invStudent = inv.d?.studentId; created.students.push(invStudent);
  const lk = await admin("POST", `/api/students/${invStudent}/invitation/link`);
  const invToken = lk.d?.link ? new URLSearchParams(lk.d.link.split("#")[1]).get("t") : null;
  const proj = (await q1(`insert into "Project" (id,"collegeId",title,"problemStatement",skills,status,"updatedAt") values (gen_random_uuid(),$1,'G3 project','p',$2,'OPEN',now()) returning id`, [collegeId, ["x"]])).id;
  const team = (await q1(`insert into "ProjectTeam" (id,"projectId","collegeId",name,"leaderId",status,"updatedAt") values (gen_random_uuid(),$1,$2,'G3 team',$3,'ACTIVE',now()) returning id`, [proj, collegeId, sid])).id;
  await pgc.query(`insert into "ProjectMember" (id,"teamId","projectId","studentId","collegeId") values (gen_random_uuid(),$1,$2,$3,$4)`, [team, proj, sid, collegeId]);
  const intern = (await q1(`insert into "Internship" (id,"collegeId","studentId","companyName",role,"startDate","endDate",status,"createdById","updatedAt") values (gen_random_uuid(),$1,$2,'G3 Co','Intern',current_date-10,current_date+30,'ONGOING',$3,now()) returning id`, [collegeId, sid, adminId])).id;
  const mkP = async (token, interval = "+7 days") => pgc.query(`insert into "ProjectMentorInvite" (id,"teamId","collegeId",name,email,"tokenHash","expiresAt","createdById") values (gen_random_uuid(),$1,$2,'Mentor P','mp@example.com',$3,now()+$5::interval,$4)`, [team, collegeId, sha(token), adminId, interval]);
  const mkI = async (token, interval = "+7 days") => pgc.query(`insert into "InternshipMentorLink" (id,"internshipId","collegeId",name,email,"tokenHash","expiresAt","createdById") values (gen_random_uuid(),$1,$2,'Mentor I','mi@example.com',$3,now()+$5::interval,$4)`, [intern, collegeId, sha(token), adminId, interval]);
  const pTok = tok(), iTok = tok(), pExpired = tok(), iExpired = tok();
  await mkP(pTok); await mkI(iTok); await mkP(pExpired, "-1 day"); await mkI(iExpired, "-1 day");
  t(IDS, "setup: every token issued", !!(showcaseToken && calToken && invToken), JSON.stringify({ showcase: !!showcaseToken, cal: !!calToken, inv: lk.s }));

  const surfaces = [
    ["showcase page", () => get(`/api/showcase/${showcaseToken}`)],
    ["showcase resume PDF", () => get(`/api/showcase/${showcaseToken}/resume.pdf`)],
    ["calendar feed", () => get(`/api/calendar/feed/${calToken}`)],
    ["project mentor review (read)", () => get(`/api/project-review/${pTok}`)],
    ["internship mentor feedback (read)", () => get(`/api/internship-feedback/${iTok}`)],
    ["invitation lookup", () => post("/api/invitations/lookup", { token: invToken })],
  ];
  // ---- 1. active: all six work
  for (const [n, f] of surfaces) { const r = await f(); t(IDS, `ACTIVE ${n} works`, r.s === 200, `HTTP ${r.s}`); }

  // ---- snapshot of everything a suspended request could touch
  const snap = async () => ({
    views: (await q1(`select views from "ShowcaseProfile" where "studentId"=$1`, [sid])).views,
    lastRead: String((await q1(`select "lastReadAt" l from "CalendarFeed" where "studentId"=$1`, [sid])).l),
    reviews: (await q1(`select count(*)::int n from "ProjectReview" where "teamId"=$1`, [team])).n,
    pUsed: (await q1(`select count(*)::int n from "ProjectMentorInvite" where "teamId"=$1 and "usedAt" is not null`, [team])).n,
    evals: (await q1(`select count(*)::int n from "InternshipEvaluation" where "internshipId"=$1`, [intern])).n,
    fb: (await q1(`select count(*)::int n from "InternshipFeedback" where "internshipId"=$1`, [intern])).n,
    iUsed: (await q1(`select count(*)::int n from "InternshipMentorLink" where "internshipId"=$1 and "usedAt" is not null`, [intern])).n,
    ppo: (await q1(`select "ppoStatus" p from "Internship" where id=$1`, [intern])).p,
    invRow: JSON.stringify(await q1(`select status,"failedAttempts","acceptedAt" from "StudentInvitation" where "studentId"=$1`, [invStudent])),
    invUser: (await q1(`select "userId" u from "Student" where id=$1`, [invStudent])).u,
    onboarding: (await q1(`select "onboardingStatus" o from "Student" where id=$1`, [invStudent])).o,
    colleges: (await q1(`select count(*)::int n from "AuditLog" where "collegeId"=$1`, [collegeId])).n,
  });
  const authUsers = async () => (await sb.auth.admin.listUsers({ perPage: 1000 })).data.users.length;
  const before = await snap(); const usersBefore = await authUsers();

  // ---- 2. suspend, 3. all six refuse
  await setActive(false);
  for (const [n, f] of surfaces) { const r = await f(); t(IDS, `SUSPENDED ${n} refused`, refused(r.s), `HTTP ${r.s}`); }
  // refusal body must not leak the institution, the student or the mentor
  const leakProbe = [await get(`/api/showcase/${showcaseToken}`), await get(`/api/project-review/${pTok}`), await get(`/api/internship-feedback/${iTok}`), await get(`/api/calendar/feed/${calToken}`), await post("/api/invitations/lookup", { token: invToken })];
  t(IDS, "SUSPENDED refusal bodies reveal no institution, student, mentor or suspension state", leakProbe.every((r) => !/suspend|inactive|deactivat|E2E College|Sus Invitee|Mentor [PI]|SUS \w|g3 synthetic/i.test(r.b)), leakProbe.map((r) => r.b.slice(0, 80)).join(" | "));
  const sameAsUnknown = (await get(`/api/showcase/${tok()}`)).b;
  t(IDS, "SUSPENDED showcase refusal is identical to an unknown link's", (await get(`/api/showcase/${showcaseToken}`)).b === sameAsUnknown);

  // ---- 4/5/6. write attempts while suspended
  const w1 = await post(`/api/project-review/${pTok}`, { scores: Object.fromEntries(["problem", "technical", "documentation", "presentation", "teamwork"].map((k) => [k, 8])), comments: "should not be stored" });
  t(IDS, "SUSPENDED project mentor review submission refused", refused(w1.s), `HTTP ${w1.s} ${w1.b.slice(0, 100)}`);
  const w2 = await post(`/api/internship-feedback/${iTok}`, { score: 90, remarks: "should not be stored", feedback: "nor this", recommendPpo: true });
  t(IDS, "SUSPENDED internship feedback submission refused", refused(w2.s), `HTTP ${w2.s} ${w2.b.slice(0, 100)}`);
  const w3 = await post("/api/invitations/accept", { token: invToken, email: invEmail, password: "Passw0rd-x1" });
  t(IDS, "SUSPENDED invitation acceptance refused", refused(w3.s), `HTTP ${w3.s} ${w3.b.slice(0, 100)}`);
  const w4 = await post("/api/invitations/accept", { token: invToken, email: "wrong@example.com", password: "Passw0rd-x1" });
  t(IDS, "SUSPENDED invitation accept with a wrong email is refused the same way (no attempt counted)", refused(w4.s) && w4.s === w3.s, `HTTP ${w4.s}`);

  // ---- 7. nothing created or modified
  const after = await snap();
  for (const k of Object.keys(before)) if (k !== "colleges") t(IDS, `SUSPENDED nothing changed: ${k}`, before[k] === after[k], `${before[k]} -> ${after[k]}`);
  t(IDS, "SUSPENDED no login was created by the invitation attempt", (await authUsers()) === usersBefore);
  t(IDS, "SUSPENDED no audit rows were written by refused public requests", before.colleges === after.colleges, `${before.colleges} -> ${after.colleges}`);

  // ---- 10. expired / invalid / unknown tokens, also while suspended
  for (const [n, p] of [["expired project mentor token", `/api/project-review/${pExpired}`], ["expired internship token", `/api/internship-feedback/${iExpired}`], ["unknown project token", `/api/project-review/${tok()}`], ["unknown internship token", `/api/internship-feedback/${tok()}`], ["unknown showcase token", `/api/showcase/${tok()}`], ["unknown calendar token", `/api/calendar/feed/${tok()}`]]) t(["SRS-SECURITY-TC-040"], `SUSPENDED ${n} rejected`, refused((await get(p)).s));
  t(["SRS-SECURITY-TC-040"], "SUSPENDED garbage invitation token rejected", refused((await post("/api/invitations/lookup", { token: "garbage" })).s));

  // ---- 8. reactivate, 9. legitimate access is back and nothing was spent
  await setActive(true);
  for (const [n, f] of surfaces) { const r = await f(); t(IDS.concat("SA-TC-028"), `REACTIVATED ${n} works again`, r.s === 200, `HTTP ${r.s}`); }
  t(["SA-TC-028"], "REACTIVATED staff API works with the old token", (await admin("GET", "/api/students?limit=1")).s === 200);
  t(["SA-TC-028"], "REACTIVATED student API works with the old token", (await stu("GET", "/api/student/showcase")).s === 200);
  const p2 = await post(`/api/project-review/${pTok}`, { scores: Object.fromEntries(["problem", "technical", "documentation", "presentation", "teamwork"].map((k) => [k, 8])), comments: "legit" });
  t(IDS, "REACTIVATED the mentor review link was not spent by the suspended attempt and now accepts the review", p2.s === 200, `HTTP ${p2.s} ${p2.b.slice(0, 120)}`);
  t(IDS, "REACTIVATED a used review link is rejected the second time", refused((await post(`/api/project-review/${pTok}`, { scores: {} })).s) && refused((await get(`/api/project-review/${pTok}`)).s));
  const i2 = await post(`/api/internship-feedback/${iTok}`, { score: 88, remarks: "legit", feedback: "good" });
  t(IDS, "REACTIVATED the internship feedback link was not spent and now accepts feedback", i2.s === 200, `HTTP ${i2.s} ${i2.b.slice(0, 120)}`);
  t(IDS, "REACTIVATED a used feedback link is rejected the second time", refused((await get(`/api/internship-feedback/${iTok}`)).s));
  t(IDS, "REACTIVATED expired tokens are still rejected", refused((await get(`/api/project-review/${pExpired}`)).s) && refused((await get(`/api/internship-feedback/${iExpired}`)).s));
  const a2 = await post("/api/invitations/accept", { token: invToken, email: invEmail, password: "Passw0rd-x1" });
  t(IDS, "REACTIVATED the invitation was not spent and can now be accepted", a2.s === 200, `HTTP ${a2.s} ${a2.b.slice(0, 120)}`);
  t(IDS, "REACTIVATED an accepted invitation cannot be reused", refused((await post("/api/invitations/lookup", { token: invToken })).s));
  // revoked invitation stays rejected
  const inv2 = await admin("POST", "/api/students/invitations", { name: "Sus Revoked", enrollmentNo: `SUSR${tag}`, email: `susr${tag}@example.com`, departmentId: dept.id, batchId: batch.id, admissionYear: batch.y ?? 2021 }); created.students.push(inv2.d?.studentId);
  const lk2 = await admin("POST", `/api/students/${inv2.d?.studentId}/invitation/link`); const rTok = new URLSearchParams(lk2.d.link.split("#")[1]).get("t");
  await admin("POST", `/api/students/${inv2.d?.studentId}/invitation/revoke`);
  t(["SRS-SECURITY-TC-040"], "a revoked invitation is rejected (active institution)", refused((await post("/api/invitations/lookup", { token: rTok })).s));
  t(["SRS-SECURITY-TC-040"], "a malformed invitation token is rejected (active institution)", refused((await post("/api/invitations/lookup", { token: "x" })).s));
  // new sign-in is refused while suspended (authenticated control)
  await setActive(false);
  const fresh = client(await login(S.emails.A, "Stud-" + tag + "A-pw!"));
  t(["SA-TC-027"], "SUSPENDED a new student sign-in cannot use the API", (await fresh("GET", "/api/student/showcase")).s === 403);
  t(["SA-TC-027"], "SUSPENDED staff API refused", (await admin("GET", "/api/students?limit=1")).s === 403);
} finally {
  await setActive(true);
  await pgc.query(`delete from "ProjectReview" where "teamId" in (select id from "ProjectTeam" where name='G3 team' and "collegeId"=$1)`, [collegeId]).catch(() => 0);
  await pgc.query(`delete from "ProjectMentorInvite" where "collegeId"=$1 and name='Mentor P'`, [collegeId]).catch(() => 0);
  await pgc.query(`delete from "ProjectMember" where "studentId" = any($1::uuid[])`, [created.students.filter(Boolean)]).catch(() => 0);
  await pgc.query(`delete from "ProjectTeam" where name='G3 team' and "collegeId"=$1`, [collegeId]).catch(() => 0);
  await pgc.query(`delete from "Project" where title='G3 project' and "collegeId"=$1`, [collegeId]).catch(() => 0);
  await pgc.query(`delete from "InternshipMentorLink" where name='Mentor I' and "collegeId"=$1`, [collegeId]).catch(() => 0);
  await pgc.query(`delete from "Internship" where "companyName"='G3 Co' and "collegeId"=$1`, [collegeId]).catch(() => 0);
  await pgc.end();
}
process.exit(R.done() ? 1 : 0);

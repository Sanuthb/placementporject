import { createClient } from "@supabase/supabase-js";
import pg from "pg";
const B = process.env.BASE_URL ?? "http://localhost:3111";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data, error } = await sb.auth.signInWithPassword({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
if (error) { console.log("LOGIN FAIL", error.message); process.exit(1); }
const auth = { authorization: "Bearer " + data.session.access_token };
const call = async (m, p, body, raw) => {
  const r = await fetch(B + p, { method: m, headers: raw ? auth : { ...auth, "content-type": "application/json" }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 80); }
  return { s: r.status, j, d: j?.data, code: j?.error?.code };
};
let fails = 0;
const t = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const day = 86400000, tag = Date.now().toString().slice(-6);

// ---- setup: 4 onboarded students, 3 companies
await call("PATCH", "/api/settings/verification", { requiredSections: ["ACADEMICS", "PERSONAL"] });
await call("PATCH", "/api/settings/policies", { approvalRequired: [], maxOffersPerStudent: 1, enforceTierUpgrade: false });
const dept = (await call("GET", "/api/settings/departments")).d.find((d) => d.code === "CSE");
let csv = "enrollment_no,name,email,phone,department_code,batch_name,program_code\n";
for (const c of "ABCD") csv += `P${tag}${c},Stu ${c},p${tag}${c.toLowerCase()}@example.com,,CSE,2021-2025,\n`;
const fd = new FormData(); fd.append("file", new Blob([csv]), "s.csv");
const pv = await call("POST", "/api/students/import/preview", null, fd); await call("POST", `/api/students/import/${pv.d.jobId}/confirm`);
const list = (await call("GET", `/api/students?q=P${tag}&limit=10`)).d.items; const st = (c) => list.find((x) => x.enrollmentNo === `P${tag}${c}`).id;
for (const c of "ABCD") {
  await call("PUT", `/api/students/${st(c)}/sections/ACADEMICS`, { data: { cgpa: 8, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true });
  await call("PUT", `/api/students/${st(c)}/sections/PERSONAL`, { data: { dob: "2003-01-01" }, submit: true });
  await call("POST", `/api/students/${st(c)}/sections/ACADEMICS/approve`, {}); await call("POST", `/api/students/${st(c)}/sections/PERSONAL/approve`, {});
  await call("POST", `/api/students/${st(c)}/onboard`);
}
const mkCo = async (n, tier) => (await call("POST", "/api/companies", { name: `${n} ${tag}`, tier })).d.id;
const dream = await mkCo("Dream", "DREAM"), regular = await mkCo("Regular", "REGULAR"), superd = await mkCo("Super", "SUPER_DREAM");
const mkDrive = async (companyId, rounds, extra = {}) => {
  const d = await call("POST", "/api/drives", { companyId, role: "SDE", jobType: "FULL_TIME", applicationDeadline: new Date(Date.now() + 7 * day).toISOString(), driveDate: new Date(Date.now() + 9 * day).toISOString(), minCgpa: 7, allowPlaced: false, rounds, ...extra });
  await call("POST", `/api/drives/${d.d.id}/publish`); return d.d.id;
};
const apply = async (drive, c) => (await call("POST", `/api/drives/${drive}/applications`, { studentId: st(c) })).d?.id;

// ---- rounds
const d1 = await mkDrive(dream, [{ type: "APTITUDE" }, { type: "TECHNICAL" }, { type: "HR" }]);
const app = {}; for (const c of "ABCD") app[c] = await apply(d1, c);
const rounds = (await call("GET", `/api/drives/${d1}`)).d.rounds; const [r1, r2, r3] = rounds.map((r) => r.id);
t("shortlist all 4", (await call("POST", `/api/drives/${d1}/applications/decide`, { applicationIds: Object.values(app), status: "SHORTLISTED" })).d?.updated === 4);
t("candidates for round 1", (await call("GET", `/api/drives/${d1}/rounds/${r1}/candidates`)).d.items.length === 4);
t("offer before rounds blocked", (await call("POST", "/api/offers", { applicationId: app.A, packageLpa: 12 })).s === 400);
const res = (r, arr) => call("POST", `/api/drives/${d1}/rounds/${r}/results`, { results: arr.map(([c, status, score]) => ({ applicationId: app[c], status, score })) });
let rr = await res(r1, [["A", "CLEARED", 80], ["B", "CLEARED", 70], ["C", "REJECTED", 30], ["D", "ABSENT"]]); t("round 1 results", rr.d?.updated === 4, JSON.stringify(rr.j));
rr = await res(r2, [["D", "CLEARED"]]); t("D (absent) cannot skip to round 2", rr.d?.failed?.length === 1 && /waiting for round 1/.test(rr.d.failed[0].reason), JSON.stringify(rr.d));
rr = await res(r1, [["C", "CLEARED", 55]]); t("correct C: rejected -> cleared", rr.d?.updated === 1, JSON.stringify(rr.d));
t("C back in the drive", (await call("GET", `/api/drives/${d1}/applications?status=SHORTLISTED`)).d.some((a) => a.id === app.C));
rr = await res(r2, [["A", "CLEARED"], ["B", "REJECTED"], ["C", "ATTENDED"]]); t("round 2 results", rr.d?.updated === 3, JSON.stringify(rr.d));
rr = await res(r1, [["A", "REJECTED"]]); t("cannot change round 1 after round 2 result", rr.d?.failed?.[0]?.reason?.includes("later round"), JSON.stringify(rr.d));
t("rounds cannot be replaced now", (await call("PUT", `/api/drives/${d1}/rounds`, { rounds: [{ type: "HR" }] })).s === 409);
rr = await res(r3, [["A", "CLEARED", 90]]); t("A clears final round", rr.d?.updated === 1);
const up = new FormData(); up.append("file", new Blob([`enrollment_no,result,score,remarks\nP${tag}C,selected,77,good\nNOPE1,cleared,,\nP${tag}D,maybe,,\n`]), "r.csv");
const ur = await call("POST", `/api/drives/${d1}/rounds/${r2}/results/upload`, null, up); t("upload: 1 applied, 2 row errors", ur.d?.updated === 1 && ur.d.rowErrors.length === 2, JSON.stringify(ur.j));
const ex = await fetch(B + `/api/drives/${d1}/rounds/${r1}/shortlist-export`, { headers: auth }); t("shortlist export", ex.status === 200);

// ---- offers
const o1 = await call("POST", "/api/offers", { applicationId: app.A, packageLpa: 12.5 }); t("offer to A", o1.s === 200, JSON.stringify(o1.j)); const offerA = o1.d?.id;
t("duplicate active offer 409", (await call("POST", "/api/offers", { applicationId: app.A, packageLpa: 13 })).s === 409);
t("PPO flag refused on full-time", (await call("POST", "/api/offers", { applicationId: app.C, packageLpa: 10, isPpo: true })).s === 400);
const d2 = await mkDrive(regular, []); const a2 = {}; for (const c of "ABC") a2[c] = await apply(d2, c);
await call("POST", `/api/drives/${d2}/applications/decide`, { applicationIds: Object.values(a2), status: "SHORTLISTED" });
const lim = await call("POST", "/api/offers", { applicationId: a2.A, packageLpa: 5 }); t("one-offer rule blocks 2nd offer", lim.s === 409 && lim.code === "OFFER_RULE", JSON.stringify(lim.j));
t("accept A", (await call("POST", `/api/offers/${offerA}/respond`, { decision: "ACCEPT" })).d?.status === "ACCEPTED");
t("accept twice 409", (await call("POST", `/api/offers/${offerA}/respond`, { decision: "ACCEPT" })).s === 409);
const placed = async (drive, c) => (await call("GET", `/api/drives/${drive}/eligibility?status=all`)).d.items.find((i) => i.studentId === st(c))?.reasons ?? [];
t("A is now placed", (await placed(d2, "A")).some((r) => /Already placed/.test(r)));
t("joined needs a date", (await call("PATCH", `/api/offers/${offerA}/joining`, { joiningStatus: "JOINED" })).s === 400);
t("mark joined", (await call("PATCH", `/api/offers/${offerA}/joining`, { joiningStatus: "JOINED", joiningDate: "2027-07-01" })).s === 200);
const pdf = new FormData(); pdf.append("file", new Blob(["%PDF-1.4 x"], { type: "application/pdf" }), "offer.pdf");
t("offer letter upload", (await call("POST", `/api/offers/${offerA}/letter`, null, pdf)).s === 200);
t("offer shows letter url", !!(await call("GET", `/api/offers/${offerA}`)).d.letterUrl);
t("revoke needs reason", (await call("POST", `/api/offers/${offerA}/revoke`, {})).s === 400);
t("revoke A", (await call("POST", `/api/offers/${offerA}/revoke`, { reason: "Background check failed" })).d?.status === "REVOKED");
t("A no longer placed", !(await placed(d2, "A")).some((r) => /Already placed/.test(r)));
t("joining on revoked offer 409", (await call("PATCH", `/api/offers/${offerA}/joining`, { joiningStatus: "PENDING" })).s === 409);
const re = await call("POST", "/api/offers", { applicationId: app.A, packageLpa: 14 }); t("re-offer after revoke", re.s === 200);
await call("POST", `/api/offers/${re.d.id}/respond`, { decision: "ACCEPT" });
t("results blocked while an offer exists", (await res(r3, [["A", "REJECTED"]])).d?.failed?.[0]?.reason?.includes("offer exists"));

// ---- tier upgrade rule
await call("PATCH", "/api/settings/policies", { enforceTierUpgrade: true });
const dReg = await mkDrive(regular, [], { allowPlaced: true }); const aReg = await apply(dReg, "A");
await call("POST", `/api/drives/${dReg}/applications/decide`, { applicationIds: [aReg], status: "SHORTLISTED" });
const tr = await call("POST", "/api/offers", { applicationId: aReg, packageLpa: 6 }); t("lower tier refused for placed student", tr.s === 409 && tr.code === "OFFER_RULE", JSON.stringify(tr.j));
const dSup = await mkDrive(superd, [], { allowPlaced: true }); const aSup = await apply(dSup, "A");
await call("POST", `/api/drives/${dSup}/applications/decide`, { applicationIds: [aSup], status: "SHORTLISTED" });
t("higher tier allowed (upgrade)", (await call("POST", "/api/offers", { applicationId: aSup, packageLpa: 30 })).s === 200);
await call("PATCH", "/api/settings/policies", { enforceTierUpgrade: false });

// ---- approvals
await call("PATCH", "/api/settings/policies", { approvalRequired: ["OFFER_CREATE", "BULK_STATUS_CHANGE", "BULK_EMAIL"] });
const g1 = await call("POST", "/api/offers", { applicationId: a2.B, packageLpa: 7 }); t("offer gated -> 202", g1.s === 202 && g1.d.approvalRequired);
t("nothing created yet", (await call("GET", `/api/offers?studentId=${st("B")}`)).d.items.length === 0);
const pend = (await call("GET", "/api/approvals?status=PENDING")).d.items; t("shows in pending list", pend.some((p) => p.id === g1.d.approvalRequestId && /Stu B/.test(p.summary)));
t("reject needs comment", (await call("POST", `/api/approvals/${g1.d.approvalRequestId}/decide`, { decision: "REJECT" })).s === 400);
const ap1 = await call("POST", `/api/approvals/${g1.d.approvalRequestId}/decide`, { decision: "APPROVE" }); t("approve runs the offer", ap1.s === 200 && ap1.d.result?.status === "OFFERED", JSON.stringify(ap1.j));
t("offer now exists", (await call("GET", `/api/offers?studentId=${st("B")}`)).d.items.length === 1);
t("decide twice 409", (await call("POST", `/api/approvals/${g1.d.approvalRequestId}/decide`, { decision: "APPROVE" })).s === 409);
const g2 = await call("POST", "/api/offers", { applicationId: a2.C, packageLpa: 7 });
t("send back", (await call("POST", `/api/approvals/${g2.d.approvalRequestId}/decide`, { decision: "SEND_BACK", comment: "Package looks low" })).d?.status === "SENT_BACK");
t("sent-back offer not created", (await call("GET", `/api/offers?studentId=${st("C")}`)).d.items.length === 0);
const g3 = await call("POST", `/api/drives/${d2}/applications/decide`, { applicationIds: [a2.B, a2.C], status: "ON_HOLD" }); t("bulk status gated", g3.s === 202);
t("status unchanged while pending", (await call("GET", `/api/drives/${d2}/applications?status=ON_HOLD`)).d.length === 0);
await call("POST", `/api/approvals/${g3.d.approvalRequestId}/decide`, { decision: "APPROVE" });
t("bulk status applied after approval (B blocked by live offer)", (await call("GET", `/api/drives/${d2}/applications?status=ON_HOLD`)).d.length === 1);
t("single change is not gated", (await call("POST", `/api/drives/${d2}/applications/decide`, { applicationIds: [a2.C], status: "SHORTLISTED" })).s === 200);

// ---- email
const d3 = await mkDrive(regular, []);
const em = await call("POST", `/api/drives/${d3}/reminders`, {}); t("reminder gated", em.s === 202, JSON.stringify(em.j));
const emA = await call("POST", `/api/approvals/${em.d.approvalRequestId}/decide`, { decision: "APPROVE" }); t("approved reminder sent", emA.d?.result?.sent >= 4, JSON.stringify(emA.j));
await call("PATCH", "/api/settings/policies", { approvalRequired: [] });
const em2 = await call("POST", `/api/drives/${d3}/reminders`, { subject: "Hello there", message: "Please apply soon" }); t("ungated reminder sends", em2.d?.sent >= 4, JSON.stringify(em2.j));
const msgs = await call("GET", "/api/communications/messages?purpose=drive.reminder"); t("message history", msgs.d.items.length >= 8 && msgs.d.items.every((m) => m.status === "SENT"));
t("announcement to a batch", (await call("POST", "/api/communications/email", { subject: "Notice", message: "Placement briefing at 10am", departmentId: dept.id })).d?.sent >= 4);
t("announcement needs a target", (await call("POST", "/api/communications/email", { subject: "Notice", message: "No target here" })).s === 400);

// ---- self-approval rule with a second admin
const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
const { rows: [col] } = await pgc.query(`select id from "College" where slug='demo-college'`);
const fakeId = "11111111-1111-4111-8111-111111111111";
await pgc.query(`insert into "User"(id,"collegeId",email,name,role,"updatedAt") values($1,$2,'second@demo.test','Second Admin','TPO_ADMIN',now()) on conflict do nothing`, [fakeId, col.id]);
await call("PATCH", "/api/settings/policies", { approvalRequired: ["OFFER_CREATE"] });
const g4 = await call("POST", "/api/offers", { applicationId: a2.C, packageLpa: 8 });
t("self-approval blocked with 2 admins", (await call("POST", `/api/approvals/${g4.d.approvalRequestId}/decide`, { decision: "APPROVE" })).s === 403);
await pgc.query(`delete from "User" where id=$1`, [fakeId]); await pgc.end();
t("self-approval allowed for sole admin", (await call("POST", `/api/approvals/${g4.d.approvalRequestId}/decide`, { decision: "APPROVE" })).s === 200);
await call("PATCH", "/api/settings/policies", { approvalRequired: [], maxOffersPerStudent: 1, enforceTierUpgrade: false });

const cd = (await call("GET", `/api/companies/${dream}`)).d.history; t("company history: hired counted", cd.studentsHired === 1 && cd.highestPackageLpa === 14, JSON.stringify(cd));
console.log(fails ? `${fails} FAILED` : "ALL PASSED");

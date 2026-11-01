import { createClient } from "@supabase/supabase-js";
const B = process.env.BASE_URL ?? "http://localhost:3111";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data, error } = await sb.auth.signInWithPassword({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
if (error) { console.log("LOGIN FAIL", error.message); process.exit(1); }
const auth = { authorization: "Bearer " + data.session.access_token };
const call = async (m, p, body, raw) => {
  const r = await fetch(B + p, { method: m, headers: raw ? auth : { ...auth, "content-type": "application/json" }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 60); }
  return { s: r.status, j, bytes: t.length };
};
let fails = 0;
const t = (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : extra); };
const code = (r) => r.j?.error?.code;
const dayMs = 86400000;

await call("PATCH", "/api/settings/verification", { requiredSections: ["ACADEMICS", "PERSONAL"] });
const depts = (await call("GET", "/api/settings/departments")).j.data; const dept = depts.find((d) => d.code === "CSE");
const batch = (await call("GET", "/api/settings/batches")).j.data[0];
const tag = Date.now().toString().slice(-6);
const csv = `enrollment_no,name,email,phone,department_code,batch_name,program_code\nE${tag}A,Alice High,alice${tag}@example.com,,CSE,2021-2025,\nE${tag}B,Bob Low,bob${tag}@example.com,,CSE,2021-2025,\nE${tag}C,Cara OptedOut,cara${tag}@example.com,,CSE,2021-2025,\n`;
const fd = new FormData(); fd.append("file", new Blob([csv]), "s.csv");
const pv = await call("POST", "/api/students/import/preview", null, fd);
await call("POST", `/api/students/import/${pv.j.data.jobId}/confirm`);
const list = (await call("GET", `/api/students?q=E${tag}&limit=10`)).j.data.items;
const by = (c) => list.find((s) => s.enrollmentNo === `E${tag}${c}`);
const cg = { A: 8.5, B: 6.0, C: 9.0 };
for (const c of ["A", "B", "C"]) {
  const id = by(c).id;
  await call("PUT", `/api/students/${id}/sections/ACADEMICS`, { data: { cgpa: cg[c], tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true });
  await call("PUT", `/api/students/${id}/sections/PERSONAL`, { data: { dob: "2003-01-01" }, submit: true });
  await call("POST", `/api/students/${id}/sections/ACADEMICS/approve`, {});
  await call("POST", `/api/students/${id}/sections/PERSONAL/approve`, {});
  const ob = await call("POST", `/api/students/${id}/onboard`);
  if (ob.s !== 200) console.log("onboard failed", c, ob.j);
}
await call("PATCH", `/api/students/${by("C").id}/participation`, { status: "OPTED_OUT" });

const co = await call("POST", "/api/companies", { name: "Acme " + tag, industry: "Software", tier: "DREAM", contacts: [{ name: "HR Lead", email: "hr@acme.test" }] });
t("create company", co.s === 200); const cid = co.j.data.id;
t("duplicate company 409", (await call("POST", "/api/companies", { name: "Acme " + tag })).s === 409);
t("note", (await call("POST", `/api/companies/${cid}/notes`, { kind: "FOLLOW_UP", body: "Call in March", followUpDate: "2027-03-01" })).s === 200);

const mk = (extra = {}) => ({ companyId: cid, role: "SDE", jobType: "FULL_TIME", applicationDeadline: new Date(Date.now() + 7 * dayMs).toISOString(), driveDate: new Date(Date.now() + 10 * dayMs).toISOString(), minCgpa: 7, allowPlaced: true, departmentIds: [dept.id], rounds: [{ type: "APTITUDE" }, { type: "TECHNICAL" }, { type: "HR" }], ...extra });
t("bad dates rejected", (await call("POST", "/api/drives", mk({ driveDate: new Date(Date.now() + dayMs).toISOString() }))).s === 400);
t("foreign dept rejected", (await call("POST", "/api/drives", mk({ departmentIds: ["00000000-0000-4000-8000-000000000000"] }))).s === 400);
const dr = await call("POST", "/api/drives", mk()); t("create drive", dr.s === 200 && dr.j.data.rounds.length === 3, JSON.stringify(dr.j).slice(0, 150)); const did = dr.j.data.id;
t("apply before publish blocked", (await call("POST", `/api/drives/${did}/applications`, { studentId: by("A").id })).s === 409);
t("publish", (await call("POST", `/api/drives/${did}/publish`)).s === 200);
t("publish twice 409", (await call("POST", `/api/drives/${did}/publish`)).s === 409);

let el = (await call("GET", `/api/drives/${did}/eligibility?status=all`)).j.data;
const row = (c) => el.items.find((i) => i.enrollmentNo === `E${tag}${c}`);
t("A eligible", row("A")?.eligible === true);
t("B ineligible with CGPA reason", row("B")?.eligible === false && /CGPA/.test(row("B").reasons[0]), JSON.stringify(row("B")));
t("opted-out C never appears", row("C") === undefined);
t("exception for opted-out refused", (await call("POST", `/api/drives/${did}/exceptions`, { studentId: by("C").id, reason: "please let him in" })).s === 400);
t("exception needs reason", (await call("POST", `/api/drives/${did}/exceptions`, { studentId: by("B").id })).s === 400);
t("exception for eligible refused", (await call("POST", `/api/drives/${did}/exceptions`, { studentId: by("A").id, reason: "not needed here" })).s === 400);
const ex = await call("POST", `/api/drives/${did}/exceptions`, { studentId: by("B").id, reason: "Strong project portfolio" }); t("exception for B", ex.s === 200 && ex.j.data.waived.length === 1);
el = (await call("GET", `/api/drives/${did}/eligibility?status=eligible`)).j.data;
t("B eligible via exception", el.counts.viaException >= 1 && el.items.some((i) => i.enrollmentNo === `E${tag}B` && i.viaException));
const exp = await fetch(B + `/api/drives/${did}/eligibility/export`, { headers: auth }); t("eligible export xlsx", exp.status === 200 && (await exp.arrayBuffer()).byteLength > 1000);

t("apply A", (await call("POST", `/api/drives/${did}/applications`, { studentId: by("A").id })).s === 200);
t("apply A again 409", (await call("POST", `/api/drives/${did}/applications`, { studentId: by("A").id })).s === 409);
t("apply B via exception", (await call("POST", `/api/drives/${did}/applications`, { studentId: by("B").id })).s === 200);
t("apply C refused", (await call("POST", `/api/drives/${did}/applications`, { studentId: by("C").id })).s === 400);
const apps = (await call("GET", `/api/drives/${did}/applications`)).j.data; t("applicants listed with cgpa", apps.length === 2 && apps.some((a) => a.student.cgpa === 8.5));
const dec = await call("POST", `/api/drives/${did}/applications/decide`, { applicationIds: apps.map((a) => a.id), status: "SHORTLISTED" }); t("shortlist both", dec.j.data?.updated === 2, JSON.stringify(dec.j));
t("shortlist idempotent", (await call("POST", `/api/drives/${did}/applications/decide`, { applicationIds: apps.map((a) => a.id), status: "SHORTLISTED" })).j.data?.updated === 0);
t("reject A", (await call("POST", `/api/drives/${did}/applications/decide`, { applicationIds: [apps.find((a) => a.student.cgpa === 8.5).id], status: "REJECTED" })).j.data?.updated === 1);
const ap = await fetch(B + `/api/drives/${did}/applications/export`, { headers: auth }); t("applicants export", ap.status === 200);
t("non-applicants", (await call("GET", `/api/drives/${did}/non-applicants`)).s === 200);

t("PATCH keeps rules (allowPlaced, departments)", await (async () => { await call("PATCH", `/api/drives/${did}`, { role: "SDE II" }); const d = (await call("GET", `/api/drives/${did}`)).j.data; return d.role === "SDE II" && d.allowPlaced === true && d.departmentIds.length === 1 && d.rounds.length === 3; })());
t("replace rounds", (await call("PUT", `/api/drives/${did}/rounds`, { rounds: [{ type: "CODING" }, { type: "HR" }] })).j.data?.length === 2);
const pdf = new FormData(); pdf.append("file", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), "jd.pdf");
t("upload JD", (await call("POST", `/api/drives/${did}/documents`, null, pdf)).s === 200);
t("JD has signed url", !!(await call("GET", `/api/drives/${did}`)).j.data.documents[0]?.url);
t("bad file type refused", await (async () => { const f = new FormData(); f.append("file", new Blob(["x"], { type: "text/html" }), "x.html"); return (await call("POST", `/api/drives/${did}/documents`, null, f)).s === 400; })());

const dup = await call("POST", `/api/drives/${did}/duplicate`); t("duplicate is draft with rounds", dup.s === 200 && dup.j.data.status === "DRAFT");
t("cancel needs reason", (await call("POST", `/api/drives/${dup.j.data.id}/cancel`, {})).s === 400);
t("cancel duplicate", (await call("POST", `/api/drives/${dup.j.data.id}/cancel`, { reason: "Company postponed" })).s === 200);
t("feedback before drive refused", (await call("PUT", `/api/drives/${did}/feedback`, { onProcess: "x" })).s === 409);
t("close", (await call("POST", `/api/drives/${did}/close`)).s === 200);
t("edit closed 409", (await call("PATCH", `/api/drives/${did}`, { role: "x1" })).s === 409);
t("feedback after close", (await call("PUT", `/api/drives/${did}/feedback`, { onProcess: "Smooth", improvements: "Earlier schedule" })).s === 200);
const cd = (await call("GET", `/api/companies/${cid}`)).j.data; t("company history", cd.history.driveCount === 1 && cd.history.years.length === 1);
console.log(fails ? `${fails} FAILED` : "ALL PASSED");

// shared helpers for end-to-end scripts that use both staff and student logins
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
export const B = process.env.BASE_URL ?? "http://localhost:3111";
export const day = 86400000;
export const tag = Date.now().toString().slice(-6);
const anon = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
export async function login(email, password) {
  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  if (error) throw new Error("login failed " + email + ": " + error.message);
  return data.session.access_token;
}
export function client(token, base = B) {
  return async (m, p, body, raw, headers) => {
    const r = await fetch(base + p, { method: m, headers: headers ?? (raw ? { authorization: "Bearer " + token } : { authorization: "Bearer " + token, "content-type": "application/json" }), body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const ct = r.headers.get("content-type") ?? ""; const buf = Buffer.from(await r.arrayBuffer());
    let j; if (ct.includes("json")) { try { j = JSON.parse(buf.toString()); } catch { j = null; } }
    return { s: r.status, j, d: j?.data, code: j?.error?.code, ct, buf };
  };
}
export const upload = (name, text, type) => { const f = new FormData(); f.append("file", new Blob([text], type ? { type } : undefined), name); return f; };
export function checker() {
  let fails = 0;
  return { t: (name, ok, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : String(extra).slice(0, 300)); }, done: () => { console.log(fails ? `${fails} FAILED` : "ALL PASSED"); return fails; } };
}
/** Creates students via CSV import, gives each a Supabase login and returns { ids, tokens } */
export async function makeStudents(staff, n, prefix, { login: doLogin = true } = {}) {
  let csv = "enrollment_no,name,email,phone,department_code,batch_name,program_code\n";
  const letters = "ABCDEFGHIJ".slice(0, n);
  for (const c of letters) csv += `${prefix}${tag}${c},${prefix} ${c},${prefix.toLowerCase()}${tag}${c.toLowerCase()}@example.com,,CSE,2021-2025,\n`;
  const pv = await staff("POST", "/api/students/import/preview", null, upload("s.csv", csv)); await staff("POST", `/api/students/import/${pv.d.jobId}/confirm`);
  const list = (await staff("GET", `/api/students?q=${prefix}${tag}&limit=20`)).d.items;
  const ids = {}, emails = {}, tokens = {};
  for (const c of letters) { const s = list.find((x) => x.enrollmentNo === `${prefix}${tag}${c}`); ids[c] = s.id; emails[c] = s.email; }
  if (doLogin) {
    const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
    for (const c of letters) {
      const password = "Stud-" + tag + c + "-pw!";
      const { data, error } = await admin.auth.admin.createUser({ email: emails[c], password, email_confirm: true });
      if (error) throw new Error("create auth user: " + error.message);
      await pgc.query(`update "Student" set "userId"=$1, "inviteStatus"='SENT' where id=$2`, [data.user.id, ids[c]]);
      tokens[c] = await login(emails[c], password);
    }
    await pgc.end();
  }
  return { ids, emails, tokens, letters };
}
export async function onboard(staff, id, cgpa = 8) {
  await staff("PUT", `/api/students/${id}/sections/ACADEMICS`, { data: { cgpa, tenthPercentage: 85, twelfthPercentage: 85, activeBacklogs: 0 }, submit: true });
  await staff("PUT", `/api/students/${id}/sections/PERSONAL`, { data: { dob: "2003-01-01" }, submit: true });
  await staff("POST", `/api/students/${id}/sections/ACADEMICS/approve`, {}); await staff("POST", `/api/students/${id}/sections/PERSONAL/approve`, {});
  return staff("POST", `/api/students/${id}/onboard`);
}

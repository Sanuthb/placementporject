// FX-01 (Gate 4 WP-01): fixtures for tenant-isolation and access-control tests. Local Docker stack only; synthetic data only.
// `ins` writes a row into ANY table using the table's real columns (it fills id and updatedAt when the table has them, and JSON columns are serialised), so a fixture needs only the
// columns that matter. Every row it creates carries the test's tag in its text so a leak is visible in a response body.
import pg from "pg";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

export const MODULES = ["ONBOARDING", "PSYCHOMETRICS", "DRIVES", "ATTENDANCE_BLOCKING", "ANALYTICS", "ASSESSMENTS", "EMPLOYER_CRM", "STUDENT_PREP", "INTERNSHIPS", "EVENTS", "LEARNING", "RECRUITER_PORTAL", "TALENT_SHOWCASE"];
const WIN = process.platform === "win32";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function localOnly() {
  for (const k of ["SUPABASE_URL", "DIRECT_URL"]) {
    const h = /^[a-z]+:\/\/(?:[^/@]*@)?(\[[^\]]*\]|[^/:?#]*)/i.exec(process.env[k] ?? "")?.[1]?.replace(/^\[|\]$/g, "").toLowerCase();
    if (!["localhost", "127.0.0.1", "::1"].includes(h ?? "")) { console.error(`Refusing: ${k} is not the isolated local stack`); process.exit(2); }
  }
}

export async function connect() {
  localOnly();
  const pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect();
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const meta = new Map();
  const cols = async (table) => { if (!meta.has(table)) meta.set(table, new Map((await pgc.query(`select column_name c, data_type d from information_schema.columns where table_schema='public' and table_name=$1`, [table])).rows.map((r) => [r.c, r.d]))); return meta.get(table); };
  const rows = async (sql, a = []) => (await pgc.query(sql, a)).rows;
  const ins = async (table, obj) => {
    const c = await cols(table); if (!c.size) throw new Error("no such table " + table);
    const data = { ...obj };
    if (c.has("id") && data.id === undefined) data.id = "__uuid__";
    if (c.has("updatedAt") && data.updatedAt === undefined) data.updatedAt = "__now__";
    const keys = Object.keys(data); const ph = []; const vals = [];
    for (const k of keys) {
      if (!c.has(k)) throw new Error(`${table} has no column ${k}`);
      if (data[k] === "__uuid__") ph.push("gen_random_uuid()"); else if (data[k] === "__now__") ph.push("now()");
      else { const t = c.get(k); vals.push(t === "json" || t === "jsonb" ? JSON.stringify(data[k]) : data[k]); ph.push(`$${vals.length}`); }
    }
    return (await pgc.query(`insert into "${table}" (${keys.map((k) => `"${k}"`).join(",")}) values (${ph.join(",")}) returning *`, vals)).rows[0]?.id;
  };
  const login = async (email, password) => { const { data, error } = await anon().auth.signInWithPassword({ email, password }); if (error) throw new Error("login failed " + email + ": " + error.message); return data.session.access_token; };
  const mkAuth = async (email, password) => { const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw new Error("createUser " + email + ": " + error.message); return data.user.id; };
  return { pgc, sb, rows, ins, login, mkAuth, n1: async (sql, a = []) => (await rows(sql, a))[0]?.n };
}

/** An institution with every module switched on, an administrator, two departments and logged-in students (s1, s2 in D1; s3 in D2). */
export async function mkInstitution(env, label, tag, pw, made) {
  const { ins, mkAuth, login } = env; const L = label.toUpperCase();
  const college = await ins("College", { name: `ISO ${L} ${tag}`, slug: `iso-${label.toLowerCase()}-${tag}` }); made.colleges.push(college);
  await ins("CollegeSettings", { collegeId: college });
  for (const m of MODULES) await ins("CollegeModule", { collegeId: college, module: m, enabled: true });
  const d1 = await ins("Department", { collegeId: college, name: `ISO-${L}-${tag} Dept 1`, code: "D1" }), d2 = await ins("Department", { collegeId: college, name: `ISO-${L}-${tag} Dept 2`, code: "D2" });
  const batch = await ins("Batch", { collegeId: college, name: `ISO-${L}-${tag} 2022-2026`, startYear: 2022, endYear: 2026 });
  const email = (x) => `iso${x}${label.toLowerCase()}${tag}@example.com`;
  const mkUser = async (x, role, departmentId = null) => { const id = await mkAuth(email(x), pw); made.auth.push(id); await ins("User", { id, collegeId: college, email: email(x), name: `ISO-${L}-${tag} ${x}`, role, extraRoles: [], departmentId }); return { id, email: email(x) }; };
  const inst = { label: L, tag, college, d1, d2, batch, pw };
  inst.admin = await mkUser("adm", "TPO_ADMIN");
  inst.users = { PLACEMENT_OFFICER: await mkUser("po", "PLACEMENT_OFFICER"), DEPARTMENT_COORDINATOR: await mkUser("co", "DEPARTMENT_COORDINATOR", d1), FACULTY: await mkUser("fa", "FACULTY"), PRINCIPAL: await mkUser("pr", "PRINCIPAL") };
  inst.coordinator2 = await mkUser("c2", "DEPARTMENT_COORDINATOR", d2);
  const mkStudent = async (x, dept) => { const id = await mkAuth(email(x), pw); made.auth.push(id); const sid = await ins("Student", { collegeId: college, enrollmentNo: `ISO${L}${tag}${x}`, name: `ISO-${L}-${tag} Student ${x}`, email: email(x), departmentId: dept, batchId: batch, userId: id, inviteStatus: "ACTIVATED" }); return { id: sid, authId: id, email: email(x) }; };
  inst.students = { s1: await mkStudent("s1", d1), s2: await mkStudent("s2", d1), s3: await mkStudent("s3", d2) };
  inst.tokenOf = (u) => login(u.email, pw);
  return inst;
}

export async function cleanupInstitutions(env, made) {
  const { pgc, sb } = env;
  const tables = (await pgc.query(`select c.table_name t from information_schema.columns c join information_schema.tables x on x.table_name=c.table_name and x.table_schema=c.table_schema and x.table_type='BASE TABLE' where c.table_schema='public' and c.column_name='collegeId'`)).rows.map((r) => r.t);
  for (const col of made.colleges) {
    // delete children first by repeating until nothing more can be removed (foreign keys decide the order)
    let left = tables.filter((t) => t !== "College"); for (let pass = 0; pass < 8 && left.length; pass++) { const still = []; for (const t of left) { try { await pgc.query(`delete from "${t}" where "collegeId"=$1`, [col]); } catch { still.push(t); } } left = still; }
    await pgc.query(`delete from "College" where id=$1`, [col]).catch(() => {});
  }
  for (const a of made.auth) await sb.auth.admin.deleteUser(a).catch(() => {});
}

// ---------------- a local production server ----------------
export function startProd(port, extra = {}) {
  const env = { ...process.env, PORT: String(port), NODE_ENV: "production", REQUIRE_LOCAL_DB: "true", APP_URL: `http://localhost:${port}`, FLOOD_MAX_PER_MINUTE: "1000000", ...extra };
  const p = spawn(WIN ? "npx.cmd" : "npx", ["next", "start", "-p", String(port)], { env, detached: !WIN, stdio: "ignore", shell: WIN, windowsHide: true });
  const stop = () => { try { if (WIN) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-p.pid); } catch { /* gone */ } };
  process.on("exit", stop);
  return { base: `http://localhost:${port}`, stop };
}
export const portFree = (port) => new Promise((r) => { const s = net.createServer().once("error", () => r(false)).once("listening", () => s.close(() => r(true))).listen(port, "127.0.0.1"); });
export async function waitUp(base) { for (let i = 0; i < 120; i++) { try { if ((await fetch(base + "/api/health/live")).ok) return true; } catch { /* not yet */ } await sleep(1000); } return false; }

/** A minimal HTTP caller: returns { s, j, text }. */
export function caller(base, token) {
  return async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    return { s: r.status, j, text, ct: r.headers.get("content-type") ?? "" };
  };
}
export const hmac = (secret, data) => createHmac("sha256", secret).update(data).digest("base64url");

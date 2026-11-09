// Local-only fixtures for manual browser checks: a faculty login, and two students in the CSE / BE / 2021-2025 structure that reset.mjs creates.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const c = new pg.Client({ connectionString: process.env.DIRECT_URL }); await c.connect();
const col = (await c.query(`select id from "College" where slug='demo-college'`)).rows[0].id;
const { data } = await sb.auth.admin.createUser({ email: "faculty@e2e.test", password: "Faculty-pass-12!", email_confirm: true });
await c.query(`insert into "User"(id,"collegeId",email,name,role,"updatedAt") values ($1,$2,'faculty@e2e.test','Fiona Faculty','FACULTY',now())`, [data.user.id, col]);
await c.query(`insert into "FacultyProfile"("userId","collegeId","updatedAt") values ($1,$2,now())`, [data.user.id, col]);
const dept = (await c.query(`select id from "Department" where code='CSE' and "collegeId"=$1`, [col])).rows[0].id;
const prog = (await c.query(`select id from "Program" where code='BE' and "collegeId"=$1`, [col])).rows[0].id;
const batch = (await c.query(`select id from "Batch" where name='2021-2025' and "collegeId"=$1`, [col])).rows[0].id;
for (const [n, e] of [["Asha Mentee", "asha"], ["Ravi Student", "ravi"]]) await c.query(`insert into "Student"(id,"collegeId","enrollmentNo",name,email,"departmentId","programId","batchId","updatedAt") values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,now())`, [col, "BR" + e, n, e + "@e2e.test", dept, prog, batch]);
console.log("fixtures ok");
await c.end();

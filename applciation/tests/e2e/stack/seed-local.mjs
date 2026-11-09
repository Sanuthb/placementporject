// Local-only seed: one college, every module, one TPO admin with a password. Like prisma/seed.ts but without storage buckets.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
for (const k of ["SUPABASE_URL", "DIRECT_URL"]) if (!/localhost|127\.0\.0\.1/.test(process.env[k] ?? "")) { console.error(`Refusing: ${k} is not local`); process.exit(2); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const c = new pg.Client({ connectionString: process.env.DIRECT_URL }); await c.connect();
for (const n of ["student-documents", "drive-documents", "offer-letters"]) { const r = await sb.storage.createBucket(n, { public: false }); if (r.error && !/already exists/i.test(r.error.message)) throw r.error; }
const email = process.env.SEED_ADMIN_EMAIL;
let id = (await c.query(`select id from "User" where email=$1`, [email])).rows[0]?.id;
if (!id) {
  const { data, error } = await sb.auth.admin.createUser({ email, password: process.env.SEED_ADMIN_PASSWORD, email_confirm: true });
  if (error) throw error;
  id = data.user.id;
  const college = (await c.query(`insert into "College"(id,name,slug,"updatedAt") values (gen_random_uuid(),$1,'demo-college',now()) returning id`, [process.env.SEED_COLLEGE_NAME])).rows[0].id;
  await c.query(`insert into "CollegeModule"("collegeId",module) select $1, unnest(enum_range(null::"ModuleKey"))`, [college]);
  await c.query(`insert into "User"(id,"collegeId",email,name,role,"updatedAt") values ($1,$2,$3,$4,'TPO_ADMIN',now())`, [id, college, email, process.env.SEED_ADMIN_NAME]);
}
console.log("seeded", email);
await c.end();

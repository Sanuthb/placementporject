// Creates the first college, enables all modules, and creates a TPO admin who can sign in.
// Usage: SEED_COLLEGE_NAME="..." SEED_ADMIN_EMAIL="..." SEED_ADMIN_NAME="..." SEED_ADMIN_PASSWORD="..." npm run db:seed
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { ModuleKey, PrismaClient } from "../generated/prisma/client";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
};

async function main() {
  const collegeName = need("SEED_COLLEGE_NAME");
  const email = need("SEED_ADMIN_EMAIL").toLowerCase();
  const name = need("SEED_ADMIN_NAME");
  const password = need("SEED_ADMIN_PASSWORD");
  if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters");
  const slug = collegeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const sb = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const college = await db.college.upsert({ where: { slug }, update: {}, create: { name: collegeName, slug } });
  for (const key of Object.values(ModuleKey)) {
    await db.collegeModule.upsert({ where: { collegeId_module: { collegeId: college.id, module: key } }, update: {}, create: { collegeId: college.id, module: key } });
  }

  // Private buckets: student proof documents and drive attachments.
  for (const name of ["student-documents", "drive-documents", "offer-letters"]) {
    const bucket = await sb.storage.createBucket(name, { public: false });
    if (bucket.error && !/already exists/i.test(bucket.error.message)) throw bucket.error;
  }

  let authId: string | undefined;
  const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) authId = created.data.user.id;
  else {
    // Already registered: reuse the existing auth user.
    const list = await sb.auth.admin.listUsers({ perPage: 1000 });
    authId = list.data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!authId) throw new Error(`Could not create or find auth user: ${created.error?.message}`);
  }

  await db.user.upsert({
    where: { id: authId },
    update: {},
    create: { id: authId, collegeId: college.id, email, name, role: "TPO_ADMIN" },
  });
  console.log(`Seeded college "${college.name}" (${college.id}) with TPO admin ${email}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});

// Adds a platform administrator: the only way to grant the right to create institutions. Nothing in the API does this.
// Usage: PLATFORM_ADMIN_EMAIL="..." PLATFORM_ADMIN_NAME="..." PLATFORM_ADMIN_PASSWORD="..." npm run db:platform-admin
// The login is a Supabase auth user with no college; it can sign in to /platform and nowhere else.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../generated/prisma/client";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Set ${k}`); return v; };

async function main() {
  const email = need("PLATFORM_ADMIN_EMAIL").toLowerCase();
  const name = need("PLATFORM_ADMIN_NAME");
  const password = need("PLATFORM_ADMIN_PASSWORD");
  if (password.length < 12) throw new Error("PLATFORM_ADMIN_PASSWORD must be at least 12 characters");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const sb = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  const id = created.data.user?.id;
  if (!id) throw new Error(`Could not create the login (an existing college user's email cannot be reused): ${created.error?.message}`);
  await db.platformAdmin.create({ data: { id, email, name } });
  await db.platformAuditLog.create({ data: { adminId: id, email, action: "platform.admin.created", detail: { by: "cli" } } });
  console.log(`Platform administrator ${email} created`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });

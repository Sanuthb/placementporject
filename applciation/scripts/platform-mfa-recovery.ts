// Recovery for a platform administrator who lost their authenticator. Needs server access (the service-role key), which is the trust anchor:
// no API can do this. It removes every authenticator, so the administrator is refused platform access until they enrol a new one.
// Usage: PLATFORM_ADMIN_EMAIL="..." PLATFORM_RECOVERY_CONFIRM="<same email>" npm run db:platform-mfa-recovery
// Do this with the administrator present (confirm their identity out of band): the next person to sign in with their password can enrol.
import "dotenv/config";
import os from "node:os";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../generated/prisma/client";

const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Set ${k}`); return v; };

async function main() {
  const email = need("PLATFORM_ADMIN_EMAIL").toLowerCase();
  if (need("PLATFORM_RECOVERY_CONFIRM").toLowerCase() !== email) throw new Error("PLATFORM_RECOVERY_CONFIRM must repeat the email exactly");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const sb = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const admin = await db.platformAdmin.findUnique({ where: { email } });
  if (!admin) throw new Error("No platform administrator with that email");
  const { data, error } = await sb.auth.admin.mfa.listFactors({ userId: admin.id });
  if (error) throw new Error(`Could not read factors: ${error.message}`);
  for (const f of data.factors) {
    const r = await sb.auth.admin.mfa.deleteFactor({ id: f.id, userId: admin.id });
    if (r.error) throw new Error(`Could not remove a factor: ${r.error.message}`);
  }
  await db.platformAuditLog.create({ data: { adminId: admin.id, email, action: "platform.mfa.recovery", detail: { factorsRemoved: data.factors.length, by: `cli:${os.userInfo().username}@${os.hostname()}` } } });
  console.log(`Removed ${data.factors.length} authenticator(s) for ${email}. They must set up a new one at /platform before they can continue.`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });

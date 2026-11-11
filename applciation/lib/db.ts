import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { assertLocalTargets } from "@/lib/localOnly";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  // REQUIRE_LOCAL_DB=true (set in .env.local) makes a wrong environment fail at the first database use instead of reaching a hosted database. Not bypassable.
  if (process.env.REQUIRE_LOCAL_DB === "true") assertLocalTargets(process.env, { strict: true, what: "open a database connection" });
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 10) });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

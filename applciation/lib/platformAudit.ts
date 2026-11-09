import { db } from "@/lib/db";
import { clientIp } from "@/lib/rateLimit";
import type { Prisma } from "@/generated/prisma/client";

/** Writes one line to the platform security trail. Never throws: a logging failure must not change the outcome of a sign-in step. */
export async function platformAudit(e: { adminId?: string | null; email?: string | null; action: string; detail?: Prisma.InputJsonValue; req?: Request }) {
  try {
    await db.platformAuditLog.create({ data: { adminId: e.adminId ?? null, email: e.email ?? null, action: e.action, detail: e.detail, ip: e.req ? clientIp(e.req) : null } });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "platform audit write failed", action: e.action, error: (err as Error).message }));
  }
}

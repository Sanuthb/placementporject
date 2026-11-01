import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type Client = Pick<typeof db, "auditLog">;

/** Pass a transaction client as `tx` so the log commits atomically with the change. */
export function audit(
  session: { collegeId: string; userId: string | null },
  entry: {
    action: string;
    entity: string;
    entityId?: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    reason?: string;
  },
  tx: Client = db,
) {
  return tx.auditLog.create({
    data: { collegeId: session.collegeId, actorId: session.userId, ...entry },
  });
}

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, notFound } from "@/lib/api/errors";
import type { Session } from "@/lib/auth/session";

type Tx = Prisma.TransactionClient;

/**
 * Deletes one record the caller's college owns, in one transaction with its audit entry.
 * `blockers` returns a reason when something still depends on the record; the delete is then refused with 409
 * so the screen can suggest deactivating instead. A foreign-key failure from the database is treated the same way.
 */
export async function removeOwned(s: Session, o: {
  entity: string; label: string; id: string; action: string;
  find: (tx: Tx) => Promise<{ name?: string | null } | null>;
  blockers?: (tx: Tx) => Promise<string | null>;
  remove: (tx: Tx) => Promise<unknown>;
}) {
  try {
    return await db.$transaction(async (tx) => {
      const row = await o.find(tx);
      if (!row) throw notFound(`${o.label} not found`);
      const why = await o.blockers?.(tx);
      if (why) throw new ApiError(409, "IN_USE", `${why} Deactivate it instead of deleting.`);
      await o.remove(tx);
      await audit(s, { action: o.action, entity: o.entity, entityId: o.id, before: { name: row.name ?? o.label } }, tx);
      return { deleted: true };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") throw new ApiError(409, "IN_USE", `This ${o.label.toLowerCase()} is still in use. Deactivate it instead of deleting.`);
    throw e;
  }
}

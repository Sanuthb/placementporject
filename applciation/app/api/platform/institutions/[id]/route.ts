import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/api/errors";

const patch = z.object({ isActive: z.boolean() });

/** Switching an institution off blocks every one of its sign-ins (getSession refuses inactive colleges). Nothing is deleted. */
export const PATCH = platformRoute<{ id: string }>({}, async (req, admin, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.college.findUnique({ where: { id } });
    if (!before) throw notFound("Institution not found");
    const after = await tx.college.update({ where: { id }, data, select: { id: true, name: true, slug: true, isActive: true } });
    await audit({ collegeId: id, userId: null, platformActorId: admin.adminId }, { action: data.isActive ? "institution.activate" : "institution.deactivate", entity: "College", entityId: id, before: { isActive: before.isActive }, after: { isActive: data.isActive } }, tx);
    return after;
  });
});

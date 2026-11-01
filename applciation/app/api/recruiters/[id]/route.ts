import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { setLoginBlocked } from "@/lib/supabase-admin";

const patch = z.object({ isActive: z.boolean() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "RECRUITER_PORTAL" }, async (req, s, { id }) => {
  const { isActive } = await parseBody(req, patch);
  const r = await db.recruiter.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!r) throw notFound("Recruiter not found");
  await db.$transaction(async (tx) => {
    await tx.recruiter.update({ where: { id }, data: { isActive } });
    await audit(s, { action: isActive ? "recruiter.reactivate" : "recruiter.deactivate", entity: "Recruiter", entityId: id }, tx);
  });
  await setLoginBlocked(id, !isActive).catch(() => undefined);
  return { id, isActive };
});

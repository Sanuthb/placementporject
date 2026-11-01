import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const patch = z.object({ title: z.string().trim().min(3).max(200).optional(), body: z.string().trim().min(3).max(10_000).optional(), expiresAt: z.coerce.date().nullable().optional(), isActive: z.boolean().optional() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const r = await tx.announcement.updateMany({ where: { id, collegeId: s.collegeId }, data });
    if (r.count === 0) throw notFound("Announcement not found");
    await audit(s, { action: data.isActive === false ? "announcement.withdraw" : "announcement.update", entity: "Announcement", entityId: id }, tx);
    return tx.announcement.findUniqueOrThrow({ where: { id } });
  });
});

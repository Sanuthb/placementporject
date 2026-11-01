import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/api/errors";

const patch = z.object({ name: z.string().trim().min(4).max(20).optional(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), isCurrent: z.boolean().optional() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.academicYear.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Academic year not found");
    if ((data.endDate ?? before.endDate) <= (data.startDate ?? before.startDate)) throw badRequest("endDate must be after startDate");
    if (data.isCurrent) await tx.academicYear.updateMany({ where: { collegeId: s.collegeId, isCurrent: true, id: { not: id } }, data: { isCurrent: false } });
    const after = await tx.academicYear.update({ where: { id }, data });
    await audit(s, { action: "academicYear.update", entity: "AcademicYear", entityId: id, before: { name: before.name, isCurrent: before.isCurrent }, after: { ...data } as object }, tx);
    return after;
  });
});

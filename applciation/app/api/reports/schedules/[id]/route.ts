import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ReportFrequency } from "@/generated/prisma/client";

const patch = z.object({ frequency: z.enum(ReportFrequency).optional(), recipients: z.array(z.email().transform((e) => e.toLowerCase())).min(1).max(20).optional(), isActive: z.boolean().optional() });
const R = { roles: ["TPO_ADMIN"] as "TPO_ADMIN"[], module: "ANALYTICS" as const };

export const PATCH = route<{ id: string }>(R, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  const r = await db.reportSchedule.updateMany({ where: { id, collegeId: s.collegeId }, data });
  if (r.count === 0) throw notFound("Schedule not found");
  await audit(s, { action: "reportSchedule.update", entity: "ReportSchedule", entityId: id, after: data as object });
  return db.reportSchedule.findUniqueOrThrow({ where: { id } });
});

export const DELETE = route<{ id: string }>(R, async (_req, s, { id }) => {
  const r = await db.reportSchedule.deleteMany({ where: { id, collegeId: s.collegeId } });
  if (r.count === 0) throw notFound("Schedule not found");
  await audit(s, { action: "reportSchedule.delete", entity: "ReportSchedule", entityId: id });
  return { deleted: true };
});

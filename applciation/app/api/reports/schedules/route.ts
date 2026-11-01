import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { mailer } from "@/lib/mailer";
import { nextRun } from "@/lib/reports";
import { ReportFrequency, ReportType } from "@/generated/prisma/client";

const create = z.object({ type: z.enum(ReportType), frequency: z.enum(ReportFrequency), recipients: z.array(z.email().transform((e) => e.toLowerCase())).min(1).max(20), firstRunAt: z.coerce.date().optional() });
const R = { roles: ["TPO_ADMIN"] as "TPO_ADMIN"[], module: "ANALYTICS" as const };

export const GET = route(R, (_req, s) => db.reportSchedule.findMany({ where: { collegeId: s.collegeId }, orderBy: { createdAt: "desc" } }));

export const POST = route(R, async (req, s) => {
  const b = await parseBody(req, create);
  mailer(); // fail now, not at the first scheduled run, if email is not configured
  const nextRunAt = b.firstRunAt ?? nextRun(new Date(), b.frequency);
  return db.$transaction(async (tx) => {
    const r = await tx.reportSchedule.create({ data: { collegeId: s.collegeId, type: b.type, frequency: b.frequency, recipients: [...new Set(b.recipients)], nextRunAt, createdById: s.userId } });
    await audit(s, { action: "reportSchedule.create", entity: "ReportSchedule", entityId: r.id, after: { type: b.type, frequency: b.frequency } }, tx);
    return r;
  });
});

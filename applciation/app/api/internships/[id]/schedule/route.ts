import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { INT_ADMIN, internshipOf } from "@/lib/internshipService";

/** Sets the schedule: working days (0 = Sunday to 6 = Saturday), hours in a day, dates and a note. Dates cannot change once the internship is over. */
export const PATCH = route<{ id: string }>(INT_ADMIN, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const b = await parseBody(req, z.object({ workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(), hoursPerDay: z.number().int().min(1).max(12).optional(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), scheduleNote: z.string().trim().max(1000).nullish(), stipendInr: z.number().int().min(0).max(1_000_000).nullish() }));
  if (i.status === "COMPLETED" || i.status === "TERMINATED") throw badRequest("This internship is over");
  const start = b.startDate ?? i.startDate, end = b.endDate ?? i.endDate;
  if (end <= start) throw badRequest("The end date must be after the start date");
  await db.internship.update({ where: { id }, data: { ...b, ...(b.workDays ? { workDays: [...new Set(b.workDays)].sort() } : {}) } });
  await audit(s, { action: "internship.schedule", entity: "Internship", entityId: id, after: { workDays: b.workDays, startDate: b.startDate, endDate: b.endDate } });
  return { ok: true };
});

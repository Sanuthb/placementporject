import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";

const body = z.object({ weekStart: z.coerce.date(), hours: z.number().int().min(1).max(80), summary: z.string().trim().min(10).max(3000) });

export const GET = studentRoute<{ id: string }>({ module: "INTERNSHIPS" }, async (_req, me, { id }) => {
  if (!(await db.internship.findFirst({ where: { id, studentId: me.studentId }, select: { id: true } }))) throw notFound("Internship not found");
  return db.workLog.findMany({ where: { internshipId: id }, select: { id: true, weekStart: true, hours: true, summary: true, status: true, reviewComment: true }, orderBy: { weekStart: "asc" } });
});

/** Weekly log. A rejected log can be corrected and resubmitted; an approved one is locked. */
export const POST = studentRoute<{ id: string }>({ module: "INTERNSHIPS" }, async (req, me, { id }) => {
  const b = await parseBody(req, body);
  const i = await db.internship.findFirst({ where: { id, studentId: me.studentId } });
  if (!i) throw notFound("Internship not found");
  if (i.status !== "ONGOING") throw new ApiError(409, "CONFLICT", "Work logs can be added while the internship is ongoing");
  if (b.weekStart < i.startDate || b.weekStart > i.endDate) throw badRequest("That week is outside the internship dates");
  const existing = await db.workLog.findUnique({ where: { internshipId_weekStart: { internshipId: id, weekStart: b.weekStart } } });
  if (existing && existing.status !== "REJECTED") throw new ApiError(409, "CONFLICT", `A log for that week is already ${existing.status.toLowerCase()}`);
  return db.$transaction(async (tx) => {
    const log = existing
      ? await tx.workLog.update({ where: { id: existing.id }, data: { hours: b.hours, summary: b.summary, status: "SUBMITTED", reviewComment: null } })
      : await tx.workLog.create({ data: { internshipId: id, weekStart: b.weekStart, hours: b.hours, summary: b.summary } });
    await notifyStaff(me.collegeId, { type: "internship.log", title: `${me.name} submitted a work log`, link: `/internships/${id}`, departmentId: me.departmentId }, tx);
    return { id: log.id, status: log.status };
  });
});

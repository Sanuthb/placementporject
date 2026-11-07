import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/api/errors";
import { removeOwned } from "@/lib/api/remove";
import { SESSION_STATUS } from "@/lib/api/academic";

const patch = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  academicYearId: z.uuid().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  status: z.enum(SESSION_STATUS).optional(),
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.semester.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Semester not found");
    if (data.academicYearId && !(await tx.academicYear.findFirst({ where: { id: data.academicYearId, collegeId: s.collegeId } }))) throw badRequest("Academic year not found");
    const start = data.startDate === undefined ? before.startDate : data.startDate;
    const end = data.endDate === undefined ? before.endDate : data.endDate;
    if (start && end && end <= start) throw badRequest("The end date must be after the start date");
    const after = await tx.semester.update({ where: { id }, data });
    await audit(s, { action: "semester.update", entity: "Semester", entityId: id, before: { name: before.name, status: before.status }, after: data as object }, tx);
    return after;
  });
});

export const DELETE = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, (_req, s, { id }) => removeOwned(s, {
  entity: "Semester", label: "Semester", id, action: "semester.delete",
  find: (tx) => tx.semester.findFirst({ where: { id, collegeId: s.collegeId } }),
  blockers: async (tx) => {
    const [now, history] = await Promise.all([tx.student.count({ where: { currentSemesterId: id } }), tx.studentProgression.count({ where: { semesterId: id } })]);
    return now || history ? `${now} students are in this semester and ${history} progression records refer to it.` : null;
  },
  remove: (tx) => tx.semester.delete({ where: { id } }),
}));

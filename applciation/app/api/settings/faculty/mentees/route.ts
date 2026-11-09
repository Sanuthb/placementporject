import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/api/errors";
import { loadFaculty } from "@/lib/faculty";

const body = z.object({ facultyId: z.uuid().nullable(), studentIds: z.array(z.uuid()).min(1).max(500) });

/**
 * Assigns students to a mentor, or clears their mentor when facultyId is null. The mentor must be an active faculty member
 * of this college, and each student must be in a department the mentor belongs to.
 */
export const PUT = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const { facultyId, studentIds } = await parseBody(req, body);
  const ids = [...new Set(studentIds)];
  return db.$transaction(async (tx) => {
    const students = await tx.student.findMany({ where: { id: { in: ids }, collegeId: s.collegeId }, select: { id: true, name: true, departmentId: true, mentorId: true } });
    if (students.length !== ids.length) throw badRequest("A student was not found");
    if (facultyId) {
      const f = await loadFaculty(tx, s.collegeId, facultyId);
      if (!f.isActive) throw badRequest("That faculty member is deactivated");
      const depts = new Set((await tx.facultyDepartment.findMany({ where: { userId: facultyId }, select: { departmentId: true } })).map((d) => d.departmentId));
      if (!depts.size) throw badRequest("Assign the faculty member to a department first");
      const out = students.find((st) => !depts.has(st.departmentId));
      if (out) throw badRequest(`${out.name} is not in one of this faculty member's departments`);
    }
    await tx.student.updateMany({ where: { id: { in: ids }, collegeId: s.collegeId }, data: { mentorId: facultyId } });
    await audit(s, { action: facultyId ? "faculty.mentor.assign" : "faculty.mentor.clear", entity: "User", entityId: facultyId ?? undefined, before: { students: students.map((x) => ({ id: x.id, mentorId: x.mentorId })) }, after: { mentorId: facultyId, studentIds: ids } }, tx);
    return { updated: ids.length };
  });
});

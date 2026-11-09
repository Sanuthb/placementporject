import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/api/errors";
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
    // One entry per student, so a student's own assignment history can be read back.
    await tx.auditLog.createMany({ data: students.map((st) => ({ collegeId: s.collegeId, actorId: s.userId, action: facultyId ? "faculty.mentor.assign" : "faculty.mentor.clear", entity: "Student", entityId: st.id, before: { mentorId: st.mentorId }, after: { mentorId: facultyId } })) });
    await audit(s, { action: facultyId ? "faculty.mentor.assign" : "faculty.mentor.clear", entity: "User", entityId: facultyId ?? undefined, before: { students: students.map((x) => ({ id: x.id, mentorId: x.mentorId })) }, after: { mentorId: facultyId, studentIds: ids } }, tx);
    return { updated: ids.length };
  });
});

const query = z.object({ facultyId: z.uuid().optional(), studentId: z.uuid().optional() }).refine((q) => !!q.facultyId !== !!q.studentId, "Give facultyId or studentId");

/** With facultyId: that mentor's students. With studentId: the student's current mentor and the history of changes. Same college only. */
export const GET = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const q = parseQuery(req, query);
  if (q.facultyId) {
    await loadFaculty(db, s.collegeId, q.facultyId);
    return db.student.findMany({ where: { collegeId: s.collegeId, mentorId: q.facultyId }, select: { id: true, name: true, enrollmentNo: true, department: { select: { name: true } }, batch: { select: { name: true } } }, orderBy: { name: "asc" } });
  }
  const st = await db.student.findFirst({ where: { id: q.studentId, collegeId: s.collegeId }, select: { id: true, name: true, mentor: { select: { id: true, name: true, email: true, isActive: true } } } });
  if (!st) throw notFound("Student not found");
  const rows = await db.auditLog.findMany({ where: { collegeId: s.collegeId, entity: "Student", entityId: st.id, action: { in: ["faculty.mentor.assign", "faculty.mentor.clear"] } }, orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { name: true } } } });
  const ids = [...new Set(rows.flatMap((r) => [(r.before as { mentorId?: string | null } | null)?.mentorId, (r.after as { mentorId?: string | null } | null)?.mentorId]).filter((x): x is string => !!x))];
  const names = new Map((await db.user.findMany({ where: { id: { in: ids }, collegeId: s.collegeId }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const nm = (id?: string | null) => (id ? names.get(id) ?? "Unknown" : null);
  return {
    student: { id: st.id, name: st.name }, mentor: st.mentor,
    history: rows.map((r) => ({ at: r.createdAt, by: r.actor?.name ?? null, from: nm((r.before as { mentorId?: string | null } | null)?.mentorId), to: nm((r.after as { mentorId?: string | null } | null)?.mentorId) })),
  };
});

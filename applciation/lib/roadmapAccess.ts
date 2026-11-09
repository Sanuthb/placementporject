import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import { isFacultyOnly, type Session } from "@/lib/auth/session";
import { facultyStudentWhere } from "@/lib/faculty";
import { scopedStudent } from "@/lib/verification";

/**
 * A student whose roadmap this person may read. Placement staff follow their usual scope (coordinators: their department). A faculty member
 * reads their mentees and the students of their allocated programmes and batches (the M2 boundary), and nothing else.
 */
export async function reviewableStudent(s: Session, studentId: string) {
  if (isFacultyOnly(s)) {
    const scope = await facultyStudentWhere(s.collegeId, s.userId);
    const st = await db.student.findFirst({ where: { AND: [scope, { id: studentId }] }, select: { id: true, name: true, mentorId: true } });
    if (!st) throw notFound("Student not found");
    return st;
  }
  const st = await scopedStudent(s, studentId);
  return { id: st.id, name: st.name, mentorId: st.mentorId };
}

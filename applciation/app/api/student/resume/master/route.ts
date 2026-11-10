import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { driftOf, loadMaster } from "@/lib/resumeService";

/**
 * My master career profile: everything a resume can say, with each skill marked verified (staff checked it), evidenced (a project, course, internship, assessment or
 * achievement backs it) or claimed (only I say so). It updates by itself as I finish courses, projects and internships. `changes` lists what is new since my main resume.
 */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const [master, primary] = await Promise.all([loadMaster(me.collegeId, me.studentId), db.resumeVersion.findFirst({ where: { studentId: me.studentId, isPrimary: true, status: "APPROVED" } })]);
  return { master, changes: primary ? { version: primary.number, title: primary.title, ...driftOf(primary, master) } : null };
});

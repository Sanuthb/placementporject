import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";
import { backlogView, semesterView, type BacklogRow, type SemRow } from "@/lib/academicRecords";

/** A student's semester results (with subject marks) and backlog history, with each record's review state. Review itself is done on the ACADEMICS section. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  const [semesters, backlogs] = await Promise.all([
    db.semesterResult.findMany({ where: { studentId: id, collegeId: s.collegeId }, include: { subjects: true }, orderBy: { semesterNumber: "asc" } }),
    db.backlog.findMany({ where: { studentId: id, collegeId: s.collegeId }, include: { attempts: true }, orderBy: [{ semesterNumber: "asc" }, { createdAt: "asc" }] }),
  ]);
  return { semesters: semesters.map((r) => semesterView(r as unknown as SemRow & { id: string })), backlogs: backlogs.map((b) => backlogView(b as unknown as BacklogRow & { id: string })) };
});

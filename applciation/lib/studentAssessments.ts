import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api/errors";
import { enforceTime, paperQuestions } from "@/lib/assessments";
import type { StudentSession } from "@/lib/auth/student";

/** Whether a schedule is meant for this student. */
export const scheduleOpenTo = (s: { targetStudentIds: string[]; targetDepartmentIds: string[]; targetBatchIds: string[] }, me: { studentId: string; departmentId: string; batchId: string }) =>
  s.targetStudentIds.length ? s.targetStudentIds.includes(me.studentId) : (!s.targetDepartmentIds.length || s.targetDepartmentIds.includes(me.departmentId)) && (!s.targetBatchIds.length || s.targetBatchIds.includes(me.batchId));

/** A schedule the student may take: right department/batch (matched in code, see lib/announcements.ts). */
export async function visibleSchedule(me: StudentSession, id: string) {
  const sch = await db.assessmentSchedule.findFirst({ where: { id, collegeId: me.collegeId }, include: { paper: true } });
  // A personal set (made by the improvement engine) is for the named students only; any other test is for its departments and batches.
  if (!sch || !scheduleOpenTo(sch, me)) throw notFound("Assessment not found");
  return sch;
}

/** The student's newest attempt (the one in progress, if any), after checking time. Time-outs auto-submit and are reported as TIME_UP. */
export async function liveAttempt(me: StudentSession, scheduleId: string) {
  const sch = await visibleSchedule(me, scheduleId);
  const a = await db.assessmentAttempt.findFirst({ where: { scheduleId, studentId: me.studentId }, orderBy: { attemptNumber: "desc" } });
  if (!a) throw new ApiError(409, "NOT_STARTED", "You have not started this assessment");
  await enforceTime(a, paperQuestions(sch.paper.questions));
  return { sch, a };
}

import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api/errors";
import { enforceTime, paperQuestions } from "@/lib/assessments";
import type { StudentSession } from "@/lib/auth/student";

/** A schedule the student may take: right department/batch (matched in code, see lib/announcements.ts). */
export async function visibleSchedule(me: StudentSession, id: string) {
  const sch = await db.assessmentSchedule.findFirst({ where: { id, collegeId: me.collegeId }, include: { paper: true } });
  if (!sch || (sch.targetDepartmentIds.length && !sch.targetDepartmentIds.includes(me.departmentId)) || (sch.targetBatchIds.length && !sch.targetBatchIds.includes(me.batchId))) throw notFound("Assessment not found");
  return sch;
}

/** The student's in-progress attempt, after checking time. Time-outs auto-submit and are reported as TIME_UP. */
export async function liveAttempt(me: StudentSession, scheduleId: string) {
  const sch = await visibleSchedule(me, scheduleId);
  const a = await db.assessmentAttempt.findUnique({ where: { scheduleId_studentId: { scheduleId, studentId: me.studentId } } });
  if (!a) throw new ApiError(409, "NOT_STARTED", "You have not started this assessment");
  await enforceTime(a, paperQuestions(sch.paper.questions));
  return { sch, a };
}

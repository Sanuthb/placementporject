import { studentRoute } from "@/lib/api/studentHandler";
import { jobFor, recordAndHistory, studentJd } from "@/lib/readinessService";

/** My Job-Specific Readiness Score for one job, part by part, with whether I meet the required criteria shown separately and my progress over time. */
export const GET = studentRoute<{ jdId: string }>({ module: "STUDENT_PREP" }, async (_req, me, { jdId }) => {
  const { jd, data } = await studentJd(me, jdId);
  const r = (await jobFor(jd, data, [me.studentId], "student")).get(me.studentId)!;
  const trend = await recordAndHistory(me.collegeId, me.studentId, { kind: "JOB", jdId }, r, true);
  return { job: { id: jd.id, title: jd.title, company: jd.companyName }, readiness: r, trend };
});

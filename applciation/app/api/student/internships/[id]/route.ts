import { studentRoute } from "@/lib/api/studentHandler";
import { internshipDetail, myInternship } from "@/lib/internshipService";

/** One of my internships: schedule, attendance, tasks and feedback, evaluations, certificate and any pre-placement offer. */
export const GET = studentRoute<{ id: string }>({ module: "INTERNSHIPS" }, async (_req, me, { id }) => {
  await myInternship(me, id);
  const d = await internshipDetail(id, "student");
  return { ...d, completionChecks: d.completionChecks.filter((c) => c.key !== "running") };
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { approvedJd } from "@/lib/matchingService";
import { careerFor, jobFor } from "@/lib/readinessService";
import { scopedFullStudent } from "@/lib/student360";

/**
 * A student's readiness for staff: the Career Readiness Index, and with `?jdId=` the Job-Specific Readiness Score for that approved job. Interview scores here come only from
 * interviews the placement office assigned. Personality results are never used.
 */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (req, s, { id }) => {
  const q = parseQuery(req, z.object({ jdId: z.uuid().optional() }));
  await scopedFullStudent(s, id);
  const career = (await careerFor(s.collegeId, [id], "staff")).get(id)!;
  if (!q.jdId) return { career, job: null };
  const { jd, data } = await approvedJd(s.collegeId, q.jdId);
  return { career, job: { id: jd.id, title: jd.title, company: jd.companyName, readiness: (await jobFor(jd, data, [id], "staff")).get(id)! } };
});

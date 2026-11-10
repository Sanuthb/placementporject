import { route } from "@/lib/api/handler";
import { MATCH_ADMIN, approvedJd, matchOne } from "@/lib/matchingService";

/** One student's match in full: eligibility, each requirement with its evidence, the score by parameter, relevant projects and internships, the explanation, approved resumes and what the college offers for the gaps. */
export const GET = route<{ id: string; studentId: string }>(MATCH_ADMIN, async (_req, s, { id, studentId }) => {
  const { jd, data } = await approvedJd(s.collegeId, id);
  return matchOne(jd, data, studentId);
});

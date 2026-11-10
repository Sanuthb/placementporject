import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { MATCH_ADMIN, approvedJd, runMatch } from "@/lib/matchingService";
import { MATCH_LABEL, MATCH_PARAMS } from "@/lib/jd";

/**
 * The ranking for an approved job description. Students who pass the eligibility rules are scored and ranked; each row shows the required-criteria verdict and the skills matched,
 * partly matched and missing. Students who do not pass are listed separately with the reason, not scored. Weights are the job description's own. Ranking is an aid:
 * nothing here selects anyone.
 */
export const GET = route<{ id: string }>({ ...MATCH_ADMIN, limit: { name: "matching", max: 120, windowSec: 3600 } }, async (req, s, { id }) => {
  const q = parseQuery(req, z.object({ departmentId: z.uuid().optional() }));
  const { jd, data } = await approvedJd(s.collegeId, id);
  const r = await runMatch(jd, data, q);
  return { jd: { id: jd.id, title: data.title, company: data.company, driveId: jd.driveId }, weights: MATCH_PARAMS.map((k) => ({ key: k, label: MATCH_LABEL[k], weight: data.scoring[k] })), requirements: data.requirements.length, considered: r.considered, eligible: r.candidates.length, truncated: r.truncated, candidates: r.candidates, ineligible: r.ineligible.slice(0, 300), ineligibleCount: r.ineligible.length };
});

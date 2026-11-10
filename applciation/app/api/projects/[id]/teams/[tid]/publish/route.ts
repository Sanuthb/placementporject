import { route } from "@/lib/api/handler";
import { audit } from "@/lib/audit";
import { PROJ_STAFF, publishResult, teamOf } from "@/lib/projectService";

/** Publishes the result from the final reviews: students then see their scores, and the project joins their portfolio result. */
export const POST = route<{ id: string; tid: string }>(PROJ_STAFF, async (_req, s, { id, tid }) => {
  await teamOf(s, id, tid);
  const r = await publishResult(tid, s.collegeId);
  await audit(s, { action: "project.publish", entity: "Project", entityId: id, after: { teamId: tid, percent: r.teamPercent } });
  return r;
});

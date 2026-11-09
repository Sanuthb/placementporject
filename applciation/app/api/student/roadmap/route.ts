import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ensureRoadmap, ownRoadmap } from "@/lib/roadmapService";
import { roadmapPatch, updateRoadmap } from "@/lib/roadmapChanges";

/** My career roadmap: made from my programme's length the first time, with progress ticked from my own activity. */
export const GET = studentRoute({ module: "ONBOARDING" }, (_req, me) => ownRoadmap(me.collegeId, me.studentId));

/** Set my career goal and target role. */
export const PATCH = studentRoute({ module: "ONBOARDING", limit: { name: "roadmap-write", max: 200, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, roadmapPatch);
  await ensureRoadmap(me.collegeId, me.studentId);
  await updateRoadmap(me.studentId, b, { actor: "STUDENT", actorId: me.studentId });
  return ownRoadmap(me.collegeId, me.studentId);
});

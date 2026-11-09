import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ownRoadmap } from "@/lib/roadmapService";
import { addMilestone, milestoneCreate } from "@/lib/roadmapChanges";

/** Add my own milestone, or accept a suggestion made from my assessment results (send its `suggestionKey`). */
export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "roadmap-write", max: 200, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, milestoneCreate);
  const view = await ownRoadmap(me.collegeId, me.studentId);
  const suggestion = b.suggestionKey ? view.suggestions.find((s) => s.key === b.suggestionKey) ?? null : null;
  const m = await addMilestone(me.studentId, b, suggestion, { actor: "STUDENT", actorId: me.studentId });
  return { id: m.id };
});

import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { addGoal, goalCreate } from "@/lib/roadmapChanges";

export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "roadmap-write", max: 200, windowSec: 3600 } }, async (req, me) => {
  const g = await addGoal(me.studentId, await parseBody(req, goalCreate), { actor: "STUDENT", actorId: me.studentId });
  return { id: g.id };
});

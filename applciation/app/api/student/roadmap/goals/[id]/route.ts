import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { changeGoal, goalPatch, removeGoal } from "@/lib/roadmapChanges";

export const PATCH = studentRoute<{ id: string }>({ module: "ONBOARDING", limit: { name: "roadmap-write", max: 200, windowSec: 3600 } }, async (req, me, { id }) => {
  const g = await changeGoal(me.studentId, id, await parseBody(req, goalPatch), { actor: "STUDENT", actorId: me.studentId });
  return { id: g.id, status: g.status };
});
export const DELETE = studentRoute<{ id: string }>({ module: "ONBOARDING" }, (_req, me, { id }) => removeGoal(me.studentId, id, { actor: "STUDENT", actorId: me.studentId }));

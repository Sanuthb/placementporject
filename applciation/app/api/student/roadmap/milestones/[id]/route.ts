import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { changeMilestone, milestonePatch, removeMilestone } from "@/lib/roadmapChanges";

/** Change one of my milestones: mark it done, in progress or skipped, add a note, or move it to another semester. */
export const PATCH = studentRoute<{ id: string }>({ module: "ONBOARDING", limit: { name: "roadmap-write", max: 400, windowSec: 3600 } }, async (req, me, { id }) => {
  const b = await parseBody(req, milestonePatch);
  const m = await changeMilestone(me.studentId, id, b, { actor: "STUDENT", actorId: me.studentId });
  return { id: m.id, status: m.status, semester: m.semester };
});

/** Remove my own milestone (the plan's standard ones can only be skipped). */
export const DELETE = studentRoute<{ id: string }>({ module: "ONBOARDING" }, (_req, me, { id }) => removeMilestone(me.studentId, id, { actor: "STUDENT", actorId: me.studentId }));

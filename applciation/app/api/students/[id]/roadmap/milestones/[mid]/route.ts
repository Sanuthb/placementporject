import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { forbidden } from "@/lib/api/errors";
import { isFacultyOnly } from "@/lib/auth/session";
import { reviewableStudent } from "@/lib/roadmapAccess";
import { changeMilestone } from "@/lib/roadmapChanges";

const body = z.object({ status: z.enum(["DONE", "PLANNED", "IN_PROGRESS"]), note: z.string().trim().max(500).optional() });

/** Confirm a milestone as done (or reopen it). Only the student's mentor or placement staff; the change is recorded with who made it. */
export const PATCH = route<{ id: string; mid: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY"], module: "ONBOARDING", limit: { name: "roadmap-confirm", max: 300, windowSec: 3600 } }, async (req, s, { id, mid }) => {
  const st = await reviewableStudent(s, id);
  const isMentor = st.mentorId === s.userId;
  if (isFacultyOnly(s) && !isMentor) throw forbidden("Only the student's mentor can confirm their milestones");
  const b = await parseBody(req, body);
  const m = await changeMilestone(id, mid, b, { actor: isMentor ? "MENTOR" : "STAFF", actorId: s.userId });
  return { id: m.id, status: m.status };
});

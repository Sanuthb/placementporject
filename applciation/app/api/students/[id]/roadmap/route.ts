import { route } from "@/lib/api/handler";
import { roadmapView } from "@/lib/roadmapService";
import { reviewableStudent } from "@/lib/roadmapAccess";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER" | "DEPARTMENT_COORDINATOR" | "FACULTY")[], module: "ONBOARDING" as const };

/** A student's roadmap, for the placement staff and the faculty who mentor or teach them. Looking never creates a roadmap. */
export const GET = route<{ id: string }>(R, async (_req, s, { id }) => {
  const st = await reviewableStudent(s, id);
  const view = await roadmapView(s.collegeId, id, "staff", { create: false });
  return { student: { id: st.id, name: st.name, isMentor: st.mentorId === s.userId }, roadmap: view };
});

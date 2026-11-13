import { route } from "@/lib/api/handler";
import { liveForInstitution } from "@/lib/platformAnnouncements";

/** Live platform announcements for the signed-in person's own institution. Scoped by the session's college; targeting is applied on the server. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY", "PRINCIPAL"] }, async (_req, s) => ({ items: await liveForInstitution(s) }));

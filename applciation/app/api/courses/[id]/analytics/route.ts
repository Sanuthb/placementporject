import { route } from "@/lib/api/handler";
import { LMS_STAFF, courseAnalytics } from "@/lib/lmsService";

export const GET = route<{ id: string }>(LMS_STAFF, (_req, s, { id }) => courseAnalytics(s.collegeId, id));

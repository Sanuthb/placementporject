import { route } from "@/lib/api/handler";
import { LMS_STAFF, learningSummary } from "@/lib/lmsService";

/** College-wide learning figures: who is learning, completion, who has gone quiet, by department, and the busiest courses. */
export const GET = route(LMS_STAFF, (_req, s) => learningSummary(s.collegeId));

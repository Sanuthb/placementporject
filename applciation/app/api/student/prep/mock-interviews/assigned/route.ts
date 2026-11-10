import { studentRoute } from "@/lib/api/studentHandler";
import { myAssignments } from "@/lib/interviewService";

/** Interviews the placement office has set up for me. Their reports are visible to staff. */
export const GET = studentRoute({ module: "STUDENT_PREP" }, (_req, me) => myAssignments(me));

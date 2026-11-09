import { studentRoute } from "@/lib/api/studentHandler";
import { completionOf } from "@/lib/profileCompletionLoad";

/** How complete my profile is, what is missing, and the one thing I should do next. Same calculation staff see. */
export const GET = studentRoute({ module: "ONBOARDING" }, (_req, me) => completionOf(me.collegeId, me.studentId));

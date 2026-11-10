import { studentRoute } from "@/lib/api/studentHandler";
import { send } from "@/lib/reportRoutes";
import { discussionReportDoc } from "@/lib/reportService";

/** My report on a discussion, debate or presentation session, as PDF, Word or the online version. My words and the AI's are labelled apart. */
export const GET = studentRoute<{ id: string }>({ module: "STUDENT_PREP" }, async (req, me, { id }) => send(req, await discussionReportDoc({ kind: "student", me }, id)));

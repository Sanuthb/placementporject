import { studentRoute } from "@/lib/api/studentHandler";
import { send } from "@/lib/reportRoutes";
import { interviewReportDoc } from "@/lib/reportService";

/** My report on a mock interview, as PDF, Word or the online version. Student words and AI text are labelled apart. */
export const GET = studentRoute<{ id: string }>({ module: "STUDENT_PREP" }, async (req, me, { id }) => send(req, await interviewReportDoc({ kind: "student", me }, id)));

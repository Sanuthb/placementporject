import { studentRoute } from "@/lib/api/studentHandler";
import { send } from "@/lib/reportRoutes";
import { testReportDoc } from "@/lib/reportService";

/** My report on a test (my newest finished attempt), as PDF, Word or the online version. It shows only what the test's result visibility allows. */
export const GET = studentRoute<{ id: string }>({ module: "ASSESSMENTS" }, async (req, me, { id }) => send(req, await testReportDoc({ kind: "student", me }, id)));

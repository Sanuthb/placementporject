import { studentRoute } from "@/lib/api/studentHandler";
import { improvementPlan, myReport } from "@/lib/testReportService";

/** What to do next after a test (see `improvementPlan`). */
export const GET = studentRoute<{ id: string }>({ module: "ASSESSMENTS" }, async (_req, me, { id }) => improvementPlan(me, id, await myReport(me, id)));

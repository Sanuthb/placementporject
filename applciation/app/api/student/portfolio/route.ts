import { studentRoute } from "@/lib/api/studentHandler";
import { portfolioFor } from "@/lib/projectService";

/** My portfolio: the project work I have submitted, with my role and, once published, my own result. Includes projects I have hidden, marked as hidden. */
export const GET = studentRoute({ module: "LEARNING" }, (_req, me) => portfolioFor(me.studentId));

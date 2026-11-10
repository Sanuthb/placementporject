import { studentRoute } from "@/lib/api/studentHandler";
import { studentHome } from "@/lib/dashboardService";

/** The extra parts of my home page: career readiness, today's tasks, roadmap, learning, skills, test results, interviews, discussions and preparation campaigns. */
export const GET = studentRoute({}, (_req, me) => studentHome(me));

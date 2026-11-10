import { route } from "@/lib/api/handler";
import { readinessSummary } from "@/lib/dashboardService";

/** How career readiness is spread across students (counts per band, and the parts that are weakest), from a fixed sample of up to 300 students. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "PRINCIPAL"], limit: { name: "readiness-summary", max: 20, windowSec: 600 } }, (_req, s) => readinessSummary(s));

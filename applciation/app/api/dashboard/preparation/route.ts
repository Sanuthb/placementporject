import { route } from "@/lib/api/handler";
import { preparationDashboard } from "@/lib/dashboardService";

/** Preparation at a glance for the placement office: jobs and shortlists, campaigns, mock test results, interviews and discussions. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"] }, (_req, s) => preparationDashboard(s));

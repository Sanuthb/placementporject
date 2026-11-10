import { route } from "@/lib/api/handler";
import { institutionDashboard } from "@/lib/dashboardService";

/** The principal's or director's dashboard: placement, departments and batches, packages by year, training and preparation activity, company engagement. Read-only. */
export const GET = route({ roles: ["PRINCIPAL", "TPO_ADMIN", "PLACEMENT_OFFICER"] }, (_req, s) => institutionDashboard(s));

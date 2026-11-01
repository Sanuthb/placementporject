import { route } from "@/lib/api/handler";
import { dashboard } from "@/lib/dashboard";

export const GET = route({}, (_req, s) => dashboard(s));

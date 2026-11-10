import { route } from "@/lib/api/handler";
import { dashboard } from "@/lib/dashboard";

export const GET = route({ principalOk: true }, (_req, s) => dashboard(s));

import { route } from "@/lib/api/handler";
import { studentAnalysis } from "@/lib/student360";

export const GET = route<{ id: string }>({ module: "ONBOARDING" }, (_req, s, { id }) => studentAnalysis(s, id));

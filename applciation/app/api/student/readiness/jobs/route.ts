import { studentRoute } from "@/lib/api/studentHandler";
import { studentJds } from "@/lib/readinessService";

/** The jobs I can see my readiness for: ones from a preparation campaign I am in or a drive I applied to. */
export const GET = studentRoute({ module: "STUDENT_PREP" }, (_req, me) => studentJds(me));

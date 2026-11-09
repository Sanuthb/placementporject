import { studentRoute } from "@/lib/api/studentHandler";
import { listForStudent } from "@/lib/instruments/service";

/** The career tests I can take (interests, behavioural style, teamwork scenarios, written communication) and where I stand on each. */
export const GET = studentRoute({ module: "PSYCHOMETRICS" }, (_req, me) => listForStudent(me));

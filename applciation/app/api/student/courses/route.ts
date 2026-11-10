import { studentRoute } from "@/lib/api/studentHandler";
import { browse } from "@/lib/lmsStudent";

/** Courses I can join, and the ones I am in with my progress. */
export const GET = studentRoute({ module: "LEARNING" }, (_req, me) => browse(me));

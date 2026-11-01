import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { cohortResults } from "@/lib/psychCohort";

const query = z.object({ departmentId: z.uuid().optional(), batchId: z.uuid().optional(), groupBy: z.enum(["none", "department", "batch"]).default("department") });

/** Averages and distributions per group. Small groups are hidden to protect privacy. */
export const GET = route({ module: "PSYCHOMETRICS" }, (req, s) => cohortResults(s, parseQuery(req, query)));

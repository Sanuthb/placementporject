import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { assessmentReport } from "@/lib/assessmentReport";

const query = z.object({ departmentId: z.uuid().optional(), batchId: z.uuid().optional() });

/** Group results by kind of test and career test. Group figures only; groups under the privacy minimum are hidden. */
export const GET = route({ module: "ASSESSMENTS" }, async (req, s) => assessmentReport(s, parseQuery(req, query)));

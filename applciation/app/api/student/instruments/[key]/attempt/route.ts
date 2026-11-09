import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { z } from "zod";
import { submitAttempt } from "@/lib/instruments/service";

const body = z.object({ answers: z.record(z.string(), z.unknown()) });

/** Submit my answers. Private tests need my consent first; the college's retake rule decides whether I may take it again. Results never affect eligibility. */
export const POST = studentRoute<{ key: string }>({ module: "PSYCHOMETRICS", limit: { name: "instrument", max: 20, windowSec: 3600 } }, async (req, me, { key }) => {
  const { answers } = await parseBody(req, body);
  return submitAttempt(me, key, answers);
});

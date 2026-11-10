import { studentRoute } from "@/lib/api/studentHandler";
import { endEarly } from "@/lib/discussionService";

/** End the session early and get the evaluation of what you said so far. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "discussion-turn", max: 60, windowSec: 3600 }, module: "STUDENT_PREP" }, async (_req, me, { id }) => ({ done: true, evaluation: await endEarly(me, id) }));

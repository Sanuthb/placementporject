import { studentRoute } from "@/lib/api/studentHandler";
import { comparisonFor, mySession, view } from "@/lib/discussionService";

/** One session: the transcript (your words and the AI participants', each labelled), measured participation, the evaluation and the comparison with your last session of this kind. */
export const GET = studentRoute<{ id: string }>({ module: "STUDENT_PREP" }, async (_req, me, { id }) => {
  const m = await mySession(me, id);
  return { ...view(m), comparison: await comparisonFor(m) };
});

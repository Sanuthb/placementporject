import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { proctoringOf } from "@/lib/assessments";
import { liveAttempt } from "@/lib/studentAssessments";

const body = z.object({ type: z.enum(["TAB_SWITCH", "FULLSCREEN_EXIT", "PASTE", "FACE_NOT_VISIBLE", "MULTIPLE_FACES"]) });

/** Records a proctoring signal from the exam page. Too many violations flag the attempt for staff review; it is never failed automatically. */
export const POST = studentRoute<{ id: string }>({ module: "ASSESSMENTS" }, async (req, me, { id }) => {
  const { type } = await parseBody(req, body);
  const { sch, a } = await liveAttempt(me, id);
  const events = [...(a.proctorEvents as { type: string; at: string }[]), { type, at: new Date().toISOString() }].slice(-200);
  const violations = a.violations + 1;
  const flagged = violations > proctoringOf(sch.paper.proctoring).maxViolations;
  await db.assessmentAttempt.update({ where: { id: a.id }, data: { proctorEvents: events, violations, flagged } });
  return { violations, flagged };
});

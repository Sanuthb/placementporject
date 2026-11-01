import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { answersSchema, paperQuestions } from "@/lib/assessments";
import { liveAttempt } from "@/lib/studentAssessments";

const body = z.object({ answers: answersSchema });

/** Saves progress (replaces my saved answers). Only question ids that belong to the paper are kept. */
export const PUT = studentRoute<{ id: string }>({ module: "ASSESSMENTS" }, async (req, me, { id }) => {
  const { answers } = await parseBody(req, body);
  const { sch, a } = await liveAttempt(me, id);
  const valid = new Set(paperQuestions(sch.paper.questions).map((q) => q.id));
  const clean = Object.fromEntries(Object.entries(answers).filter(([qid]) => valid.has(qid)));
  await db.assessmentAttempt.update({ where: { id: a.id }, data: { answers: clean } });
  return { saved: Object.keys(clean).length };
});

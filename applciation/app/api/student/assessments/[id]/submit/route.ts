import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { z } from "zod";
import { db } from "@/lib/db";
import { answersSchema, finalize, paperQuestions } from "@/lib/assessments";
import { liveAttempt } from "@/lib/studentAssessments";

const body = z.object({ answers: answersSchema.optional() });

/** Submit now, optionally sending the final answers in the same call. */
export const POST = studentRoute<{ id: string }>({ limit: { name: "exam-submit", max: 30, windowSec: 3600 }, module: "ASSESSMENTS" }, async (req, me, { id }) => {
  const { answers } = await parseBody(req, body.default({}));
  const { sch, a } = await liveAttempt(me, id);
  const qs = paperQuestions(sch.paper.questions);
  const valid = new Set(qs.map((q) => q.id));
  const final = answers ? Object.fromEntries(Object.entries(answers).filter(([qid]) => valid.has(qid))) : (a.answers as Record<string, number[]>);
  const r = await finalize(db, { ...a, answers: final }, "SUBMITTED", qs);
  await db.assessmentAttempt.update({ where: { id: a.id }, data: { answers: final } });
  return { submitted: true, score: r?.score ?? null, maxScore: r?.max ?? null };
});

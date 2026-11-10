import { studentRoute } from "@/lib/api/studentHandler";
import { compareAttempts } from "@/lib/mockTest";
import { myReport } from "@/lib/testReportService";

/**
 * My report on my newest finished attempt: overall score and pass verdict, and (as the schedule allows) accuracy, time, section scores against their cut-offs, topic scores, weak topics and the
 * question-by-question answers with explanations. What the schedule hides is not sent. A descriptive, coding or SQL answer still waiting for a mark makes the score provisional.
 */
export const GET = studentRoute<{ id: string }>({ module: "ASSESSMENTS" }, async (_req, me, { id }) => {
  const r = await myReport(me, id);
  const can = r.shaped.topics.length > 0 || r.vis !== "SCORE_ONLY";
  return {
    title: r.sch.title, isPractice: r.sch.isPractice, isBaseline: r.sch.isBaseline, category: r.sch.paper.category, testKind: r.sch.paper.testKind, attemptNumber: r.attempt.attemptNumber, submittedAt: r.attempt.submittedAt, retakeInProgress: false,
    report: r.shaped, comparison: can && r.prev ? compareAttempts(r.full, r.prev) : null,
  };
});

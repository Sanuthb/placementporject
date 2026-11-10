import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { paperQuestions } from "@/lib/assessments";
import { isOpen, typeOf, type Answer, type Marks } from "@/lib/mockTest";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

/** Attempts with a descriptive, coding or SQL answer waiting for a mark (oldest first), with each open answer, the model answer and any mark the AI gave. */
export const GET = route(R, async (req, s) => {
  const q = parseQuery(req, z.object({ scheduleId: z.uuid().optional() }));
  const rows = await db.assessmentAttempt.findMany({ where: { reviewStatus: "PENDING", status: { not: "IN_PROGRESS" }, scheduleId: q.scheduleId, schedule: { collegeId: s.collegeId } }, orderBy: { submittedAt: "asc" }, take: 100, include: { student: { select: { id: true, name: true, enrollmentNo: true } }, schedule: { select: { id: true, title: true, paper: { select: { questions: true } } } } } });
  return rows.map((a) => {
    const marks = (a.marks ?? {}) as Marks, answers = a.answers as Record<string, Answer>;
    return {
      id: a.id, student: a.student, schedule: { id: a.schedule.id, title: a.schedule.title }, submittedAt: a.submittedAt, attemptNumber: a.attemptNumber,
      answers: paperQuestions(a.schedule.paper.questions).filter((qq) => isOpen(qq) && typeof answers[qq.id] === "string" && (answers[qq.id] as string).trim()).map((qq) => ({ questionId: qq.id, type: typeOf(qq), language: qq.language ?? null, context: qq.context ?? null, text: qq.text, maxMarks: qq.marks, modelAnswer: qq.modelAnswer ?? null, rubric: qq.rubric ?? null, answer: answers[qq.id] as string, mark: marks[qq.id] ?? null })),
    };
  });
});

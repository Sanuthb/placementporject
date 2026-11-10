import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { paperQuestions } from "@/lib/assessments";
import { isOpen, scoreAttempt, type Answer, type Marks } from "@/lib/mockTest";
import type { Prisma } from "@/generated/prisma/client";

const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };
const body = z.object({ marks: z.record(z.string(), z.object({ awarded: z.number().min(0).max(100), comment: z.string().trim().max(500).optional() })).refine((m) => Object.keys(m).length > 0, "Mark at least one answer") });

/** Give marks to open answers (replacing any the AI gave). Marks cannot exceed a question's marks. When every open answer has a mark the score becomes final and the student is told. */
export const POST = route<{ attemptId: string }>(R, async (req, s, { attemptId }) => {
  const a = await db.assessmentAttempt.findFirst({ where: { id: attemptId, status: { not: "IN_PROGRESS" }, schedule: { collegeId: s.collegeId } }, include: { schedule: { include: { paper: true } } } });
  if (!a) throw notFound("Attempt not found");
  const { marks: given } = await parseBody(req, body);
  const qs = paperQuestions(a.schedule.paper.questions), open = new Map(qs.filter(isOpen).map((q) => [q.id, q]));
  const merged: Record<string, unknown> = { ...((a.marks ?? {}) as Record<string, unknown>) };
  for (const [qid, m] of Object.entries(given)) {
    const q = open.get(qid);
    if (!q) throw badRequest("One of the marks is for a question that is not an open answer");
    if (m.awarded > q.marks) throw badRequest(`"${q.text.slice(0, 40)}" is out of ${q.marks} marks`);
    merged[qid] = { awarded: Math.round(m.awarded * 2) / 2, by: "STAFF", comment: m.comment };
  }
  merged._meta = { ...(typeof merged._meta === "object" && merged._meta ? merged._meta : {}), staffMarkedAt: new Date().toISOString() };
  const r = scoreAttempt(qs, a.answers as Record<string, Answer>, merged as Marks);
  const done = r.pending === 0;
  await db.assessmentAttempt.update({ where: { id: a.id }, data: { marks: merged as Prisma.InputJsonValue, score: r.score, maxScore: r.max, reviewStatus: done ? "DONE" : "PENDING" } });
  if (done) await notifyStudent(s.collegeId, a.studentId, { type: "assessment.marked", title: `Your result for ${a.schedule.title} is final`, body: `${r.score} of ${r.max}`, link: `/student/assessments/${a.scheduleId}` });
  await audit(s, { action: "assessment.mark", entity: "AssessmentAttempt", entityId: a.id, after: { score: r.score, final: done } });
  return { score: r.score, max: r.max, final: done };
});

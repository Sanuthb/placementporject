import { studentRoute } from "@/lib/api/studentHandler";
import { cleanFeedback } from "@/lib/interviewEngine";
import { comparisonFor, deadlineFor, myInterview } from "@/lib/interviewService";

/** One interview with its transcript (your answers, the interviewer's questions and, in learning mode, the AI coach's notes, each labelled), the report and the comparison with the last attempt. */
export const GET = studentRoute<{ id: string }>({ module: "STUDENT_PREP" }, async (_req, me, { id }) => {
  const m = await myInterview(me, id);
  return {
    id: m.id, role: m.role, topic: m.topic, status: m.status === "FINISHING" ? "IN_PROGRESS" : m.status, type: m.type, mode: m.mode, difficulty: m.difficulty, language: m.language, durationMin: m.durationMin, transcript: m.transcript,
    feedback: cleanFeedback(m.feedback), comparison: await comparisonFor(m), createdAt: m.createdAt, completedAt: m.completedAt, deadline: deadlineFor(m), totalQuestions: m.questionCount,
    sharedWithStaff: !!m.assignmentId, voiceConsent: !!m.voiceConsentAt, voiceUsed: m.voiceUsed,
  };
});

import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { instrumentForStudent } from "@/lib/instruments/index";
import { available, decisionFor, instrumentOrThrow } from "@/lib/instruments/service";

/** One test's questions (without scoring keys) and whether I may take it now. */
export const GET = studentRoute<{ key: string }>({ module: "PSYCHOMETRICS" }, async (_req, me, { key }) => {
  const inst = instrumentOrThrow(key);
  if (!available(inst)) throw new ApiError(503, "AI_NOT_CONFIGURED", "This test is not available yet");
  const [st, { decision, attempts }] = await Promise.all([db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { psychConsentAt: true } }), decisionFor(me, inst)]);
  return { ...instrumentForStudent(inst), consentAt: st.psychConsentAt, attempts, canTake: decision.kind === "start", blockedReason: decision.kind === "refuse" ? decision.message : null };
});

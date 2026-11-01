import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { analyzeResume } from "@/lib/resume";
import { resumeSections } from "@/lib/studentResume";

export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const st = await db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { email: true, phone: true } });
  const { all, resumeVerified } = await resumeSections(me.studentId);
  return analyzeResume(st, all, resumeVerified);
});

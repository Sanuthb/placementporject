import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";

export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  const st = await scopedStudent(s, id);
  const sections = await db.studentSection.findMany({
    where: { studentId: id },
    select: { id: true, section: true, status: true, submittedAt: true, reviewedAt: true, reviewComment: true },
  });
  return { studentId: id, stage: st.stage, sections };
});

import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { scopedStudent } from "@/lib/verification";

export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedStudent(s, id);
  return db.verificationEvent.findMany({
    where: { studentId: id, collegeId: s.collegeId },
    select: { id: true, section: true, action: true, comment: true, createdAt: true, actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
});

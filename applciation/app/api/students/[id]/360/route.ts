import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { student360 } from "@/lib/student360";

/** Opening a profile is recorded so the student can see who looked (at most once an hour per person). */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  const data = await student360(s, id);
  const recent = await db.profileView.findFirst({ where: { studentId: id, actorId: s.userId, createdAt: { gt: new Date(Date.now() - 3_600_000) } }, select: { id: true } });
  if (!recent) await db.profileView.create({ data: { collegeId: s.collegeId, studentId: id, actorId: s.userId } });
  return data;
});

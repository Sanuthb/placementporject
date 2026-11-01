import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

export const GET = studentRoute({ module: "STUDENT_PREP" }, (_req, me) =>
  db.counsellingSlot.findMany({ where: { collegeId: me.collegeId, status: "OPEN", startsAt: { gt: new Date() } }, select: { id: true, startsAt: true, endsAt: true, counsellor: { select: { name: true } } }, orderBy: { startsAt: "asc" }, take: 200 }),
);

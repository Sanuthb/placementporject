import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

export const GET = studentRoute({ module: "STUDENT_PREP" }, (_req, me) =>
  db.counsellingSlot.findMany({ where: { studentId: me.studentId }, select: { id: true, startsAt: true, endsAt: true, status: true, topic: true, counsellor: { select: { name: true } } }, orderBy: { startsAt: "desc" }, take: 50 }),
);

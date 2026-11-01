import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

/** Blocks currently stopping me from applying, and why. */
export const GET = studentRoute({ module: "ATTENDANCE_BLOCKING" }, (_req, me) =>
  db.block.findMany({ where: { studentId: me.studentId, status: "ACTIVE", endsAt: { gt: new Date() } }, select: { id: true, reason: true, startsAt: true, endsAt: true }, orderBy: { endsAt: "desc" } }),
);

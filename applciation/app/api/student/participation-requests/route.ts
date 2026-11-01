import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { ParticipationStatus } from "@/generated/prisma/client";

const body = z.object({ requestedStatus: z.enum(ParticipationStatus), reason: z.string().trim().min(5).max(500) });

export const GET = studentRoute({}, (_req, me) =>
  db.participationRequest.findMany({ where: { studentId: me.studentId }, select: { id: true, requestedStatus: true, reason: true, status: true, decisionComment: true, createdAt: true, decidedAt: true }, orderBy: { createdAt: "desc" }, take: 50 }),
);

/** Ask to change my placement status (for example to opt out, or go for higher studies). Staff decide. */
export const POST = studentRoute({ limit: { name: "participation", max: 10, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, body);
  const st = await db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { participationStatus: true } });
  if (st.participationStatus === b.requestedStatus) throw new ApiError(409, "CONFLICT", "That is already your status");
  if (await db.participationRequest.findFirst({ where: { studentId: me.studentId, status: "PENDING" } })) throw new ApiError(409, "CONFLICT", "You already have a request waiting for a decision");
  return db.$transaction(async (tx) => {
    const r = await tx.participationRequest.create({ data: { collegeId: me.collegeId, studentId: me.studentId, ...b } });
    await notifyStaff(me.collegeId, { type: "participation.requested", title: `${me.name} asked to change placement status to ${b.requestedStatus.toLowerCase().replace("_", " ")}`, link: "/participation-requests", departmentId: me.departmentId }, tx);
    return { id: r.id, status: r.status };
  });
});

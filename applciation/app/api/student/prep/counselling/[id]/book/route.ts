import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";

const body = z.object({ topic: z.string().trim().min(3).max(200) });

/** Books an open slot. Two students can never get the same slot. I may hold only one upcoming booking at a time. */
export const POST = studentRoute<{ id: string }>({ module: "STUDENT_PREP" }, async (req, me, { id }) => {
  const { topic } = await parseBody(req, body);
  if (await db.counsellingSlot.findFirst({ where: { studentId: me.studentId, status: "BOOKED", startsAt: { gt: new Date() } } })) throw new ApiError(409, "CONFLICT", "You already have an upcoming session. Cancel it to book another");
  const claim = await db.counsellingSlot.updateMany({ where: { id, collegeId: me.collegeId, status: "OPEN", studentId: null, startsAt: { gt: new Date() } }, data: { status: "BOOKED", studentId: me.studentId, topic } });
  if (claim.count === 0) throw new ApiError(409, "SLOT_TAKEN", "That slot is no longer available");
  const slot = await db.counsellingSlot.findUniqueOrThrow({ where: { id } });
  await db.notification.create({ data: { collegeId: me.collegeId, userId: slot.counsellorId, type: "counselling.booked", title: `${me.name} booked a counselling session`, body: topic } });
  return { id, status: "BOOKED", startsAt: slot.startsAt };
});

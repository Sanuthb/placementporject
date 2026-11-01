import { ApiError } from "@/lib/api/errors";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;
const LIVE = ["SCHEDULED", "IN_PROGRESS"] as const;

/** A panel can only interview one student at a time, and a student can only be in one place at a time (across all drives). */
export async function assertNoConflict(tx: Tx, p: { panelId: string; studentId: string; startsAt: Date; endsAt: Date; excludeSlotId?: string }) {
  const overlap = { startsAt: { lt: p.endsAt }, endsAt: { gt: p.startsAt }, status: { in: [...LIVE] }, ...(p.excludeSlotId ? { id: { not: p.excludeSlotId } } : {}) };
  const [panelClash, studentClash] = await Promise.all([
    tx.interviewSlot.findFirst({ where: { ...overlap, panelId: p.panelId }, select: { startsAt: true, endsAt: true } }),
    tx.interviewSlot.findFirst({ where: { ...overlap, application: { studentId: p.studentId } }, select: { startsAt: true, endsAt: true } }),
  ]);
  const fmt = (c: { startsAt: Date; endsAt: Date }) => `${c.startsAt.toISOString().slice(11, 16)}-${c.endsAt.toISOString().slice(11, 16)} UTC`;
  if (panelClash) throw new ApiError(409, "SLOT_CONFLICT", `The panel is already booked ${fmt(panelClash)}`);
  if (studentClash) throw new ApiError(409, "SLOT_CONFLICT", `The student already has an interview ${fmt(studentClash)}`);
}

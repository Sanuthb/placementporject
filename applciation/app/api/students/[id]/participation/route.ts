import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedStudent } from "@/lib/verification";
import { ParticipationStatus } from "@/generated/prisma/client";

const body = z.object({ status: z.enum(ParticipationStatus), reason: z.string().trim().max(500).optional() })
  .refine((v) => v.status !== "NOT_ELIGIBLE" || !!v.reason, { message: "A reason is required when marking a student not eligible", path: ["reason"] });

export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  const st = await scopedStudent(s, id);
  const history = await db.participationHistory.findMany({
    where: { studentId: id },
    select: { id: true, fromStatus: true, toStatus: true, reason: true, createdAt: true, changedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return { status: st.participationStatus, reason: st.participationReason, history };
});

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async (req, s, { id }) => {
  const st = await scopedStudent(s, id);
  const { status, reason } = await parseBody(req, body);
  if (st.participationStatus === status) return { status, reason: st.participationReason };
  return db.$transaction(async (tx) => {
    await tx.student.update({ where: { id }, data: { participationStatus: status, participationReason: reason ?? null } });
    await tx.participationHistory.create({ data: { collegeId: s.collegeId, studentId: id, fromStatus: st.participationStatus, toStatus: status, reason, changedById: s.userId } });
    await audit(s, { action: "student.participation", entity: "Student", entityId: id, before: { status: st.participationStatus }, after: { status }, reason }, tx);
    return { status, reason: reason ?? null };
  });
});

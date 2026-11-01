import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendBulkEmail } from "@/lib/ops/email";
import { notifyStudent } from "@/lib/notify";
import type { BlockPolicyType, Prisma } from "@/generated/prisma/client";

export const missedDrivesParams = z.object({
  threshold: z.number().int().min(1).max(50),
  blockDays: z.number().int().min(1).max(730),
  windowDays: z.number().int().min(1).max(1095).optional(),
  graceHours: z.number().int().min(0).max(720).default(24),
});
export const paramSchemas: Record<BlockPolicyType, z.ZodType<Record<string, unknown>>> = {
  MISSED_DRIVES: missedDrivesParams,
  PLACED_LOWER_TIER: z.object({}),
};

const DAY = 86_400_000;

/** Emails the student why they were blocked. Best effort: a mail failure never undoes the block. */
async function notifyBlock(collegeId: string, studentId: string, reason: string, endsAt: Date, actorId: string | null) {
  try {
    const st = await db.student.findUnique({ where: { id: studentId }, select: { email: true } });
    if (!st) return false;
    const res = await sendBulkEmail({ collegeId, userId: actorId }, {
      purpose: "block.notice", subject: "You are temporarily blocked from placement drives",
      body: `You have been blocked from applying to placement drives until ${endsAt.toUTCString()}.\n\nReason: ${reason}\n\nIf you believe this is a mistake, please contact the placement cell.`,
      recipients: [{ email: st.email, studentId }],
    });
    return res.sent === 1;
  } catch {
    return false;
  }
}

export async function createBlock(p: { collegeId: string; studentId: string; source: "POLICY" | "MANUAL"; policyId?: string; reason: string; endsAt: Date; evidence?: Prisma.InputJsonValue; createdById: string | null }) {
  const block = await db.$transaction(async (tx) => {
    const b = await tx.block.create({ data: { collegeId: p.collegeId, studentId: p.studentId, source: p.source, policyId: p.policyId, reason: p.reason, endsAt: p.endsAt, evidence: p.evidence, createdById: p.createdById } });
    await audit({ collegeId: p.collegeId, userId: p.createdById }, { action: p.source === "POLICY" ? "block.auto" : "block.manual", entity: "Block", entityId: b.id, after: { studentId: p.studentId, endsAt: p.endsAt.toISOString() }, reason: p.reason }, tx);
    await notifyStudent(p.collegeId, p.studentId, { type: "block.created", title: "You are temporarily blocked from placement drives", body: p.reason }, tx);
    return b;
  });
  if (await notifyBlock(p.collegeId, p.studentId, p.reason, p.endsAt, p.createdById)) await db.block.update({ where: { id: block.id }, data: { notifiedAt: new Date() } });
  return block;
}

/** Blocks currently in force for the given students. */
export async function activeBlocks(collegeId: string, studentIds: string[]) {
  if (!studentIds.length) return new Map<string, { reason: string; endsAt: Date }>();
  const rows = await db.block.findMany({ where: { collegeId, studentId: { in: studentIds }, status: "ACTIVE", endsAt: { gt: new Date() } }, orderBy: { endsAt: "desc" }, select: { studentId: true, reason: true, endsAt: true } });
  const m = new Map<string, { reason: string; endsAt: Date }>();
  for (const r of rows) if (!m.has(r.studentId)) m.set(r.studentId, r);
  return m;
}

/**
 * Applies the college's MISSED_DRIVES policies. A drive counts as missed when the student has an unexcused
 * absence in it and was never present, once every session of the drive is closed and the grace period has passed.
 * Drives already used for an earlier block are not counted again. Safe to run repeatedly.
 */
export async function evaluateBlocks(collegeId: string, now = new Date()) {
  const expired = await db.block.updateMany({ where: { collegeId, status: "ACTIVE", endsAt: { lte: now } }, data: { status: "EXPIRED" } });
  const policies = await db.blockPolicy.findMany({ where: { collegeId, isActive: true, type: "MISSED_DRIVES" } });
  let created = 0;

  for (const policy of policies) {
    const params = missedDrivesParams.parse(policy.params);
    const absences = await db.attendanceRecord.findMany({ where: { collegeId, status: "ABSENT", excused: false, student: { isActive: true, isArchived: false } }, select: { studentId: true, driveId: true } });
    if (!absences.length) continue;
    const driveIds = [...new Set(absences.map((a) => a.driveId))];
    const [sessions, presents] = await Promise.all([
      db.attendanceSession.findMany({ where: { driveId: { in: driveIds } }, select: { driveId: true, isOpen: true, closedAt: true } }),
      db.attendanceRecord.findMany({ where: { driveId: { in: driveIds }, status: "PRESENT" }, select: { studentId: true, driveId: true } }),
    ]);
    const finished = new Map<string, Date>(); // drive -> when its last session closed
    const open = new Set<string>();
    for (const s of sessions) { if (s.isOpen || !s.closedAt) open.add(s.driveId); else if (!finished.has(s.driveId) || s.closedAt > finished.get(s.driveId)!) finished.set(s.driveId, s.closedAt); }
    const present = new Set(presents.map((p) => `${p.studentId}:${p.driveId}`));
    const counted = (driveId: string) => {
      const closedAt = finished.get(driveId);
      if (!closedAt || open.has(driveId)) return false;
      if (now.getTime() - closedAt.getTime() < params.graceHours * 3_600_000) return false; // still within the window to excuse
      return !params.windowDays || now.getTime() - closedAt.getTime() <= params.windowDays * DAY;
    };

    const missed = new Map<string, Set<string>>();
    for (const a of absences) if (!present.has(`${a.studentId}:${a.driveId}`) && counted(a.driveId)) (missed.get(a.studentId) ?? missed.set(a.studentId, new Set()).get(a.studentId)!).add(a.driveId);
    if (!missed.size) continue;

    const prior = await db.block.findMany({ where: { collegeId, policyId: policy.id, studentId: { in: [...missed.keys()] } }, select: { studentId: true, status: true, endsAt: true, evidence: true } });
    for (const [studentId, drives] of missed) {
      const mine = prior.filter((b) => b.studentId === studentId);
      if (mine.some((b) => b.status === "ACTIVE" && b.endsAt > now)) continue; // already blocked by this policy
      const used = new Set(mine.flatMap((b) => ((b.evidence as { driveIds?: string[] } | null)?.driveIds ?? [])));
      const fresh = [...drives].filter((d) => !used.has(d));
      if (fresh.length < params.threshold) continue;
      await createBlock({ collegeId, studentId, source: "POLICY", policyId: policy.id, reason: `Missed ${fresh.length} placement drives (${policy.name})`, endsAt: new Date(now.getTime() + params.blockDays * DAY), evidence: { driveIds: fresh }, createdById: null });
      created++;
    }
  }
  return { created, expired: expired.count };
}

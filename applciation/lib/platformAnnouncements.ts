import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { platformAudit } from "@/lib/platformAudit";
import type { Session } from "@/lib/auth/session";
import type { PlatformSession } from "@/lib/auth/platform";

/**
 * Platform announcements (Control Centre, 4.11): maintenance notices, feature announcements and outage notices from the platform to institutions.
 * They are shown inside the application only. Nothing is e-mailed, texted or sent over WhatsApp, and there is no delivery tracking beyond
 * "an institution administrator confirmed they read it". An announcement is a draft until published; a published one cannot be edited, only cancelled.
 */
export const KINDS = ["MAINTENANCE", "FEATURE", "OUTAGE"] as const;
export const announcementInput = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().min(3).max(2000),
  allInstitutions: z.boolean().default(true),
  institutionIds: z.array(z.uuid()).max(200).default([]),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional(),
}).strict()
  .refine((v) => !v.endsAt || v.endsAt > v.startsAt, { message: "The end must be after the start", path: ["endsAt"] })
  .refine((v) => v.allInstitutions || v.institutionIds.length > 0, { message: "Choose at least one institution, or send it to all", path: ["institutionIds"] });
export type AnnouncementInput = z.infer<typeof announcementInput>;
export const listQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).strict();

export type AnnouncementStatus = "draft" | "scheduled" | "live" | "ended" | "cancelled";
/** What an announcement is right now. Cancelled wins over everything; a draft is never live. */
export function announcementStatus(a: { publishedAt: Date | null; cancelledAt: Date | null; startsAt: Date; endsAt: Date | null }, now: Date): AnnouncementStatus {
  if (a.cancelledAt) return "cancelled";
  if (!a.publishedAt) return "draft";
  if (a.startsAt > now) return "scheduled";
  if (a.endsAt && a.endsAt < now) return "ended";
  return "live";
}
/** Whether an institution is meant to see an announcement: sent to all, or listing it. */
export const audienceMatches = (a: { allInstitutions: boolean; targetIds: string[] }, collegeId: string) => a.allInstitutions || a.targetIds.includes(collegeId);

// ---------------- platform side ----------------
const must = async (id: string) => {
  const a = await db.platformAnnouncement.findUnique({ where: { id }, include: { targets: { select: { collegeId: true } }, _count: { select: { acks: true } } } });
  if (!a) throw notFound("Announcement not found");
  return a;
};
const shape = (a: Awaited<ReturnType<typeof must>>, now: Date) => ({
  id: a.id, kind: a.kind, title: a.title, body: a.body, allInstitutions: a.allInstitutions, institutionIds: a.targets.map((t) => t.collegeId),
  startsAt: a.startsAt, endsAt: a.endsAt, publishedAt: a.publishedAt, cancelledAt: a.cancelledAt, status: announcementStatus(a, now), acknowledgements: a._count.acks,
});
async function checkInstitutions(ids: string[]) {
  if (!ids.length) return;
  const n = await db.college.count({ where: { id: { in: ids } } });
  if (n !== new Set(ids).size) throw badRequest("One or more of the chosen institutions does not exist");
}

export async function listAnnouncements(q: z.infer<typeof listQuery>, now = new Date()) {
  const [total, rows] = await Promise.all([
    db.platformAnnouncement.count(),
    db.platformAnnouncement.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: { targets: { select: { collegeId: true } }, _count: { select: { acks: true } } } }),
  ]);
  return { items: rows.map((a) => shape(a, now)), page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}
export async function getAnnouncement(id: string) { return shape(await must(id), new Date()); }

export async function createAnnouncement(admin: PlatformSession, input: AnnouncementInput) {
  await checkInstitutions(input.institutionIds);
  const a = await db.platformAnnouncement.create({
    data: { kind: input.kind, title: input.title, body: input.body, allInstitutions: input.allInstitutions, startsAt: input.startsAt, endsAt: input.endsAt ?? null, createdByAdminId: admin.adminId, targets: input.allInstitutions ? undefined : { create: [...new Set(input.institutionIds)].map((collegeId) => ({ collegeId })) } },
    select: { id: true },
  });
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "announcement.create", detail: { announcementId: a.id, kind: input.kind, allInstitutions: input.allInstitutions } });
  return a;
}
export async function updateAnnouncement(admin: PlatformSession, id: string, input: AnnouncementInput) {
  const cur = await must(id);
  if (cur.publishedAt || cur.cancelledAt) throw new ApiError(409, "CONFLICT", "Only a draft can be edited. Cancel this announcement and create a new one");
  await checkInstitutions(input.institutionIds);
  await db.$transaction(async (tx) => {
    // The draft check is repeated inside the statement, so a publish that lands first wins.
    const claim = await tx.platformAnnouncement.updateMany({ where: { id, publishedAt: null, cancelledAt: null }, data: { kind: input.kind, title: input.title, body: input.body, allInstitutions: input.allInstitutions, startsAt: input.startsAt, endsAt: input.endsAt ?? null } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only a draft can be edited");
    await tx.platformAnnouncementTarget.deleteMany({ where: { announcementId: id } });
    if (!input.allInstitutions) await tx.platformAnnouncementTarget.createMany({ data: [...new Set(input.institutionIds)].map((collegeId) => ({ announcementId: id, collegeId })) });
  });
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "announcement.update", detail: { announcementId: id } });
  return { id };
}
export async function publishAnnouncement(admin: PlatformSession, id: string) {
  await must(id);
  const claim = await db.platformAnnouncement.updateMany({ where: { id, publishedAt: null, cancelledAt: null }, data: { publishedAt: new Date() } });
  if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only a draft can be published");
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "announcement.publish", detail: { announcementId: id } });
  return { id };
}
export async function cancelAnnouncement(admin: PlatformSession, id: string) {
  await must(id);
  const claim = await db.platformAnnouncement.updateMany({ where: { id, cancelledAt: null }, data: { cancelledAt: new Date() } });
  if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This announcement is already cancelled");
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "announcement.cancel", detail: { announcementId: id } });
  return { id };
}

// ---------------- institution side (scoped to the session's college) ----------------
export async function liveForInstitution(s: Session, now = new Date()) {
  const rows = await db.platformAnnouncement.findMany({
    where: { publishedAt: { not: null }, cancelledAt: null, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }], AND: [{ OR: [{ allInstitutions: true }, { targets: { some: { collegeId: s.collegeId } } }] }] },
    orderBy: [{ startsAt: "desc" }, { id: "asc" }], take: 20,
    select: { id: true, kind: true, title: true, body: true, startsAt: true, endsAt: true, acks: { where: { userId: s.userId ?? undefined }, select: { userId: true } } },
  });
  return rows.map(({ acks, ...a }) => ({ ...a, acknowledged: acks.length > 0 }));
}
export async function acknowledge(s: Session, id: string, now = new Date()) {
  const visible = (await liveForInstitution(s, now)).some((a) => a.id === id);
  if (!visible || !s.userId) throw notFound("Announcement not found");
  await db.platformAnnouncementAck.upsert({ where: { announcementId_userId: { announcementId: id, userId: s.userId } }, update: {}, create: { announcementId: id, collegeId: s.collegeId, userId: s.userId } });
  await audit(s, { action: "announcement.ack", entity: "PlatformAnnouncement", entityId: id });
  return { id, acknowledged: true };
}

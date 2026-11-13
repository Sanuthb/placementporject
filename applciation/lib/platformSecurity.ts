import { z } from "zod";
import { db } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api/errors";
import { auditQuery, listAudit } from "@/lib/platformAuditView";
import { platformAudit } from "@/lib/platformAudit";
import type { PlatformSession } from "@/lib/auth/platform";

/**
 * Security centre (Control Centre, 4.12). It adds REVIEWS on top of the audit trail the platform already keeps (`listAudit`): an administrator can mark
 * a recorded event as under review, resolved, or needing no action, with a note. Nothing here detects, scores or labels anything as an attack.
 *
 * What the trail does NOT contain today, and what this page therefore cannot show: sign-in failures of institution users, and access denials between
 * institutions. They are not recorded anywhere, so they are not invented here.
 */
export const reviewInput = z.object({
  source: z.enum(["PLATFORM", "INSTITUTION"]),
  eventId: z.uuid(),
  status: z.enum(["UNDER_REVIEW", "RESOLVED", "NO_ACTION"]),
  note: z.string().trim().max(1000).optional(),
}).strict().refine((v) => v.status === "UNDER_REVIEW" || (v.note?.length ?? 0) >= 3, { message: "Add a short note saying what was found or done", path: ["note"] });
export const eventsQuery = auditQuery;

export async function securityEvents(q: z.infer<typeof eventsQuery>) {
  const page = await listAudit(q);
  const ids = page.items.map((e) => e.id);
  const reviews = ids.length ? await db.platformSecurityReview.findMany({ where: { eventId: { in: ids } } }) : [];
  const by = new Map(reviews.map((r) => [`${r.source}:${r.eventId}`, r]));
  return { ...page, items: page.items.map((e) => { const r = by.get(`${e.source}:${e.id}`); return { ...e, review: r ? { status: r.status, note: r.note, updatedAt: r.updatedAt } : null }; }) };
}

/** Counts for the overview: how many reviews are open, and how many events have been reviewed at all. No event content. */
export async function securitySummary() {
  const grouped = await db.platformSecurityReview.groupBy({ by: ["status"], _count: { _all: true } });
  const n = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  return { underReview: n("UNDER_REVIEW"), resolved: n("RESOLVED"), noAction: n("NO_ACTION") };
}

export async function setReview(admin: PlatformSession, input: z.infer<typeof reviewInput>) {
  // The event must really exist, in the trail it names. Institution events are only the ones a platform administrator caused.
  const exists = input.source === "PLATFORM"
    ? await db.platformAuditLog.findUnique({ where: { id: input.eventId }, select: { id: true } })
    : await db.auditLog.findFirst({ where: { id: input.eventId, platformActorId: { not: null } }, select: { id: true } });
  if (!exists) throw notFound("That event was not found");
  if (input.status !== "UNDER_REVIEW" && !input.note) throw badRequest("Add a short note");
  const note = input.note || null;
  await db.platformSecurityReview.upsert({
    where: { source_eventId: { source: input.source, eventId: input.eventId } },
    update: { status: input.status, note, reviewedByAdminId: admin.adminId },
    create: { source: input.source, eventId: input.eventId, status: input.status, note, reviewedByAdminId: admin.adminId },
  });
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "security.review", detail: { source: input.source, eventId: input.eventId, status: input.status } });
  return { eventId: input.eventId, status: input.status };
}

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { platformAudit } from "@/lib/platformAudit";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { escapeLike } from "@/lib/platformList";
import type { Session } from "@/lib/auth/session";
import type { PlatformSession } from "@/lib/auth/platform";

/**
 * Platform support requests (SA-TC-011, 063, 064, 065). An institution administrator (TPO_ADMIN) asks the platform team for help; platform
 * administrators list, assign, annotate and resolve. A request is a different thing from a student's `Ticket` (which stays inside one college).
 *
 * Privacy rule: the platform side never receives student or staff contact details. It gets the institution name, the requester's name, and the
 * request text with e-mail addresses, phone numbers, long ID numbers and the college's own student enrolment numbers and names masked (maskPersonal).
 * Internal notes (kind NOTE) are only ever selected by platform routes.
 */
export const CATEGORIES = ["TECHNICAL", "ACCOUNT", "DATA", "OTHER"] as const;
export const createInput = z.object({ category: z.enum(CATEGORIES), subject: z.string().trim().min(3).max(200), message: z.string().trim().min(3).max(5000) });
export const textInput = z.object({ message: z.string().trim().min(1).max(5000) });
export const supportQuery = z.object({
  q: z.string().trim().max(100).optional(), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(), institution: z.uuid().optional(),
  assignee: z.union([z.uuid(), z.literal("none"), z.literal("me")]).optional(), category: z.enum(CATEGORIES).optional(), priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w])\+?\d[\d\s().-]{7,}\d(?![\w])/g; // 9+ digits with separators: phone numbers, Aadhaar-style numbers
const LONGNUM = /\b\d{9,}\b/g;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Masks personal identifiers in free text before it reaches the platform side. `known` are exact identifiers to hide (enrolment numbers, names). */
export function maskPersonal(text: string, known: string[] = []) {
  let t = text.replace(EMAIL, "[email hidden]").replace(PHONE, "[number hidden]").replace(LONGNUM, "[number hidden]");
  for (const k of [...known].filter((k) => k && k.length >= 3).sort((a, b) => b.length - a.length)) t = t.replace(new RegExp(esc(k), "gi"), "[student hidden]");
  return t;
}
/** The college's student names / enrolment numbers that actually occur in these texts (so the lookup result is small). */
async function knownIds(collegeId: string, texts: string[]) {
  const joined = texts.join(" ").toLowerCase();
  const rows = await db.student.findMany({ where: { collegeId }, select: { enrollmentNo: true, name: true } });
  return rows.flatMap((r) => [r.enrollmentNo, r.name]).filter((k): k is string => !!k && k.length >= 3 && joined.includes(k.toLowerCase()));
}

// ---------------- institution side ----------------
export async function createRequest(s: Session, input: z.infer<typeof createInput>) {
  return db.$transaction(async (tx) => {
    const r = await tx.platformSupportRequest.create({ data: { collegeId: s.collegeId, requesterId: s.userId, category: input.category, subject: input.subject, entries: { create: { kind: "REPLY", authorUserId: s.userId, body: input.message } } } });
    await audit(s, { action: "support.create", entity: "PlatformSupportRequest", entityId: r.id, after: { category: input.category } }, tx);
    return { id: r.id, status: r.status };
  });
}
const instSelect = { id: true, category: true, subject: true, status: true, createdAt: true, updatedAt: true, resolvedAt: true } as const;
export const listForInstitution = (s: Session) => db.platformSupportRequest.findMany({ where: { collegeId: s.collegeId }, select: instSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100 });
export async function getForInstitution(s: Session, id: string) {
  const r = await db.platformSupportRequest.findFirst({ where: { id, collegeId: s.collegeId }, select: { ...instSelect, entries: { where: { kind: { in: ["REPLY", "EVENT"] } }, orderBy: { createdAt: "asc" }, select: { id: true, kind: true, body: true, createdAt: true, authorAdminId: true } } } });
  if (!r) throw notFound("Support request not found");
  // Platform administrators are shown only as "platform"; ids are never returned.
  return { ...r, entries: r.entries.map(({ authorAdminId, ...e }) => ({ ...e, from: e.kind === "EVENT" ? "system" : authorAdminId ? "platform" : "you" })) };
}
export async function institutionReply(s: Session, id: string, message: string) {
  const r = await db.platformSupportRequest.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } });
  if (!r) throw notFound("Support request not found");
  return db.$transaction(async (tx) => {
    const claim = await tx.platformSupportRequest.updateMany({ where: { id, collegeId: s.collegeId, status: { not: "RESOLVED" } }, data: { updatedAt: new Date() } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This request is resolved. Open a new one");
    await tx.platformSupportEntry.create({ data: { requestId: id, kind: "REPLY", authorUserId: s.userId, body: message } });
    await audit(s, { action: "support.reply", entity: "PlatformSupportRequest", entityId: id }, tx);
    return { id };
  });
}

// ---------------- platform side ----------------
const adminNames = async (ids: (string | null)[]) => {
  const list = [...new Set(ids.filter((i): i is string => !!i))];
  const rows = list.length ? await db.platformAdmin.findMany({ where: { id: { in: list } }, select: { id: true, name: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.name]));
};
export async function listForPlatform(admin: PlatformSession, q: z.infer<typeof supportQuery>) {
  const like = q.q ? escapeLike(q.q) : "";
  const where: Prisma.PlatformSupportRequestWhereInput = {
    status: q.status, collegeId: q.institution, category: q.category, priority: q.priority,
    ...(q.assignee === "none" ? { assigneeAdminId: null } : q.assignee === "me" ? { assigneeAdminId: admin.adminId } : q.assignee ? { assigneeAdminId: q.assignee } : {}),
    ...(q.q ? { OR: [{ subject: { contains: like, mode: "insensitive" } }, { college: { name: { contains: like, mode: "insensitive" } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.platformSupportRequest.count({ where }),
    db.platformSupportRequest.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      select: { ...instSelect, priority: true, assigneeAdminId: true, college: { select: { id: true, name: true } }, _count: { select: { entries: true } } },
    }),
  ]);
  const names = await adminNames(rows.map((r) => r.assigneeAdminId));
  const items = rows.map(({ assigneeAdminId, _count, ...r }) => ({ ...r, subject: maskPersonal(r.subject), assignee: assigneeAdminId ? { id: assigneeAdminId, name: names.get(assigneeAdminId) ?? null } : null, entryCount: _count.entries }));
  return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}
export async function getForPlatform(id: string) {
  const r = await db.platformSupportRequest.findUnique({ where: { id }, include: { college: { select: { id: true, name: true } }, entries: { orderBy: { createdAt: "asc" } } } });
  if (!r) throw notFound("Support request not found");
  const requester = r.requesterId ? await db.user.findUnique({ where: { id: r.requesterId }, select: { name: true, role: true } }) : null;
  const known = await knownIds(r.collegeId, [r.subject, ...r.entries.map((e) => e.body)]);
  const names = await adminNames([r.assigneeAdminId, ...r.entries.map((e) => e.authorAdminId)]);
  return {
    id: r.id, institution: r.college, category: r.category, subject: maskPersonal(r.subject, known), status: r.status, priority: r.priority, createdAt: r.createdAt, updatedAt: r.updatedAt, resolvedAt: r.resolvedAt,
    requester: requester ? { name: requester.name, role: requester.role } : null,
    assignee: r.assigneeAdminId ? { id: r.assigneeAdminId, name: names.get(r.assigneeAdminId) ?? null } : null,
    entries: r.entries.map((e) => ({ id: e.id, kind: e.kind, body: maskPersonal(e.body, known), at: e.createdAt, by: e.authorAdminId ? { name: names.get(e.authorAdminId) ?? null } : e.authorUserId ? { name: requester?.name ?? "Institution administrator" } : null })),
  };
}
const must = async (id: string) => {
  const r = await db.platformSupportRequest.findUnique({ where: { id }, select: { id: true, collegeId: true, status: true, assigneeAdminId: true } });
  if (!r) throw notFound("Support request not found");
  return r;
};
const acting = (admin: PlatformSession, collegeId: string) => ({ collegeId, userId: null, platformActorId: admin.adminId });
const entity = "PlatformSupportRequest";
const RESOLVED = () => new ApiError(409, "CONFLICT", "This request is already resolved");

export async function assign(admin: PlatformSession, id: string, assigneeAdminId: string | null) {
  const r = await must(id);
  if (assigneeAdminId && !(await db.platformAdmin.findFirst({ where: { id: assigneeAdminId, isActive: true }, select: { id: true } }))) throw badRequest("Assignee is not an active platform administrator");
  return db.$transaction(async (tx) => {
    const claim = await tx.platformSupportRequest.updateMany({ where: { id, status: { not: "RESOLVED" } }, data: { assigneeAdminId, ...(assigneeAdminId && r.status === "OPEN" ? { status: "IN_PROGRESS" as const } : {}) } });
    if (claim.count === 0) throw RESOLVED();
    await tx.platformSupportEntry.create({ data: { requestId: id, kind: "EVENT", authorAdminId: admin.adminId, body: assigneeAdminId ? "Assigned to the platform team" : "Unassigned" } });
    await audit(acting(admin, r.collegeId), { action: "support.assign", entity, entityId: id, before: { assigneeAdminId: r.assigneeAdminId }, after: { assigneeAdminId } }, tx);
    return { id, assigneeAdminId };
  });
}
/** Internal note: platform team only. Audited on the platform trail (not the institution's), without the note text. */
export async function addNote(admin: PlatformSession, id: string, message: string, req?: Request) {
  const r = await must(id);
  const e = await db.platformSupportEntry.create({ data: { requestId: id, kind: "NOTE", authorAdminId: admin.adminId, body: message } });
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "support.note", detail: { requestId: id, collegeId: r.collegeId, length: message.length }, req });
  return { id: e.id };
}
export async function platformReply(admin: PlatformSession, id: string, message: string) {
  const r = await must(id);
  return db.$transaction(async (tx) => {
    const claim = await tx.platformSupportRequest.updateMany({ where: { id, status: { not: "RESOLVED" } }, data: { updatedAt: new Date() } });
    if (claim.count === 0) throw RESOLVED();
    await tx.platformSupportEntry.create({ data: { requestId: id, kind: "REPLY", authorAdminId: admin.adminId, body: message } });
    await audit(acting(admin, r.collegeId), { action: "support.reply", entity, entityId: id }, tx);
    return { id };
  });
}
/** Status change between OPEN and IN_PROGRESS. RESOLVED has its own route (it needs a resolution message). */
export async function setStatus(admin: PlatformSession, id: string, status: "OPEN" | "IN_PROGRESS") {
  const r = await must(id);
  return db.$transaction(async (tx) => {
    const claim = await tx.platformSupportRequest.updateMany({ where: { id, status: { notIn: ["RESOLVED", status] } }, data: { status } });
    if (claim.count === 0) throw r.status === "RESOLVED" ? RESOLVED() : new ApiError(409, "CONFLICT", "The request already has that status");
    await tx.platformSupportEntry.create({ data: { requestId: id, kind: "EVENT", authorAdminId: admin.adminId, body: `Status changed to ${status === "OPEN" ? "Open" : "In progress"}` } });
    await audit(acting(admin, r.collegeId), { action: "support.status", entity, entityId: id, before: { status: r.status }, after: { status } }, tx);
    return { id, status };
  });
}
export async function resolve(admin: PlatformSession, id: string, message: string) {
  const r = await must(id);
  return db.$transaction(async (tx) => {
    const claim = await tx.platformSupportRequest.updateMany({ where: { id, status: { not: "RESOLVED" } }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    if (claim.count === 0) throw RESOLVED();
    await tx.platformSupportEntry.create({ data: { requestId: id, kind: "REPLY", authorAdminId: admin.adminId, body: message } });
    await tx.platformSupportEntry.create({ data: { requestId: id, kind: "EVENT", authorAdminId: admin.adminId, body: "Resolved" } });
    await audit(acting(admin, r.collegeId), { action: "support.resolve", entity, entityId: id, before: { status: r.status }, after: { status: "RESOLVED" } }, tx);
    return { id, status: "RESOLVED" };
  });
}

// ---- Resolution metrics (counts and times only: no request text and no person)
const HOUR = 3_600_000;
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Hours from creation to resolution for each resolved request, summarised. Rows without a resolution time, or with one before the creation time, are ignored. */
export function summariseResolution(rows: { createdAt: Date; resolvedAt: Date | null }[]) {
  const hours = rows.flatMap((r) => (r.resolvedAt && r.resolvedAt >= r.createdAt ? [(r.resolvedAt.getTime() - r.createdAt.getTime()) / HOUR] : []));
  const med = median(hours);
  return { resolved: hours.length, medianHours: med === null ? null : Math.round(med * 10) / 10, averageHours: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null };
}
export const METRICS_WINDOW_DAYS = 30;
const METRICS_MAX_ROWS = 1000;
export async function supportMetrics(now = new Date()) {
  const since = new Date(now.getTime() - METRICS_WINDOW_DAYS * 24 * HOUR);
  const [byStatus, unassigned, resolvedRows, oldest] = await Promise.all([
    db.platformSupportRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    db.platformSupportRequest.count({ where: { status: { not: "RESOLVED" }, assigneeAdminId: null } }),
    db.platformSupportRequest.findMany({ where: { status: "RESOLVED", resolvedAt: { gte: since } }, select: { createdAt: true, resolvedAt: true }, orderBy: { resolvedAt: "desc" }, take: METRICS_MAX_ROWS }),
    db.platformSupportRequest.findFirst({ where: { status: { not: "RESOLVED" } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const count = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
  const res = summariseResolution(resolvedRows);
  return {
    generatedAt: now.toISOString(), windowDays: METRICS_WINDOW_DAYS,
    open: count("OPEN"), inProgress: count("IN_PROGRESS"), resolvedTotal: count("RESOLVED"), unassigned,
    oldestOpenAgeHours: oldest ? Math.round(((now.getTime() - oldest.createdAt.getTime()) / HOUR) * 10) / 10 : null,
    resolvedInWindow: res.resolved, medianResolutionHours: res.medianHours, averageResolutionHours: res.averageHours,
    basis: `Resolution time is measured from when a request was opened to when it was resolved, for requests resolved in the last ${METRICS_WINDOW_DAYS} days (at most ${METRICS_MAX_ROWS} most recent).`,
  };
}

// ---- Priority and reopening (Control Centre, 4.7). Priority is internal to the platform team: it is never shown to the institution and adds no conversation entry.
export const priorityInput = z.object({ priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]) }).strict();
export const reopenInput = z.object({ reason: z.string().trim().min(3).max(1000) }).strict();
export async function setPriority(admin: PlatformSession, id: string, priority: z.infer<typeof priorityInput>["priority"]) {
  const r = await must(id);
  const before = await db.platformSupportRequest.findUnique({ where: { id }, select: { priority: true } });
  await db.$transaction(async (tx) => {
    await tx.platformSupportRequest.update({ where: { id }, data: { priority } });
    await audit(acting(admin, r.collegeId), { action: "support.priority", entity, entityId: id, before: { priority: before?.priority ?? "NORMAL" }, after: { priority } }, tx);
  });
  return { id, priority };
}
/** Only a resolved request can be reopened, and the institution sees a plain event. The reason is kept as an internal note, not shown to the institution. */
export async function reopen(admin: PlatformSession, id: string, reason: string) {
  const r = await must(id);
  return db.$transaction(async (tx) => {
    const claim = await tx.platformSupportRequest.updateMany({ where: { id, status: "RESOLVED" }, data: { status: "OPEN", resolvedAt: null } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only a resolved request can be reopened");
    await tx.platformSupportEntry.create({ data: { requestId: id, kind: "EVENT", authorAdminId: admin.adminId, body: "Reopened" } });
    await tx.platformSupportEntry.create({ data: { requestId: id, kind: "NOTE", authorAdminId: admin.adminId, body: `Reason for reopening: ${reason}` } });
    await audit(acting(admin, r.collegeId), { action: "support.reopen", entity, entityId: id, before: { status: "RESOLVED" }, after: { status: "OPEN" } }, tx);
    return { id, status: "OPEN" };
  });
}

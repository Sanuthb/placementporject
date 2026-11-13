import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, notFound } from "@/lib/api/errors";
import { platformAudit } from "@/lib/platformAudit";
import type { PlatformSession } from "@/lib/auth/platform";

/**
 * Platform incidents (Control Centre, 4.8). A platform administrator records an outage or degradation and posts updates until it is resolved.
 * Nothing is detected or created automatically, and an incident holds no student, staff or institution data: it is about the platform itself.
 * A resolved incident is final (the history stays); a new problem is a new incident.
 */
export const SEVERITIES = ["MINOR", "MAJOR", "CRITICAL"] as const;
export const STATUSES = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"] as const;
export type IncidentStatus = (typeof STATUSES)[number];

export const createInput = z.object({
  title: z.string().trim().min(3).max(160),
  severity: z.enum(SEVERITIES),
  message: z.string().trim().min(3).max(2000),
}).strict();
export const updateInput = z.object({ status: z.enum(STATUSES), message: z.string().trim().min(3).max(2000) }).strict();
export const incidentQuery = z.object({
  status: z.enum(["ACTIVE", ...STATUSES]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

/** Updates can be posted until the incident is resolved. After that it is read-only. */
export const canUpdate = (current: IncidentStatus) => current !== "RESOLVED";
/** Whole minutes an incident has lasted (or has been open so far). Never negative. */
export function durationMinutes(startedAt: Date, resolvedAt: Date | null, now: Date) {
  return Math.max(0, Math.round(((resolvedAt ?? now).getTime() - startedAt.getTime()) / 60_000));
}

const names = async (ids: (string | null)[]) => {
  const list = [...new Set(ids.filter((i): i is string => !!i))];
  const rows = list.length ? await db.platformAdmin.findMany({ where: { id: { in: list } }, select: { id: true, name: true } }) : [];
  return new Map(rows.map((r) => [r.id, r.name]));
};

export async function listIncidents(q: z.infer<typeof incidentQuery>, now = new Date()) {
  const where = q.status === "ACTIVE" ? { status: { not: "RESOLVED" as const } } : q.status ? { status: q.status } : {};
  const [total, active, rows] = await Promise.all([
    db.platformIncident.count({ where }),
    db.platformIncident.count({ where: { status: { not: "RESOLVED" } } }),
    db.platformIncident.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "asc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, title: true, severity: true, status: true, startedAt: true, resolvedAt: true, _count: { select: { updates: true } } } }),
  ]);
  return {
    items: rows.map(({ _count, ...r }) => ({ ...r, updateCount: _count.updates, durationMinutes: durationMinutes(r.startedAt, r.resolvedAt, now) })),
    active, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function getIncident(id: string, now = new Date()) {
  const r = await db.platformIncident.findUnique({ where: { id }, include: { updates: { orderBy: { createdAt: "asc" } } } });
  if (!r) throw notFound("Incident not found");
  const by = await names(r.updates.map((u) => u.adminId));
  return {
    id: r.id, title: r.title, severity: r.severity, status: r.status, startedAt: r.startedAt, resolvedAt: r.resolvedAt, durationMinutes: durationMinutes(r.startedAt, r.resolvedAt, now),
    updates: r.updates.map((u) => ({ id: u.id, status: u.status, message: u.message, at: u.createdAt, by: u.adminId ? { name: by.get(u.adminId) ?? null } : null })),
  };
}

export async function createIncident(admin: PlatformSession, input: z.infer<typeof createInput>) {
  const r = await db.platformIncident.create({
    data: { title: input.title, severity: input.severity, status: "INVESTIGATING", createdByAdminId: admin.adminId, updates: { create: { status: "INVESTIGATING", message: input.message, adminId: admin.adminId } } },
    select: { id: true, status: true },
  });
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "incident.create", detail: { incidentId: r.id, severity: input.severity } });
  return r;
}

export async function addUpdate(admin: PlatformSession, id: string, input: z.infer<typeof updateInput>) {
  const exists = await db.platformIncident.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound("Incident not found");
  const result = await db.$transaction(async (tx) => {
    // The status check and the change are one statement, so two administrators cannot both update a resolved incident.
    const claim = await tx.platformIncident.updateMany({
      where: { id, status: { not: "RESOLVED" } },
      data: { status: input.status, resolvedAt: input.status === "RESOLVED" ? new Date() : null },
    });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "This incident is resolved. Open a new incident for a new problem");
    await tx.platformIncidentUpdate.create({ data: { incidentId: id, status: input.status, message: input.message, adminId: admin.adminId } });
    return { id, status: input.status };
  });
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: input.status === "RESOLVED" ? "incident.resolve" : "incident.update", detail: { incidentId: id, status: input.status } });
  return result;
}

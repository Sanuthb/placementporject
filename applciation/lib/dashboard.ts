import { db } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { hasRole, isCoordinatorOnly } from "@/lib/auth/session";
import type { ModuleKey, Role } from "@/generated/prisma/client";

const DAY = 86_400_000;

const ACTIONS: { key: string; label: string; method: string; path: string; module?: ModuleKey; roles: Role[] }[] = [
  { key: "import_students", label: "Import students", method: "POST", path: "/api/students/import/preview", module: "ONBOARDING", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
  { key: "create_drive", label: "Create a drive", method: "POST", path: "/api/drives", module: "DRIVES", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] },
  { key: "verification_queue", label: "Open the verification queue", method: "GET", path: "/api/verification/queue", module: "ONBOARDING", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"] },
  { key: "approvals", label: "Review approvals", method: "GET", path: "/api/approvals?status=PENDING", roles: ["TPO_ADMIN"] },
  { key: "tickets", label: "Open support tickets", method: "GET", path: "/api/tickets?status=OPEN", roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"] },
];

/**
 * Landing page numbers. Sections for modules the college has not bought are left out, and department
 * coordinators only see their own department. Placement percentages count only students registered
 * for placement, so opted-out students never lower them.
 */
export async function dashboard(s: Session) {
  const now = new Date();
  const mods = new Set((await db.collegeModule.findMany({ where: { collegeId: s.collegeId, enabled: true }, select: { module: true } })).map((m) => m.module));
  const scope = isCoordinatorOnly(s) ? { departmentId: s.departmentId ?? "none" } : {};
  const base = { collegeId: s.collegeId, isActive: true, isArchived: false, ...scope };
  const registered = { ...base, participationStatus: "REGISTERED" as const };
  const out: Record<string, unknown> = { generatedAt: now };

  if (mods.has("ONBOARDING")) {
    const [total, invited, active, awaitingReview, verified, onboarded, placed, registeredCount] = await Promise.all([
      db.student.count({ where: base }),
      db.student.count({ where: { ...base, inviteStatus: { in: ["SENT", "ACTIVATED"] } } }),
      db.student.count({ where: { ...base, inviteStatus: "ACTIVATED" } }),
      db.student.count({ where: { ...base, sections: { some: { status: "SUBMITTED" } } } }),
      db.student.count({ where: { ...base, stage: "VERIFIED" } }),
      db.student.count({ where: { ...base, stage: "ONBOARDED" } }),
      db.student.count({ where: { ...registered, isPlaced: true } }),
      db.student.count({ where: registered }),
    ]);
    out.studentCounts = { total, invited, active, awaitingReview, verified, onboarded, placed, registeredForPlacement: registeredCount };
    // Registered students split into placed and still looking; everyone else (opted out, higher studies, ...) is shown apart so they never lower the rate.
    out.placementSplit = { placed, unplaced: Math.max(registeredCount - placed, 0), notRegistered: Math.max(total - registeredCount, 0) };

    const [byDept, byDeptPlaced, byBatch, byBatchPlaced, depts, batches] = await Promise.all([
      db.student.groupBy({ by: ["departmentId"], where: registered, _count: true }),
      db.student.groupBy({ by: ["departmentId"], where: { ...registered, isPlaced: true }, _count: true }),
      db.student.groupBy({ by: ["batchId"], where: registered, _count: true }),
      db.student.groupBy({ by: ["batchId"], where: { ...registered, isPlaced: true }, _count: true }),
      db.department.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true, code: true } }),
      db.batch.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }),
    ]);
    const pct = (p: number, t: number) => (t ? Math.round((p / t) * 1000) / 10 : 0);
    out.placementProgress = {
      overall: { placed, total: registeredCount, percentage: pct(placed, registeredCount) },
      byDepartment: byDept.map((d) => { const p = byDeptPlaced.find((x) => x.departmentId === d.departmentId)?._count ?? 0; const dep = depts.find((x) => x.id === d.departmentId); return { departmentId: d.departmentId, name: dep?.name, code: dep?.code, placed: p, total: d._count, percentage: pct(p, d._count) }; }),
      byBatch: byBatch.map((b) => { const p = byBatchPlaced.find((x) => x.batchId === b.batchId)?._count ?? 0; return { batchId: b.batchId, name: batches.find((x) => x.id === b.batchId)?.name, placed: p, total: b._count, percentage: pct(p, b._count) }; }),
    };
  }

  // Needs your attention
  const attention: Record<string, unknown> = {};
  if (mods.has("ONBOARDING")) {
    const waiting = await db.studentSection.aggregate({ where: { collegeId: s.collegeId, status: "SUBMITTED", student: { isActive: true, ...scope } }, _count: true, _min: { submittedAt: true } });
    attention.sectionsAwaitingReview = { count: waiting._count, oldestWaitingDays: waiting._min.submittedAt ? Math.floor((now.getTime() - waiting._min.submittedAt.getTime()) / DAY) : 0 };
  }
  if (mods.has("DRIVES")) {
    attention.drivesClosingSoon = await db.drive.findMany({
      where: { collegeId: s.collegeId, status: "PUBLISHED", applicationDeadline: { gt: now, lte: new Date(now.getTime() + 3 * DAY) } },
      select: { id: true, role: true, applicationDeadline: true, company: { select: { name: true } }, _count: { select: { applications: true } } }, orderBy: { applicationDeadline: "asc" }, take: 10,
    });
    const awaiting = await db.offer.findMany({ where: { collegeId: s.collegeId, status: "OFFERED", isHistorical: false, student: { ...scope } }, select: { expiresAt: true } });
    attention.offersAwaitingResponse = { count: awaiting.length, expiringWithin3Days: awaiting.filter((o) => o.expiresAt && o.expiresAt.getTime() <= now.getTime() + 3 * DAY).length };
  }
  if (hasRole(s, "TPO_ADMIN")) attention.approvalsPending = await db.approvalRequest.count({ where: { collegeId: s.collegeId, status: "PENDING" } });
  attention.openTickets = await db.ticket.count({ where: { collegeId: s.collegeId, status: { not: "RESOLVED" }, ...scope } });
  out.needsAttention = attention;

  if (mods.has("DRIVES")) {
    const week = new Date(now.getTime() + 7 * DAY);
    const [drives, rounds, weekOffers] = await Promise.all([
      db.drive.findMany({ where: { collegeId: s.collegeId, status: "PUBLISHED", driveDate: { gte: now, lte: week } }, select: { id: true, role: true, driveDate: true, venue: true, company: { select: { name: true } } }, orderBy: { driveDate: "asc" }, take: 20 }),
      db.driveRound.findMany({ where: { scheduledAt: { gte: now, lte: week }, drive: { collegeId: s.collegeId, status: "PUBLISHED" } }, select: { id: true, order: true, type: true, scheduledAt: true, venue: true, drive: { select: { id: true, role: true, company: { select: { name: true } } } } }, orderBy: { scheduledAt: "asc" }, take: 30 }),
      db.offer.findMany({ where: { collegeId: s.collegeId, isHistorical: false, offeredAt: { gte: new Date(now.getTime() - 7 * DAY) }, student: { ...scope } }, select: { id: true, role: true, packageLpa: true, status: true, offeredAt: true, student: { select: { id: true, name: true } }, company: { select: { name: true } } }, orderBy: { offeredAt: "desc" }, take: 10 }),
    ]);
    out.upcoming = { drives, rounds };
    out.offersThisWeek = { count: weekOffers.length, latest: weekOffers };

    // Season-level insights for the dashboard tiles: package spread, who hires and pays most, and the state of the drives.
    const [accepted, driveStatus] = await Promise.all([
      db.offer.findMany({ where: { collegeId: s.collegeId, status: "ACCEPTED", isHistorical: false, student: { ...scope } }, select: { packageLpa: true, company: { select: { name: true } } } }),
      db.drive.groupBy({ by: ["status"], where: { collegeId: s.collegeId }, _count: true }),
    ]);
    const priced = accepted.filter((o) => o.packageLpa !== null).map((o) => ({ lpa: Number(o.packageLpa), company: o.company.name }));
    const lpas = priced.map((p) => p.lpa);
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const buckets = new Map<number, number>();
    for (const v of lpas) buckets.set(Math.floor(v / 5) * 5, (buckets.get(Math.floor(v / 5) * 5) ?? 0) + 1);
    const hires = new Map<string, number>(), best = new Map<string, number>();
    for (const o of accepted) hires.set(o.company.name, (hires.get(o.company.name) ?? 0) + 1);
    for (const p of priced) best.set(p.company, Math.max(best.get(p.company) ?? 0, p.lpa));
    out.insights = {
      ctc: { unit: "LPA", count: lpas.length, min: lpas.length ? Math.min(...lpas) : null, max: lpas.length ? Math.max(...lpas) : null, average: lpas.length ? round1(lpas.reduce((a, b) => a + b, 0) / lpas.length) : null },
      ctcBuckets: [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([from, count]) => ({ label: `${from}–${from + 5}`, count })),
      topHiring: [...hires.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([company, count]) => ({ company, count })),
      topPaying: [...best.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([company, lpa]) => ({ company, lpa })),
      driveStatus: driveStatus.map((d) => ({ status: d.status, count: d._count })),
    };
  }
  out.quickActions = ACTIONS.filter((a) => hasRole(s, ...a.roles) && (!a.module || mods.has(a.module))).map(({ key, label, method, path }) => ({ key, label, method, path }));
  return out;
}

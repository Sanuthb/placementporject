import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { RES_STAFF } from "@/lib/resourceService";
import { effectiveness } from "@/lib/resources";

/** The library at a glance: what is waiting, what is expiring, and which approved resources students use and rate best (and worst). */
export const GET = route(RES_STAFF, async (_req, s) => {
  const soon = new Date(Date.now() + 14 * 86_400_000);
  const [byStatus, expiring, approved, progress, assignments] = await Promise.all([
    db.prepResource.groupBy({ by: ["status"], where: { collegeId: s.collegeId }, _count: true }),
    db.prepResource.count({ where: { collegeId: s.collegeId, status: "APPROVED", expiresAt: { lt: soon } } }),
    db.prepResource.findMany({ where: { collegeId: s.collegeId, status: "APPROVED" }, select: { id: true, title: true, type: true, category: true } }),
    db.resourceProgress.findMany({ where: { collegeId: s.collegeId }, select: { resourceId: true, openedAt: true, completedAt: true, rating: true } }),
    db.resourceAssignment.groupBy({ by: ["resourceId"], where: { collegeId: s.collegeId }, _count: true }),
  ]);
  const n = (st: string) => byStatus.find((x) => x.status === st)?._count ?? 0;
  const rows = approved.map((r) => {
    const p = progress.filter((x) => x.resourceId === r.id);
    const e = effectiveness({ assigned: 0, rows: p.map((x) => ({ opened: !!x.openedAt, completed: !!x.completedAt, rating: x.rating })) });
    return { id: r.id, title: r.title, type: r.type, assignments: assignments.find((a) => a.resourceId === r.id)?._count ?? 0, students: p.length, completed: e.completed, averageRating: e.averageRating, ratings: e.ratings };
  });
  const rated = rows.filter((r) => r.ratings >= 3);
  return {
    counts: { draft: n("DRAFT"), inReview: n("IN_REVIEW"), approved: n("APPROVED"), rejected: n("REJECTED"), archived: n("ARCHIVED"), expiringOrExpired: expiring },
    mostUsed: [...rows].sort((a, b) => b.students - a.students).filter((r) => r.students > 0).slice(0, 5),
    bestRated: [...rated].sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0)).slice(0, 5),
    needsAttention: rated.filter((r) => (r.averageRating ?? 5) < 3).slice(0, 5),
    unused: rows.filter((r) => r.students === 0).slice(0, 10).map(({ id, title, assignments }) => ({ id, title, assignments })),
  };
});

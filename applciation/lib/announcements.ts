import { db } from "@/lib/db";

/**
 * For the student app: announcements currently visible to a student.
 * Targets are matched in code because Prisma's empty-array filters (isEmpty / equals: []) return nothing for uuid[] columns on this driver.
 */
export async function announcementsFor(student: { collegeId: string; departmentId: string; batchId: string }, archive = false) {
  const now = new Date();
  const rows = await db.announcement.findMany({
    where: { collegeId: student.collegeId, isActive: true, publishedAt: { lte: now }, ...(archive ? { expiresAt: { lte: now } } : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }) },
    select: { id: true, title: true, body: true, publishedAt: true, expiresAt: true, targetDepartmentIds: true, targetBatchIds: true },
    orderBy: { publishedAt: "desc" },
    take: 200,
  });
  return rows
    .filter((a) => (!a.targetDepartmentIds.length || a.targetDepartmentIds.includes(student.departmentId)) && (!a.targetBatchIds.length || a.targetBatchIds.includes(student.batchId)))
    .map((a) => ({ id: a.id, title: a.title, body: a.body, publishedAt: a.publishedAt, expiresAt: a.expiresAt }));
}

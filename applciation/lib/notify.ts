import { db } from "@/lib/db";
import type { Prisma, Role } from "@/generated/prisma/client";

type Client = Prisma.TransactionClient | typeof db;
type Note = { type: string; title: string; body?: string; link?: string };

/**
 * In-app notification for staff. Admins and officers are notified by default; pass `departmentId`
 * to also reach that department's coordinators, and `excludeUserId` to skip the person who caused it.
 */
export async function notifyStaff(collegeId: string, note: Note & { roles?: Role[]; departmentId?: string | null; excludeUserId?: string | null }, tx: Client = db) {
  const roles = note.roles ?? ["TPO_ADMIN", "PLACEMENT_OFFICER"];
  const users = await tx.user.findMany({
    where: {
      collegeId, isActive: true, id: note.excludeUserId ? { not: note.excludeUserId } : undefined,
      OR: [{ role: { in: roles } }, ...(note.departmentId ? [{ role: "DEPARTMENT_COORDINATOR" as const, departmentId: note.departmentId }] : [])],
    },
    select: { id: true },
  });
  if (!users.length) return 0;
  await tx.notification.createMany({ data: users.map((u) => ({ collegeId, userId: u.id, type: note.type, title: note.title, body: note.body, link: note.link })) });
  return users.length;
}

/** In-app notification for a student (read by the student app). */
export async function notifyStudent(collegeId: string, studentId: string, note: Note, tx: Client = db) {
  await tx.notification.create({ data: { collegeId, studentId, type: note.type, title: note.title, body: note.body, link: note.link } });
}

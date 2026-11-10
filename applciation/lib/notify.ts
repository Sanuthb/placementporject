import { db } from "@/lib/db";
import type { Prisma, Role } from "@/generated/prisma/client";
import { categoryOf, isMandatory } from "@/lib/notifyRules";

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
      OR: [{ role: { in: roles } }, { extraRoles: { hasSome: roles } }, ...(note.departmentId ? [{ role: "DEPARTMENT_COORDINATOR" as const, departmentId: note.departmentId }] : [])],
    },
    select: { id: true },
  });
  // People who have muted this kind of notification in the app are skipped (account and offer messages cannot be muted).
  const cat = categoryOf(note.type);
  const muted = isMandatory(cat) ? new Set<string>() : new Set((await tx.notificationPref.findMany({ where: { ownerKey: { in: users.map((u) => `U:${u.id}`) }, category: cat, channel: "IN_APP", enabled: false }, select: { userId: true } })).map((p) => p.userId));
  const keep = users.filter((u) => !muted.has(u.id));
  if (!keep.length) return 0;
  await tx.notification.createMany({ data: keep.map((u) => ({ collegeId, userId: u.id, type: note.type, title: note.title, body: note.body, link: note.link })) });
  return keep.length;
}

/** In-app notification for a student (read by the student app). */
export async function notifyStudent(collegeId: string, studentId: string, note: Note, tx: Client = db) {
  // A student who has switched this kind of notification off in the app does not get it there (account and offer messages cannot be switched off).
  const cat = categoryOf(note.type);
  if (!isMandatory(cat) && (await tx.notificationPref.findUnique({ where: { ownerKey_category_channel: { ownerKey: `S:${studentId}`, category: cat, channel: "IN_APP" } }, select: { enabled: true } }))?.enabled === false) return;
  const n = await tx.notification.create({ data: { collegeId, studentId, type: note.type, title: note.title, body: note.body, link: note.link } });
  // Outside a transaction the message can go to the student's other channels at once. Inside one, the periodic sweep (see lib/dispatch.ts) delivers it after the commit.
  if (tx === db) void import("@/lib/dispatch").then((m) => m.deliverNotification(n)).catch(() => undefined);
}

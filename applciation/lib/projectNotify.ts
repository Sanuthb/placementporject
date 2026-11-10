import { db } from "@/lib/db";

/** In-app notification for named staff users (such as a project's guide). */
export async function notifyUserIds(collegeId: string, userIds: string[], note: { type: string; title: string; body?: string; link?: string }) {
  if (!userIds.length) return;
  await db.notification.createMany({ data: userIds.map((userId) => ({ collegeId, userId, ...note })) });
}

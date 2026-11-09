import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";

/** Sign-in history of a staff member. Administrators only. */
export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (_req, s, { id }) => {
  if (!(await db.user.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Staff member not found");
  const items = await db.loginEvent.findMany({ where: { userId: id, collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, createdAt: true, method: true, mfa: true, ip: true, userAgent: true } });
  return { items };
});

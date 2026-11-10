import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";

/**
 * Public token surfaces (showcase, resume PDF, calendar feed, mentor review, internship feedback, invitations) have no login,
 * so nothing else stops a suspended institution being reached through them. Call this on EVERY request, reads and writes alike,
 * after the token is resolved. A suspended or missing institution looks exactly like an unknown token (same error the caller
 * already gets for a bad link), so the response reveals nothing about the institution or its state.
 */
export async function requireActiveCollege(collegeId: string, make: () => Error = () => notFound("Not found")): Promise<void> {
  const c = await db.college.findUnique({ where: { id: collegeId }, select: { isActive: true } });
  if (!c?.isActive) throw make();
}

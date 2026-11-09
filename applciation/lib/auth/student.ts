import type { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth/verifyToken";
import { db } from "@/lib/db";
import { forbidden, unauthorized } from "@/lib/api/errors";

export type StudentSession = { studentId: string; userId: string; collegeId: string; departmentId: string; batchId: string; name: string; email: string };

/** Verifies the Supabase JWT and loads the student it belongs to. Inactive, archived or deactivated-college accounts are refused. */
export async function getStudentSession(req: NextRequest): Promise<StudentSession> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw unauthorized();
  const authId = await verifyToken(token);

  const st = await db.student.findUnique({ where: { userId: authId }, include: { college: { select: { isActive: true } } } });
  if (!st || !st.isActive || st.isArchived || !st.college.isActive) throw forbidden("This is not an active student account");
  // First sign-in after accepting the invite marks the account as activated.
  if (st.inviteStatus !== "ACTIVATED") await db.student.update({ where: { id: st.id }, data: { inviteStatus: "ACTIVATED" } });
  // Last activity, written at most every ten minutes so a busy student does not cause a write per request.
  if (!st.lastActivityAt || Date.now() - st.lastActivityAt.getTime() > 600_000) void db.student.update({ where: { id: st.id }, data: { lastActivityAt: new Date() } }).catch(() => undefined);
  return { studentId: st.id, userId: authId, collegeId: st.collegeId, departmentId: st.departmentId, batchId: st.batchId, name: st.name, email: st.email };
}

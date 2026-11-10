import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { nextApplication, type AppStatus } from "@/lib/internships";

/** Withdraw an application that has not been decided by the company. */
export const DELETE = studentRoute<{ id: string }>({ module: "INTERNSHIPS" }, async (_req, me, { id }) => {
  const a = await db.internshipApplication.findFirst({ where: { id, studentId: me.studentId } });
  if (!a) throw notFound("Application not found");
  const next = nextApplication(a.status as AppStatus, "WITHDRAW", a.selfSourced);
  if ("error" in next) throw badRequest(next.error);
  const r = await db.internshipApplication.updateMany({ where: { id, status: a.status }, data: { status: "WITHDRAWN" } });
  if (r.count === 0) throw badRequest("This application just changed. Reload and try again");
  return { ok: true };
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { departmentScope } from "@/lib/auth/session";

const R = { module: "INTERNSHIPS" as const };
const body = z.object({ status: z.enum(["ONGOING", "COMPLETED", "TERMINATED"]) });
const FROM: Record<string, string[]> = { ONGOING: ["ALLOTTED"], COMPLETED: ["ONGOING"], TERMINATED: ["ALLOTTED", "ONGOING"] };

export const GET = route<{ id: string }>(R, async (_req, s, { id }) => {
  const i = await db.internship.findFirst({
    where: { id, collegeId: s.collegeId, student: { ...departmentScope(s) } },
    include: { student: { select: { id: true, name: true, enrollmentNo: true } }, logs: { orderBy: { weekStart: "asc" } }, evaluations: { orderBy: { createdAt: "desc" } } },
  });
  if (!i) throw notFound("Internship not found");
  const approvedHours = i.logs.filter((l) => l.status === "APPROVED").reduce((a, l) => a + l.hours, 0);
  const scores = i.evaluations.map((e) => e.score);
  return { ...i, summary: { approvedHours, logsAwaitingReview: i.logs.filter((l) => l.status === "SUBMITTED").length, averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null } };
});

/** Start, complete or terminate. */
export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "INTERNSHIPS" }, async (req, s, { id }) => {
  const { status } = await parseBody(req, body);
  return db.$transaction(async (tx) => {
    const claim = await tx.internship.updateMany({ where: { id, collegeId: s.collegeId, status: { in: FROM[status] as never[] } }, data: { status } });
    if (claim.count === 0) {
      if (!(await tx.internship.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Internship not found");
      throw new ApiError(409, "CONFLICT", `This internship cannot move to ${status.toLowerCase()} from its current state`);
    }
    await audit(s, { action: `internship.${status.toLowerCase()}`, entity: "Internship", entityId: id }, tx);
    return { id, status };
  });
});

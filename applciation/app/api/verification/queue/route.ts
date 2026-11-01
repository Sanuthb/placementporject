import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { ProfileSection } from "@/generated/prisma/client";

const query = z.object({
  section: z.enum(ProfileSection).optional(),
  departmentId: z.uuid().optional(),
  batchId: z.uuid().optional(),
  waitingDays: z.coerce.number().int().min(0).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.uuid().optional(),
});

export const GET = route({ module: "ONBOARDING" }, async (req, s) => {
  const q = parseQuery(req, query);
  const scope = departmentScope(s);
  const rows = await db.studentSection.findMany({
    where: {
      collegeId: s.collegeId,
      status: "SUBMITTED",
      section: q.section,
      ...(q.waitingDays ? { submittedAt: { lte: new Date(Date.now() - q.waitingDays * 86_400_000) } } : {}),
      student: { isActive: true, ...scope, ...(q.departmentId && !scope.departmentId ? { departmentId: q.departmentId } : {}), batchId: q.batchId },
    },
    select: {
      id: true, section: true, submittedAt: true, pendingData: true,
      student: { select: { id: true, name: true, enrollmentNo: true, departmentId: true, batchId: true } },
    },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = (hasMore ? rows.slice(0, q.limit) : rows).map(({ pendingData, ...r }) => ({ ...r, isRevision: pendingData !== null }));
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

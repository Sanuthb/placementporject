import { hasRole } from "@/lib/auth/session";
import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";

export const GET = route<{ id: string }>({}, async (_req, s, { id }) => {
  const r = await db.approvalRequest.findFirst({
    where: { id, collegeId: s.collegeId, ...(hasRole(s, "TPO_ADMIN") ? {} : { requestedById: s.userId }) },
    include: { requestedBy: { select: { id: true, name: true } }, decidedBy: { select: { id: true, name: true } } },
  });
  if (!r) throw notFound("Approval request not found");
  return r;
});

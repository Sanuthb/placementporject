import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { RequestStatus } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(RequestStatus).default("PENDING") });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, (req, s) => {
  const { status } = parseQuery(req, query);
  return db.participationRequest.findMany({
    where: { collegeId: s.collegeId, status, student: { ...departmentScope(s) } },
    select: { id: true, requestedStatus: true, reason: true, status: true, createdAt: true, decisionComment: true, student: { select: { id: true, name: true, enrollmentNo: true, participationStatus: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
});

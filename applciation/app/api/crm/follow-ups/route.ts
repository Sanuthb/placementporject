import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EMPLOYER_CRM" }, (_req, s) =>
  db.prospect.findMany({ where: { collegeId: s.collegeId, nextFollowUpAt: { lte: new Date() }, stage: { notIn: ["WON", "LOST"] } }, select: { id: true, companyName: true, stage: true, nextFollowUpAt: true, owner: { select: { id: true, name: true } } }, orderBy: { nextFollowUpAt: "asc" }, take: 200 }),
);

import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

/** Prospects per stage, and how many follow-ups are due. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EMPLOYER_CRM" }, async (_req, s) => {
  const [by, due] = await Promise.all([
    db.prospect.groupBy({ by: ["stage"], where: { collegeId: s.collegeId }, _count: true }),
    db.prospect.count({ where: { collegeId: s.collegeId, nextFollowUpAt: { lte: new Date() }, stage: { notIn: ["WON", "LOST"] } } }),
  ]);
  const stages = ["PROSPECT", "IN_CONVERSATION", "DRIVE_SCHEDULED", "WON", "LOST"] as const;
  return { stages: stages.map((st) => ({ stage: st, count: by.find((x) => x.stage === st)?._count ?? 0 })), followUpsDue: due };
});

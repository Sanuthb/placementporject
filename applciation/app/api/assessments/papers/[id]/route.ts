import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ASSESSMENTS" }, async (_req, s, { id }) => {
  const p = await db.assessmentPaper.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!p) throw notFound("Paper not found");
  return p;
});

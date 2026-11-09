import { z } from "zod";
import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { parseBody } from "@/lib/api/parse";
import { audit } from "@/lib/audit";
import { AssessmentCategory } from "@/generated/prisma/client";

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ASSESSMENTS" }, async (_req, s, { id }) => {
  const p = await db.assessmentPaper.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!p) throw notFound("Paper not found");
  return p;
});

const patch = z.object({ category: z.enum(AssessmentCategory) });

/** Tag a paper with what it measures. Only the category: questions are frozen once a paper exists, so scheduled tests never change under students. */
export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ASSESSMENTS" }, async (req, s, { id }) => {
  const { category } = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.assessmentPaper.findFirst({ where: { id, collegeId: s.collegeId }, select: { category: true } });
    if (!before) throw notFound("Paper not found");
    const p = await tx.assessmentPaper.update({ where: { id }, data: { category }, select: { id: true, category: true } });
    await audit(s, { action: "paper.category", entity: "AssessmentPaper", entityId: id, before: { category: before.category }, after: { category } }, tx);
    return p;
  });
});

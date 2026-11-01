import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { EvaluatorType } from "@/generated/prisma/client";

const body = z.object({ evaluatorType: z.enum(EvaluatorType), evaluatorName: z.string().trim().min(2).max(120), score: z.number().int().min(0).max(100), remarks: z.string().trim().max(2000).optional() });

/** Company or faculty evaluation, scored out of 100. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "INTERNSHIPS" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  if (!(await db.internship.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Internship not found");
  return db.$transaction(async (tx) => {
    const e = await tx.internshipEvaluation.create({ data: { internshipId: id, createdById: s.userId, ...b } });
    await audit(s, { action: "internship.evaluate", entity: "Internship", entityId: id, after: { evaluatorType: b.evaluatorType, score: b.score } }, tx);
    return e;
  });
});

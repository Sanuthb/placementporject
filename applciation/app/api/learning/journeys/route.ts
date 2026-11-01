import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { stepSchema } from "@/lib/learning";

const create = z.object({ name: z.string().trim().min(3).max(150), description: z.string().trim().max(2000).optional(), steps: z.array(stepSchema).min(1).max(50) });

/** Reusable learning journeys: an ordered list of steps that any programme can use. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "LEARNING" }, (_req, s) => db.learningJourney.findMany({ where: { collegeId: s.collegeId }, orderBy: { name: "asc" } }));

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "LEARNING" }, async (req, s) => {
  const b = await parseBody(req, create);
  if (await db.learningJourney.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name: b.name } } })) throw new ApiError(409, "CONFLICT", "A journey with this name already exists");
  return db.$transaction(async (tx) => {
    const j = await tx.learningJourney.create({ data: { ...b, collegeId: s.collegeId } });
    await audit(s, { action: "journey.create", entity: "LearningJourney", entityId: j.id, after: { name: j.name, steps: b.steps.length } }, tx);
    return j;
  });
});

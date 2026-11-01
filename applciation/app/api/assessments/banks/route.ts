import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";

const create = z.object({ name: z.string().trim().min(2).max(120), topic: z.string().trim().max(120).optional() });
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "ASSESSMENTS" as const };

export const GET = route(R, (_req, s) => db.questionBank.findMany({ where: { collegeId: s.collegeId }, include: { _count: { select: { questions: true } } }, orderBy: { name: "asc" } }));

export const POST = route(R, async (req, s) => {
  const b = await parseBody(req, create);
  if (await db.questionBank.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name: b.name } } })) throw new ApiError(409, "CONFLICT", "A question bank with this name already exists");
  return db.questionBank.create({ data: { ...b, collegeId: s.collegeId } });
});

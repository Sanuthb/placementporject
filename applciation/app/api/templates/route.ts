import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";

const create = z.object({ name: z.string().trim().min(2).max(100), subject: z.string().trim().min(3).max(200), body: z.string().trim().min(3).max(10_000) });

/** Reusable message text. Use {{name}} and it is replaced with each student's name when sent. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, (_req, s) => db.messageTemplate.findMany({ where: { collegeId: s.collegeId }, orderBy: { name: "asc" } }));

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s) => {
  const data = await parseBody(req, create);
  if (await db.messageTemplate.findUnique({ where: { collegeId_name: { collegeId: s.collegeId, name: data.name } } })) throw new ApiError(409, "CONFLICT", "A template with this name already exists");
  return db.messageTemplate.create({ data: { ...data, collegeId: s.collegeId, createdById: s.userId } });
});

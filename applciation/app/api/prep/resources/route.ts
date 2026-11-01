import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { ResourceCategory } from "@/generated/prisma/client";

const create = z.object({ title: z.string().trim().min(3).max(200), category: z.enum(ResourceCategory), url: z.url(), description: z.string().trim().max(2000).optional() });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, (_req, s) => db.prepResource.findMany({ where: { collegeId: s.collegeId }, orderBy: [{ category: "asc" }, { title: "asc" }], take: 500 }));
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, async (req, s) => db.prepResource.create({ data: { ...(await parseBody(req, create)), collegeId: s.collegeId } }));

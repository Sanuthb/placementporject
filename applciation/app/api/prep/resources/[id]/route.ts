import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";

const patch = z.object({ title: z.string().trim().min(3).max(200).optional(), url: z.url().optional(), description: z.string().trim().max(2000).nullable().optional(), isActive: z.boolean().optional() });

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, async (req, s, { id }) => {
  const r = await db.prepResource.updateMany({ where: { id, collegeId: s.collegeId }, data: await parseBody(req, patch) });
  if (r.count === 0) throw notFound("Resource not found");
  return db.prepResource.findUniqueOrThrow({ where: { id } });
});

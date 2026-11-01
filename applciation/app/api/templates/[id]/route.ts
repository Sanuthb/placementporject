import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";

const patch = z.object({ name: z.string().trim().min(2).max(100).optional(), subject: z.string().trim().min(3).max(200).optional(), body: z.string().trim().min(3).max(10_000).optional() });
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[] };

export const PATCH = route<{ id: string }>(R, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  const r = await db.messageTemplate.updateMany({ where: { id, collegeId: s.collegeId }, data });
  if (r.count === 0) throw notFound("Template not found");
  return db.messageTemplate.findUniqueOrThrow({ where: { id } });
});

export const DELETE = route<{ id: string }>(R, async (_req, s, { id }) => {
  const r = await db.messageTemplate.deleteMany({ where: { id, collegeId: s.collegeId } });
  if (r.count === 0) throw notFound("Template not found");
  return { deleted: true };
});

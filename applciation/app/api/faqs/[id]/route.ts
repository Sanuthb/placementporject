import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const patch = z.object({ kind: z.enum(["FAQ", "RULE"]), question: z.string().trim().min(3).max(300), answer: z.string().trim().min(3).max(5000), sortOrder: z.number().int().min(0).max(9999), isPublished: z.boolean() }).partial();

export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const r = await tx.faqItem.updateMany({ where: { id, collegeId: s.collegeId }, data });
    if (r.count === 0) throw notFound("Not found");
    await audit(s, { action: "faq.update", entity: "FaqItem", entityId: id }, tx);
    return tx.faqItem.findUniqueOrThrow({ where: { id } });
  });
});

export const DELETE = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (_req, s, { id }) => {
  const r = await db.faqItem.deleteMany({ where: { id, collegeId: s.collegeId } });
  if (r.count === 0) throw notFound("Not found");
  await audit(s, { action: "faq.delete", entity: "FaqItem", entityId: id });
  return { deleted: true };
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const body = z.object({ kind: z.enum(["FAQ", "RULE"]).default("FAQ"), question: z.string().trim().min(3).max(300), answer: z.string().trim().min(3).max(5000), sortOrder: z.number().int().min(0).max(9999).default(0), isPublished: z.boolean().default(true) });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, (_req, s) =>
  db.faqItem.findMany({ where: { collegeId: s.collegeId }, orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }),
);

export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] }, async (req, s) => {
  const data = await parseBody(req, body);
  return db.$transaction(async (tx) => {
    const f = await tx.faqItem.create({ data: { collegeId: s.collegeId, ...data } });
    await audit(s, { action: "faq.create", entity: "FaqItem", entityId: f.id }, tx);
    return f;
  });
});

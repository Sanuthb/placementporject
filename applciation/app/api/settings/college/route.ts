import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const patch = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  logoUrl: z.url().nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1a73e8").nullable().optional(),
});

export const GET = route({ facultyOk: true }, (_req, s) =>
  db.college.findUniqueOrThrow({
    where: { id: s.collegeId },
    select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true },
  }),
);

export const PATCH = route({ roles: ["TPO_ADMIN"] }, async (req, s) => {
  const data = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = await tx.college.findUniqueOrThrow({ where: { id: s.collegeId } });
    const after = await tx.college.update({ where: { id: s.collegeId }, data });
    await audit(s, { action: "college.update", entity: "College", entityId: s.collegeId, before: { name: before.name, logoUrl: before.logoUrl, brandColor: before.brandColor }, after: data }, tx);
    return after;
  });
});

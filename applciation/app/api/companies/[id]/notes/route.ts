import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { NoteKind } from "@/generated/prisma/client";

const create = z.object({ kind: z.enum(NoteKind).default("CONVERSATION"), body: z.string().trim().min(1).max(5000), followUpDate: z.coerce.date().optional() });

async function company(collegeId: string, id: string) {
  const c = await db.company.findFirst({ where: { id, collegeId }, select: { id: true } });
  if (!c) throw notFound("Company not found");
}

export const GET = route<{ id: string }>({ module: "DRIVES" }, async (_req, s, { id }) => {
  await company(s.collegeId, id);
  return db.companyNote.findMany({ where: { companyId: id }, select: { id: true, kind: true, body: true, followUpDate: true, createdAt: true, author: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
});

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  await company(s.collegeId, id);
  const data = await parseBody(req, create);
  return db.companyNote.create({ data: { ...data, companyId: id, collegeId: s.collegeId, authorId: s.userId }, select: { id: true, kind: true, body: true, followUpDate: true, createdAt: true } });
});

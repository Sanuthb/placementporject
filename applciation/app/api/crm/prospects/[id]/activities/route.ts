import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";

const body = z.object({ kind: z.enum(["NOTE", "CALL", "EMAIL", "MEETING"]).default("NOTE"), body: z.string().trim().min(1).max(5000), nextFollowUpAt: z.coerce.date().optional() });

/** Log a call, email, meeting or note, optionally setting the next follow-up date. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "EMPLOYER_CRM" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  if (!(await db.prospect.findFirst({ where: { id, collegeId: s.collegeId }, select: { id: true } }))) throw notFound("Prospect not found");
  return db.$transaction(async (tx) => {
    const a = await tx.prospectActivity.create({ data: { prospectId: id, authorId: s.userId, kind: b.kind, body: b.body }, select: { id: true, kind: true, body: true, createdAt: true } });
    if (b.nextFollowUpAt) await tx.prospect.update({ where: { id }, data: { nextFollowUpAt: b.nextFollowUpAt } });
    else await tx.prospect.update({ where: { id }, data: { updatedAt: new Date() } });
    return a;
  });
});

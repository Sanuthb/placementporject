import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { scopedFullStudent } from "@/lib/student360";

const body = z.object({ body: z.string().trim().min(1).max(5000) });

export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  await scopedFullStudent(s, id);
  return db.studentNote.findMany({ where: { studentId: id }, select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
});

/** Internal staff notes. Students never see these. */
export const POST = route<{ id: string }>({ module: "ONBOARDING" }, async (req, s, { id }) => {
  const { body: text } = await parseBody(req, body);
  await scopedFullStudent(s, id);
  return db.$transaction(async (tx) => {
    const n = await tx.studentNote.create({ data: { collegeId: s.collegeId, studentId: id, authorId: s.userId, body: text }, select: { id: true, body: true, createdAt: true } });
    await audit(s, { action: "student.note", entity: "Student", entityId: id }, tx);
    return n;
  });
});

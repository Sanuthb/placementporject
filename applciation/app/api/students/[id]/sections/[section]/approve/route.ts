import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { approveSection, parseSection, scopedStudent } from "@/lib/verification";

const body = z.object({ comment: z.string().trim().max(500).optional() });

export const POST = route<{ id: string; section: string }>({ module: "ONBOARDING" }, async (req, s, p) => {
  await scopedStudent(s, p.id);
  const section = parseSection(p.section);
  const { comment } = await parseBody(req, body.default({}));
  const row = await db.studentSection.findUnique({ where: { studentId_section: { studentId: p.id, section } }, select: { id: true } });
  if (!row) throw notFound("Section has not been submitted");
  return db.$transaction(async (tx) => {
    const r = await approveSection(tx, s, row.id, comment);
    await audit(s, { action: "section.approve", entity: "StudentSection", entityId: row.id, after: { section, studentId: p.id } }, tx);
    return r;
  });
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveStudents } from "@/lib/learning";

const body = z.object({ studentIds: z.array(z.uuid()).max(2000).optional(), departmentId: z.uuid().optional(), batchId: z.uuid().optional() });

/** Adds students to the programme (already-enrolled students are skipped). */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "LEARNING" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  const p = await db.learningProgramme.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!p) throw notFound("Programme not found");
  if (p.status === "COMPLETED") throw new ApiError(409, "CONFLICT", "This programme has finished");
  const ids = await resolveStudents(s.collegeId, b);
  return db.$transaction(async (tx) => {
    const r = await tx.learningMember.createMany({ data: ids.map((studentId) => ({ programmeId: id, studentId })), skipDuplicates: true });
    await audit(s, { action: "programme.enrol", entity: "LearningProgramme", entityId: id, after: { added: r.count } }, tx);
    return { added: r.count, alreadyEnrolled: ids.length - r.count };
  });
});

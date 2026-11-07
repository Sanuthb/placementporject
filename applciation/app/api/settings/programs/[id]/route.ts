import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/api/errors";
import { removeOwned } from "@/lib/api/remove";
import { programPatch } from "@/lib/api/academic";


export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const data = await parseBody(req, programPatch);
  return db.$transaction(async (tx) => {
    const before = await tx.program.findFirst({ where: { id, collegeId: s.collegeId } });
    if (!before) throw notFound("Programme not found");
    if (data.departmentId && !(await tx.department.findFirst({ where: { id: data.departmentId as string, collegeId: s.collegeId } }))) throw badRequest("Department not found");
    const after = await tx.program.update({ where: { id }, data });
    await audit(s, { action: "program.update", entity: "Program", entityId: id, before: { name: before.name, isActive: before.isActive }, after: data as object }, tx);
    return after;
  });
});

export const DELETE = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, (_req, s, { id }) => removeOwned(s, {
  entity: "Program", label: "Programme", id, action: "program.delete",
  find: (tx) => tx.program.findFirst({ where: { id, collegeId: s.collegeId } }),
  blockers: async (tx) => {
    const [students, batches] = await Promise.all([tx.student.count({ where: { programId: id } }), tx.batch.count({ where: { programId: id } })]);
    return students || batches ? `${students} students and ${batches} batches use this programme.` : null;
  },
  remove: (tx) => tx.program.delete({ where: { id } }),
}));

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/errors";
import { allocationFields, applyAllocations, facultySelect, loadFaculty, profileFields, shapeFaculty } from "@/lib/faculty";

const patch = z.object({ name: z.string().trim().min(2).max(120).optional(), isActive: z.boolean().optional() }).extend(profileFields.shape).extend(allocationFields.shape);

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (_req, s, { id }) => {
  await loadFaculty(db, s.collegeId, id);
  return shapeFaculty(await db.user.findUniqueOrThrow({ where: { id }, select: facultySelect }));
});

/** Updates profile, departments / programmes / batches and active state. Deactivating blocks sign-in (getSession refuses inactive users) and keeps all history. */
export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (req, s, { id }) => {
  const { name, isActive, departmentIds, programIds, batchIds, ...profile } = await parseBody(req, patch);
  return db.$transaction(async (tx) => {
    const before = shapeFaculty(await tx.user.findUniqueOrThrow({ where: { id: (await loadFaculty(tx, s.collegeId, id)).id }, select: facultySelect }));
    if (profile.employeeId && profile.employeeId !== before.profile?.employeeId && (await tx.facultyProfile.findFirst({ where: { collegeId: s.collegeId, employeeId: profile.employeeId, userId: { not: id } } }))) throw new ApiError(409, "CONFLICT", "That employee ID is already used");

    if (name !== undefined || isActive !== undefined) await tx.user.update({ where: { id }, data: { name, isActive } });
    if (Object.keys(profile).length) await tx.facultyProfile.upsert({ where: { userId: id }, create: { userId: id, collegeId: s.collegeId, ...profile }, update: profile });
    const allocating = departmentIds || programIds || batchIds;
    const alloc = allocating ? await applyAllocations(tx, s.collegeId, id, { departmentIds, programIds, batchIds }) : null;

    if (name !== undefined || Object.keys(profile).length) await audit(s, { action: "faculty.update", entity: "User", entityId: id, before: { name: before.name, ...before.profile } as object, after: { name, ...profile } as object }, tx);
    if (alloc) await audit(s, { action: "faculty.allocate", entity: "User", entityId: id, before: { departments: before.departments.map((d) => d.id), programs: before.programs.map((p) => p.id), batches: before.batches.map((b) => b.id) }, after: alloc }, tx);
    if (isActive !== undefined && isActive !== before.isActive) await audit(s, { action: isActive ? "faculty.reactivate" : "faculty.deactivate", entity: "User", entityId: id, before: { isActive: before.isActive }, after: { isActive } }, tx);
    return shapeFaculty(await tx.user.findUniqueOrThrow({ where: { id }, select: facultySelect }));
  });
});

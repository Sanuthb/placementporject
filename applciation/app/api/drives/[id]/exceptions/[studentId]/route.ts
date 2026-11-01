import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";

export const DELETE = route<{ id: string; studentId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id, studentId }) => {
  await getDrive(s.collegeId, id);
  return db.$transaction(async (tx) => {
    const r = await tx.driveException.deleteMany({ where: { driveId: id, studentId } });
    if (r.count === 0) throw notFound("Exception not found");
    await audit(s, { action: "drive.exception.remove", entity: "Drive", entityId: id, after: { studentId } }, tx);
    return { removed: true };
  });
});

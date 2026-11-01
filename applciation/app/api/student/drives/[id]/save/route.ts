import { studentRoute } from "@/lib/api/studentHandler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";

async function mine(id: string, collegeId: string) {
  if (!(await db.drive.findFirst({ where: { id, collegeId, status: { not: "DRAFT" } }, select: { id: true } }))) throw notFound("Drive not found");
}

/** Bookmark a drive to look at later. */
export const POST = studentRoute<{ id: string }>({ module: "DRIVES" }, async (_req, me, { id }) => {
  await mine(id, me.collegeId);
  await db.savedDrive.upsert({ where: { studentId_driveId: { studentId: me.studentId, driveId: id } }, update: {}, create: { studentId: me.studentId, driveId: id } });
  return { saved: true };
});

export const DELETE = studentRoute<{ id: string }>({ module: "DRIVES" }, async (_req, me, { id }) => {
  await db.savedDrive.deleteMany({ where: { studentId: me.studentId, driveId: id } });
  return { saved: false };
});

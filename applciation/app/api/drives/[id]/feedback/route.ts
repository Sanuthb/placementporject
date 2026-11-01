import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getDrive } from "@/lib/drives";

const body = z.object({ onStudents: z.string().trim().max(5000).optional(), onProcess: z.string().trim().max(5000).optional(), improvements: z.string().trim().max(5000).optional() });

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  await getDrive(s.collegeId, id);
  return (await db.driveFeedback.findUnique({ where: { driveId: id } })) ?? { driveId: id, onStudents: null, onProcess: null, improvements: null };
});

/** Company feedback recorded after the drive has taken place (or been closed). */
export const PUT = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const data = await parseBody(req, body);
  const d = await getDrive(s.collegeId, id);
  if (d.status === "DRAFT" || d.status === "CANCELLED" || (d.status === "PUBLISHED" && d.driveDate > new Date())) throw new ApiError(409, "CONFLICT", "Feedback can be recorded after the drive has taken place");
  return db.$transaction(async (tx) => {
    const f = await tx.driveFeedback.upsert({ where: { driveId: id }, update: data, create: { driveId: id, ...data } });
    await audit(s, { action: "drive.feedback", entity: "Drive", entityId: id }, tx);
    return f;
  });
});

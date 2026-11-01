import { z } from "zod";
import { recruiterRoute, recruiterDrive } from "@/lib/api/recruiterHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";

const body = z.object({ onStudents: z.string().trim().max(5000).optional(), onProcess: z.string().trim().max(5000).optional(), improvements: z.string().trim().max(5000).optional() });

export const GET = recruiterRoute<{ id: string }>(async (_req, r, { id }) => {
  await recruiterDrive(r, id);
  return (await db.driveFeedback.findUnique({ where: { driveId: id } })) ?? { driveId: id, onStudents: null, onProcess: null, improvements: null };
});

/** The company's own feedback on the students, the process and what to improve next year. */
export const PUT = recruiterRoute<{ id: string }>(async (req, r, { id }) => {
  const data = await parseBody(req, body);
  const d = await recruiterDrive(r, id);
  if (d.status === "PUBLISHED" && d.driveDate > new Date()) throw new ApiError(409, "CONFLICT", "Feedback can be given once the drive has taken place");
  return db.driveFeedback.upsert({ where: { driveId: id }, update: data, create: { driveId: id, ...data } });
});

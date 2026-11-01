import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { getDrive } from "@/lib/drives";
import { gate } from "@/lib/approvals";
import { addException } from "@/lib/ops/exceptions";

const body = z.object({ studentId: z.uuid(), reason: z.string().trim().min(5, "A reason is required").max(500) });

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  await getDrive(s.collegeId, id);
  return db.driveException.findMany({ where: { driveId: id }, select: { id: true, reason: true, createdAt: true, student: { select: { id: true, name: true, enrollmentNo: true } } }, orderBy: { createdAt: "desc" } });
});

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const input = await parseBody(req, body);
  const drive = await getDrive(s.collegeId, id);
  const st = await db.student.findFirst({ where: { id: input.studentId, collegeId: s.collegeId }, select: { name: true, enrollmentNo: true } });
  if (!st) throw notFound("Student not found");
  return gate(s, "ELIGIBILITY_EXCEPTION", `Eligibility exception for ${st.name} (${st.enrollmentNo}) on "${drive.role}": ${input.reason}`, { driveId: id, input }, () => addException(s, id, input));
});

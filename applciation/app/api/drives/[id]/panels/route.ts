import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadScope } from "@/lib/attendance";

const body = z.object({ name: z.string().trim().min(1).max(100), room: z.string().trim().max(100).optional() });

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (_req, s, { id }) => {
  await loadScope(s.collegeId, id);
  return db.interviewPanel.findMany({ where: { driveId: id }, orderBy: { name: "asc" } });
});

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const data = await parseBody(req, body);
  await loadScope(s.collegeId, id);
  if (await db.interviewPanel.findUnique({ where: { driveId_name: { driveId: id, name: data.name } } })) throw new ApiError(409, "CONFLICT", "A panel with this name already exists");
  return db.$transaction(async (tx) => {
    const p = await tx.interviewPanel.create({ data: { ...data, driveId: id } });
    await audit(s, { action: "panel.create", entity: "Drive", entityId: id, after: data }, tx);
    return p;
  });
});

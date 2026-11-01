import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs } from "@/lib/drives";
import { alertFields } from "@/lib/jobAlertSchema";

const patch = z.object(alertFields).partial();
const R = { roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"] as ("TPO_ADMIN" | "PLACEMENT_OFFICER")[], module: "DRIVES" as const };

export const GET = route<{ id: string }>(R, async (_req, s, { id }) => {
  const a = await db.jobAlert.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!a) throw notFound("Job alert not found");
  return a;
});

export const PATCH = route<{ id: string }>(R, async (req, s, { id }) => {
  const data = await parseBody(req, patch);
  const before = await db.jobAlert.findFirst({ where: { id, collegeId: s.collegeId } });
  if (!before) throw notFound("Job alert not found");
  if (before.status === "CLOSED") throw new ApiError(409, "CONFLICT", "A closed alert cannot be edited");
  await assertDriveRefs(s.collegeId, { departmentIds: data.targetDepartmentIds, batchIds: data.targetBatchIds });
  return db.$transaction(async (tx) => {
    const after = await tx.jobAlert.update({ where: { id }, data });
    await audit(s, { action: "jobAlert.update", entity: "JobAlert", entityId: id, after: data as object }, tx);
    return after;
  });
});

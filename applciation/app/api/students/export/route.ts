import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { sheetResponse } from "@/lib/xlsx";
import { InviteStatus, StudentStage } from "@/generated/prisma/client";

const query = z.object({ departmentId: z.uuid().optional(), batchId: z.uuid().optional(), stage: z.enum(StudentStage).optional(), inviteStatus: z.enum(InviteStatus).optional(), isArchived: z.enum(["true", "false"]).default("false") });

export const GET = route({ limit: { name: "export", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"], module: "ONBOARDING" }, async (req, s) => {
  const q = parseQuery(req, query);
  const scope = departmentScope(s);
  const rows = await db.student.findMany({
    where: { collegeId: s.collegeId, ...scope, departmentId: scope.departmentId ?? q.departmentId, batchId: q.batchId, stage: q.stage, inviteStatus: q.inviteStatus, isArchived: q.isArchived === "true" },
    select: { enrollmentNo: true, name: true, email: true, phone: true, stage: true, inviteStatus: true, participationStatus: true, isPlaced: true, department: { select: { code: true } }, batch: { select: { name: true } } },
    orderBy: [{ name: "asc" }], take: 20_000,
  });
  return sheetResponse("students.xlsx", ["enrollment_no", "name", "email", "phone", "department", "batch", "stage", "invite", "placement_status", "placed"], rows.map((r) => [r.enrollmentNo, r.name, r.email, r.phone, r.department.code, r.batch.name, r.stage, r.inviteStatus, r.participationStatus, r.isPlaced ? "yes" : "no"]));
});

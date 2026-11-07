import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { studentFilterQuery, studentWhere } from "@/lib/studentFilters";
import { sheetResponse } from "@/lib/xlsx";

const query = studentFilterQuery;

export const GET = route({ limit: { name: "export", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"], module: "ONBOARDING" }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.student.findMany({
    where: studentWhere(s, q),
    select: { enrollmentNo: true, name: true, email: true, phone: true, stage: true, inviteStatus: true, participationStatus: true, isPlaced: true, department: { select: { code: true } }, batch: { select: { name: true } } },
    orderBy: [{ name: "asc" }], take: 20_000,
  });
  return sheetResponse("students.xlsx", ["enrollment_no", "name", "email", "phone", "department", "batch", "stage", "invite", "placement_status", "placed"], rows.map((r) => [r.enrollmentNo, r.name, r.email, r.phone, r.department.code, r.batch.name, r.stage, r.inviteStatus, r.participationStatus, r.isPlaced ? "yes" : "no"]));
});

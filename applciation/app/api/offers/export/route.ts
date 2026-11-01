import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { departmentScope } from "@/lib/auth/session";
import { sheetResponse } from "@/lib/xlsx";
import { OfferStatus } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(OfferStatus).optional(), companyId: z.uuid().optional(), driveId: z.uuid().optional() });

export const GET = route({ limit: { name: "export", max: 60, windowSec: 3600 }, roles: ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"], module: "DRIVES" }, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.offer.findMany({
    where: { collegeId: s.collegeId, status: q.status, companyId: q.companyId, driveId: q.driveId, student: { ...departmentScope(s) } },
    select: { role: true, packageLpa: true, status: true, isPpo: true, isHistorical: true, offerYear: true, offeredAt: true, joiningStatus: true, joiningDate: true, student: { select: { enrollmentNo: true, name: true } }, company: { select: { name: true, tier: true } } },
    orderBy: { offeredAt: "desc" }, take: 20_000,
  });
  return sheetResponse("offers.xlsx", ["enrollment_no", "student", "company", "tier", "role", "package_lpa", "status", "ppo", "year", "joining_status", "joining_date"],
    rows.map((r) => [r.student.enrollmentNo, r.student.name, r.company.name, r.company.tier, r.role, Number(r.packageLpa), r.status, r.isPpo ? "yes" : "no", r.offerYear ?? r.offeredAt.getUTCFullYear(), r.joiningStatus, r.joiningDate?.toISOString().slice(0, 10) ?? ""]));
});

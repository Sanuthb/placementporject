import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { INT_ADMIN, signed } from "@/lib/internshipService";
import { InternshipApplicationStatus } from "@/generated/prisma/client";

/** The application queue for staff: filter by status (APPLIED = waiting for the college, COLLEGE_APPROVED = waiting for the company). */
export const GET = route(INT_ADMIN, async (req, s) => {
  const q = parseQuery(req, z.object({ status: z.enum(InternshipApplicationStatus).optional(), postingId: z.uuid().optional() }));
  const rows = await db.internshipApplication.findMany({
    where: { collegeId: s.collegeId, status: q.status, postingId: q.postingId }, orderBy: { createdAt: "asc" }, take: 300,
    include: { student: { select: { id: true, name: true, enrollmentNo: true, department: { select: { name: true } } } }, posting: { select: { id: true, title: true, companyName: true } } },
  });
  return Promise.all(rows.map(async ({ offerLetterPath, ...a }) => ({ ...a, offerLetterUrl: offerLetterPath ? await signed(offerLetterPath) : null })));
});

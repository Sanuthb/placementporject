import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

export const GET = studentRoute({ module: "INTERNSHIPS" }, (_req, me) =>
  db.internship.findMany({ where: { studentId: me.studentId }, select: { id: true, companyName: true, role: true, startDate: true, endDate: true, mentorName: true, status: true, evaluations: { select: { evaluatorType: true, evaluatorName: true, score: true, remarks: true, createdAt: true } } }, orderBy: { startDate: "desc" } }),
);

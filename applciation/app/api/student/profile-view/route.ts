import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

/** Everything in my profile sections in one go (the accepted values, plus a change that is waiting for review). */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const [st, rows] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: me.studentId }, select: { name: true, enrollmentNo: true, email: true, phone: true, stage: true, department: { select: { name: true } }, batch: { select: { name: true } }, program: { select: { name: true } } } }),
    db.studentSection.findMany({ where: { studentId: me.studentId }, select: { section: true, status: true, data: true, pendingData: true, reviewedAt: true, documents: { select: { id: true, fileName: true } } } }),
  ]);
  return { student: st, sections: rows.map((r) => ({ section: r.section, status: r.status, data: r.data, hasPendingChange: !!r.pendingData, reviewedAt: r.reviewedAt, documents: r.documents })) };
});

import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

export const GET = studentRoute({}, async (_req, me) => {
  const [st, mods, unread] = await Promise.all([
    db.student.findUniqueOrThrow({ where: { id: me.studentId }, include: { department: { select: { id: true, name: true, code: true } }, batch: { select: { id: true, name: true } }, program: { select: { id: true, name: true } } } }),
    db.collegeModule.findMany({ where: { collegeId: me.collegeId, enabled: true }, select: { module: true } }),
    db.notification.count({ where: { studentId: me.studentId, readAt: null } }),
  ]);
  return {
    id: st.id, name: st.name, enrollmentNo: st.enrollmentNo, email: st.email, phone: st.phone, department: st.department, batch: st.batch, program: st.program,
    stage: st.stage, onboardingStatus: st.onboardingStatus, participationStatus: st.participationStatus, participationReason: st.participationReason, isPlaced: st.isPlaced,
    modules: mods.map((m) => m.module), unreadNotifications: unread,
  };
});

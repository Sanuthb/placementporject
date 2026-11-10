import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { versionOf } from "@/lib/resumeService";

/** Archive a resume I no longer use. It stays in the record. If it was my main one, my newest approved resume takes over. */
export const POST = studentRoute<{ id: string }>({ module: "ONBOARDING" }, async (_req, me, { id }) => {
  const v = await versionOf(me.studentId, id);
  await db.resumeVersion.update({ where: { id }, data: { status: "ARCHIVED", isPrimary: false } });
  if (v.isPrimary) {
    const next = await db.resumeVersion.findFirst({ where: { studentId: me.studentId, status: "APPROVED" }, orderBy: { approvedAt: "desc" } });
    if (next) await db.resumeVersion.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  return { ok: true };
});

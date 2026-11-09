import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { instrumentOrThrow, resultsFor } from "@/lib/instruments/service";

/** My results for this test: the current one and every earlier attempt. */
export const GET = studentRoute<{ key: string }>({ module: "PSYCHOMETRICS" }, (_req, me, { key }) => resultsFor(me, key));

/** Delete my results for this test (all attempts). */
export const DELETE = studentRoute<{ key: string }>({ module: "PSYCHOMETRICS" }, async (_req, me, { key }) => {
  instrumentOrThrow(key);
  const r = await db.instrumentAttempt.deleteMany({ where: { studentId: me.studentId, instrumentKey: key } });
  await audit({ collegeId: me.collegeId, userId: null }, { action: "instrument.delete", entity: "Student", entityId: me.studentId, after: { test: key, attempts: r.count } });
  return { deleted: r.count };
});

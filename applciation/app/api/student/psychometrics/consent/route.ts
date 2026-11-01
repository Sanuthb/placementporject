import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const body = z.object({ consent: z.boolean() });

/** Give or withdraw consent to take the personality assessment. The test cannot start without it. */
export const POST = studentRoute({ module: "PSYCHOMETRICS" }, async (req, me) => {
  const { consent } = await parseBody(req, body);
  const st = await db.student.update({ where: { id: me.studentId }, data: { psychConsentAt: consent ? new Date() : null }, select: { psychConsentAt: true } });
  await audit({ collegeId: me.collegeId, userId: null }, { action: consent ? "psychometrics.consent" : "psychometrics.withdraw-consent", entity: "Student", entityId: me.studentId });
  return { consentAt: st.psychConsentAt };
});

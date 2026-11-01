import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";

/** The college's offer rules in plain words. */
export const GET = studentRoute({ module: "DRIVES" }, async (_req, me) => {
  const s = await db.collegeSettings.findUnique({ where: { collegeId: me.collegeId }, select: { maxOffersPerStudent: true, enforceTierUpgrade: true } });
  const max = s ? s.maxOffersPerStudent : 1;
  const rules: string[] = [];
  rules.push(max === null ? "You can hold any number of offers." : max === 1 ? "You can accept only one offer." : `You can accept up to ${max} offers.`);
  if (s?.enforceTierUpgrade) rules.push("After you are placed, you can only take a further offer from a higher-tier company.");
  rules.push("Accepting or declining is final. Answer before the offer expires.");
  return { rules };
});

import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const body = z.object({ share: z.boolean() });

/** Choose whether placement admins may open my individual result (they must still give a reason, which is logged). */
export const POST = studentRoute({ module: "PSYCHOMETRICS" }, async (req, me) => {
  const { share } = await parseBody(req, body);
  await db.student.update({ where: { id: me.studentId }, data: { psychShareWithStaff: share } });
  await audit({ collegeId: me.collegeId, userId: null }, { action: share ? "psychometrics.share" : "psychometrics.unshare", entity: "Student", entityId: me.studentId });
  return { share };
});

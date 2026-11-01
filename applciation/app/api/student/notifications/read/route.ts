import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";

const body = z.object({ ids: z.array(z.uuid()).max(200).optional(), all: z.boolean().optional() }).refine((v) => v.all || v.ids?.length, { message: "Give ids or all: true" });

export const POST = studentRoute({}, async (req, me) => {
  const b = await parseBody(req, body);
  const r = await db.notification.updateMany({ where: { studentId: me.studentId, readAt: null, ...(b.all ? {} : { id: { in: b.ids } }) }, data: { readAt: new Date() } });
  return { marked: r.count };
});

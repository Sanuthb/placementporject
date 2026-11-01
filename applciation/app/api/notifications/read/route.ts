import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";

const body = z.object({ ids: z.array(z.uuid()).max(200).optional(), all: z.boolean().optional() }).refine((v) => v.all || v.ids?.length, { message: "Give ids or all: true" });

export const POST = route({}, async (req, s) => {
  const b = await parseBody(req, body);
  const r = await db.notification.updateMany({ where: { userId: s.userId, readAt: null, ...(b.all ? {} : { id: { in: b.ids } }) }, data: { readAt: new Date() } });
  return { marked: r.count };
});

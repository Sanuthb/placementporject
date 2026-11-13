import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { setStatus } from "@/lib/platformSupport";
const body = z.object({ status: z.enum(["OPEN", "IN_PROGRESS"]) });

export const POST = platformRoute<{ id: string }>({ limit: { name: "platform-support", max: 120, windowSec: 3600 } }, async (req, admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Support request not found");
  return setStatus(admin, id, (await parseBody(req, body)).status);
});

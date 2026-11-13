import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { platformReply, textInput } from "@/lib/platformSupport";

export const POST = platformRoute<{ id: string }>({ limit: { name: "platform-support", max: 120, windowSec: 3600 } }, async (req, admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Support request not found");
  return platformReply(admin, id, (await parseBody(req, textInput)).message);
});

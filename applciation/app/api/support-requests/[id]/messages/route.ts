import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { institutionReply, textInput } from "@/lib/platformSupport";

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN"], limit: { name: "support-reply", max: 60, windowSec: 3600 } }, async (req, s, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Support request not found");
  return institutionReply(s, id, (await parseBody(req, textInput)).message);
});

import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { reopen, reopenInput } from "@/lib/platformSupport";

/** Reopens a resolved request only. The existing status route still refuses to change a resolved request. */
export const POST = platformRoute<{ id: string }>({ limit: { name: "platform-support", max: 120, windowSec: 3600 } }, async (req, admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Support request not found");
  return reopen(admin, id, (await parseBody(req, reopenInput)).reason);
});

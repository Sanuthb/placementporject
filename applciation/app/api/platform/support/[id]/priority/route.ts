import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { priorityInput, setPriority } from "@/lib/platformSupport";

/** Internal to the platform team: the institution never sees the priority. */
export const POST = platformRoute<{ id: string }>({ limit: { name: "platform-support", max: 120, windowSec: 3600 } }, async (req, admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Support request not found");
  return setPriority(admin, id, (await parseBody(req, priorityInput)).priority);
});

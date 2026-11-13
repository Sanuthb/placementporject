import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { addUpdate, updateInput } from "@/lib/platformIncidents";

/** Posts a status update. A resolved incident refuses further updates (409). */
export const POST = platformRoute<{ id: string }>({ limit: { name: "platform-incident", max: 60, windowSec: 3600 } }, async (req, admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Incident not found");
  return addUpdate(admin, id, await parseBody(req, updateInput));
});

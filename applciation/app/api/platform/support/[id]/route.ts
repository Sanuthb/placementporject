import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { notFound } from "@/lib/api/errors";
import { getForPlatform } from "@/lib/platformSupport";

export const GET = platformRoute<{ id: string }>({}, async (_req, _admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Support request not found");
  return getForPlatform(id);
});

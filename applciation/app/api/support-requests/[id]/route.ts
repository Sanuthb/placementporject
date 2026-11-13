import { z } from "zod";
import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { getForInstitution } from "@/lib/platformSupport";

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN"] }, async (_req, s, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Support request not found");
  return getForInstitution(s, id);
});

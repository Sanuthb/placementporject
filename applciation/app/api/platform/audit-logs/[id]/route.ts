import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { notFound } from "@/lib/api/errors";
import { auditDetail } from "@/lib/platformAuditView";

export const GET = platformRoute<{ id: string }>({}, async (_req, _admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Event not found");
  return auditDetail(id);
});

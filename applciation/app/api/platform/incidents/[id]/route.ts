import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { notFound } from "@/lib/api/errors";
import { getIncident } from "@/lib/platformIncidents";

export const GET = platformRoute<{ id: string }>({}, async (_req, _admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Incident not found");
  return getIncident(id);
});

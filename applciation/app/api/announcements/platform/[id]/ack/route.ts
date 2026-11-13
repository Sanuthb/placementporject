import { z } from "zod";
import { route } from "@/lib/api/handler";
import { notFound } from "@/lib/api/errors";
import { acknowledge } from "@/lib/platformAnnouncements";

/** An institution administrator confirms they have read an announcement their institution can see. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN"], limit: { name: "announcement-ack", max: 60, windowSec: 3600 } }, async (_req, s, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Announcement not found");
  return acknowledge(s, id);
});

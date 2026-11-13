import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { notFound } from "@/lib/api/errors";
import { publishAnnouncement } from "@/lib/platformAnnouncements";

export const POST = platformRoute<{ id: string }>({ limit: { name: "platform-announcement", max: 60, windowSec: 3600 } }, async (_req, admin, { id }) => {
  if (!z.uuid().safeParse(id).success) throw notFound("Announcement not found");
  return publishAnnouncement(admin, id);
});

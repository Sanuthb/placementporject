import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { notFound } from "@/lib/api/errors";
import { announcementInput, getAnnouncement, updateAnnouncement } from "@/lib/platformAnnouncements";

const check = (id: string) => { if (!z.uuid().safeParse(id).success) throw notFound("Announcement not found"); };
export const GET = platformRoute<{ id: string }>({}, async (_req, _admin, { id }) => { check(id); return getAnnouncement(id); });
/** Edits a draft only. A published announcement is cancelled and replaced, never changed. */
export const PATCH = platformRoute<{ id: string }>({ limit: { name: "platform-announcement", max: 60, windowSec: 3600 } }, async (req, admin, { id }) => { check(id); return updateAnnouncement(admin, id, await parseBody(req, announcementInput)); });

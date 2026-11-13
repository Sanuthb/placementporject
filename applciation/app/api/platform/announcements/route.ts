import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { announcementInput, createAnnouncement, listAnnouncements, listQuery } from "@/lib/platformAnnouncements";

/** Platform administrators with the second step only. Announcements are shown inside the application; nothing is e-mailed, texted or sent over WhatsApp. */
export const GET = platformRoute({}, async (req) => listAnnouncements(parseQuery(req, listQuery)));
export const POST = platformRoute({ limit: { name: "platform-announcement", max: 60, windowSec: 3600 } }, async (req, admin) => createAnnouncement(admin, await parseBody(req, announcementInput)));

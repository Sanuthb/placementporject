import { studentRoute } from "@/lib/api/studentHandler";
import { announcementsFor } from "@/lib/announcements";

/** Current announcements; add ?archive=true for ones that have expired. */
export const GET = studentRoute({}, (req, me) => announcementsFor(me, req.nextUrl.searchParams.get("archive") === "true"));

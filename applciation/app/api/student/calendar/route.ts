import { studentRoute } from "@/lib/api/studentHandler";
import { studentEvents } from "@/lib/calendarService";
import { buildIcs } from "@/lib/notifyRules";

/** My dated things for the next four months. `?format=ics` downloads them as a calendar file. */
export const GET = studentRoute({}, async (req, me) => {
  const ev = await studentEvents(me);
  if (req.nextUrl.searchParams.get("format") === "ics") return new Response(buildIcs(ev, new Date(), "My placement calendar"), { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="placement.ics"', "cache-control": "no-store" } });
  return ev.map((e) => ({ uid: e.uid, kind: e.kind, title: e.title, start: e.start, end: e.end ?? null, allDay: !!e.allDay, place: e.place ?? null, description: e.description ?? null, link: e.link }));
});

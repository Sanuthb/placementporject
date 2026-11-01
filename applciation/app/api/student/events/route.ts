import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { eventVisibleTo } from "@/lib/events";

/** Events open to me, with my registration status and whether there is room. */
export const GET = studentRoute({ module: "EVENTS" }, async (req, me) => {
  // Events I took part in that have ended: attendance, rank, score and whether a certificate is available.
  if (req.nextUrl.searchParams.get("scope") === "past") {
    const regs = await db.eventRegistration.findMany({ where: { studentId: me.studentId, status: { in: ["REGISTERED", "ATTENDED"] }, event: { collegeId: me.collegeId, endsAt: { lte: new Date() }, status: { not: "CANCELLED" } } }, include: { event: { select: { id: true, type: true, title: true, startsAt: true, endsAt: true, venue: true } } }, orderBy: { event: { endsAt: "desc" } }, take: 100 });
    return regs.map((r) => ({ id: r.event.id, type: r.event.type, title: r.event.title, startsAt: r.event.startsAt, endsAt: r.event.endsAt, venue: r.event.venue, status: r.status, rank: r.rank, score: r.score === null ? null : Number(r.score), certificate: r.status === "ATTENDED" }));
  }
  const events = await db.event.findMany({
    where: { collegeId: me.collegeId, status: "PUBLISHED", endsAt: { gt: new Date() } },
    include: { registrations: { select: { studentId: true, status: true } } }, orderBy: { startsAt: "asc" }, take: 100,
  });
  return events.filter((e) => eventVisibleTo(e, me)).map((e) => {
    const taken = e.registrations.filter((r) => r.status === "REGISTERED" || r.status === "ATTENDED").length;
    return {
      id: e.id, type: e.type, title: e.title, description: e.description, mode: e.mode, venue: e.venue, startsAt: e.startsAt, endsAt: e.endsAt, registrationDeadline: e.registrationDeadline,
      capacity: e.capacity, seatsLeft: e.capacity === null ? null : Math.max(0, e.capacity - taken), myRegistration: e.registrations.find((r) => r.studentId === me.studentId)?.status ?? null,
      joinUrl: e.registrations.some((r) => r.studentId === me.studentId && (r.status === "REGISTERED" || r.status === "ATTENDED")) ? e.joinUrl : null,
    };
  });
});

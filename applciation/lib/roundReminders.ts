import { db } from "@/lib/db";

const DAY = 86_400_000;

/**
 * Tells applicants about a round or interview that starts within the next 24 hours. Each person is told once per round
 * (the notification link is the key), so running this every hour is safe.
 */
export async function sendRoundReminders(collegeId: string, now = new Date()) {
  const until = new Date(now.getTime() + DAY);
  const [rounds, slots] = await Promise.all([
    db.driveRound.findMany({
      where: { scheduledAt: { gt: now, lte: until }, drive: { collegeId, status: "PUBLISHED" } },
      select: { id: true, order: true, type: true, scheduledAt: true, venue: true, drive: { select: { role: true, company: { select: { name: true } }, applications: { where: { status: { in: ["APPLIED", "SHORTLISTED", "ON_HOLD"] } }, select: { studentId: true } } } } },
    }),
    db.interviewSlot.findMany({
      where: { startsAt: { gt: now, lte: until }, status: "SCHEDULED", application: { collegeId } },
      select: { id: true, startsAt: true, panel: { select: { name: true, room: true } }, application: { select: { studentId: true, drive: { select: { role: true, company: { select: { name: true } } } } } } },
    }),
  ]);

  const wanted: { studentId: string; link: string; title: string; body: string }[] = [];
  for (const r of rounds) {
    for (const a of r.drive.applications) {
      wanted.push({ studentId: a.studentId, link: `/student/applications#round-${r.id}`, title: `${r.drive.company.name}: round ${r.order} (${r.type.toLowerCase().replace(/_/g, " ")}) starts soon`, body: `${r.scheduledAt!.toUTCString()}${r.venue ? ` at ${r.venue}` : ""}` });
    }
  }
  for (const s of slots) {
    wanted.push({ studentId: s.application.studentId, link: `/student/applications#slot-${s.id}`, title: `${s.application.drive.company.name}: your interview is coming up`, body: `${s.startsAt.toUTCString()}${s.panel ? ` at ${s.panel.name}${s.panel.room ? `, ${s.panel.room}` : ""}` : ""}` });
  }
  if (!wanted.length) return { reminded: 0 };

  const done = await db.notification.findMany({ where: { collegeId, type: "round.reminder", link: { in: wanted.map((w) => w.link) } }, select: { studentId: true, link: true } });
  const sent = new Set(done.map((d) => `${d.studentId}|${d.link}`));
  const fresh = wanted.filter((w) => !sent.has(`${w.studentId}|${w.link}`));
  if (fresh.length) await db.notification.createMany({ data: fresh.map((w) => ({ collegeId, studentId: w.studentId, type: "round.reminder", title: w.title, body: w.body, link: w.link })) });
  return { reminded: fresh.length };
}

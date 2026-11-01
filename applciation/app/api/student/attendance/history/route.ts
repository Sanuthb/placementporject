import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { missedDrivesParams } from "@/lib/blocking";

/** My attendance per drive, the college's blocking rules in plain words, and how close I am to a block. */
export const GET = studentRoute({ module: "ATTENDANCE_BLOCKING" }, async (_req, me) => {
  const [records, policies] = await Promise.all([
    db.attendanceRecord.findMany({
      where: { studentId: me.studentId }, orderBy: { markedAt: "desc" }, take: 300,
      select: { driveId: true, status: true, excused: true, excuseReason: true, method: true, markedAt: true, drive: { select: { role: true, driveDate: true, company: { select: { name: true } } } } },
    }),
    db.blockPolicy.findMany({ where: { collegeId: me.collegeId, isActive: true }, select: { id: true, type: true, name: true, params: true } }),
  ]);
  const byDrive = new Map<string, { driveId: string; company: string; role: string; driveDate: Date; attended: boolean; excused: boolean; markedAt: Date; method: string }>();
  for (const r of records) {
    const cur = byDrive.get(r.driveId) ?? { driveId: r.driveId, company: r.drive.company.name, role: r.drive.role, driveDate: r.drive.driveDate, attended: false, excused: false, markedAt: r.markedAt, method: r.method };
    if (r.status === "PRESENT") { cur.attended = true; cur.markedAt = r.markedAt; cur.method = r.method; }
    if (r.excused) cur.excused = true;
    byDrive.set(r.driveId, cur);
  }
  const drives = [...byDrive.values()].sort((a, b) => +b.driveDate - +a.driveDate);
  const missed = drives.filter((d) => !d.attended && !d.excused).length;

  const rules: { text: string; threshold?: number; missed?: number }[] = [];
  for (const p of policies) {
    if (p.type === "MISSED_DRIVES") {
      const q = missedDrivesParams.parse(p.params);
      rules.push({ text: `Missing ${q.threshold} drive${q.threshold > 1 ? "s" : ""} you were registered for${q.windowDays ? ` within ${q.windowDays} days` : ""} blocks you from new drives for ${q.blockDays} days. Tell the placement office within ${q.graceHours} hours if you had a genuine reason, and the absence can be excused.`, threshold: q.threshold, missed });
    } else if (p.type === "PLACED_LOWER_TIER") rules.push({ text: "Once you are placed with a company, you cannot apply to drives of a lower tier." });
  }
  const warning = rules.find((r) => r.threshold !== undefined && r.missed! > 0 && r.missed! >= r.threshold - 1) ?? null;
  return { drives, missed, rules, warning: warning ? `You have missed ${missed} drive${missed > 1 ? "s" : ""}. Missing ${warning.threshold} triggers a block.` : null };
});

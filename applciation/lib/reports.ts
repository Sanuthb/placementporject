import { db } from "@/lib/db";
import { overview, packageStats } from "@/lib/analytics";
import { buildReportPdf } from "@/lib/pdfReport";
import { sendBulkEmail } from "@/lib/ops/email";
import { audit } from "@/lib/audit";
import ExcelJS from "exceljs";
import type { Session } from "@/lib/auth/session";
import type { ReportFrequency, ReportType } from "@/generated/prisma/client";

/** Reports are college-wide, so they run as an admin-level view of the college. */
export const systemSession = (collegeId: string): Session => ({ userId: "", collegeId, role: "TPO_ADMIN", roles: ["TPO_ADMIN"], departmentId: null, email: "", name: "Scheduled report" });
const hex = (c?: string | null) => { const m = /^#([0-9a-f]{6})$/i.exec(c ?? ""); return m ? ([parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)] as const) : null; };

/** PDF for management: headline numbers, department table, package statistics. */
export async function placementSummaryPdf(collegeId: string, year?: number) {
  const [college, o] = await Promise.all([db.college.findUniqueOrThrow({ where: { id: collegeId }, select: { name: true, brandColor: true } }), overview(systemSession(collegeId), { year, includeHistorical: true })]);
  const c = hex(college.brandColor);
  const { rgb } = await import("pdf-lib");
  return buildReportPdf(`${college.name}: Placement Report`, `${year ? `Placement year ${year}` : "All years"}  |  Generated ${new Date().toISOString().slice(0, 10)}`, [
    { heading: "Headline numbers", lines: [
      `Students registered for placement: ${o.placement.total}`, `Placed: ${o.placement.placed} (${o.placement.percentage}%)`,
      `Companies visited: ${o.companies.visited}`, `Offers made: ${o.offers.made} (accepted ${o.offers.accepted}, declined ${o.offers.declined}, awaiting ${o.offers.pending})`,
    ] },
    { heading: "Package statistics (LPA)", lines: [`Highest: ${o.packages.highest ?? "-"}   Average: ${o.packages.average ?? "-"}   Median: ${o.packages.median ?? "-"}   Offers counted: ${o.packages.count}`] },
    { heading: "By department", table: { head: ["Department", "Registered", "Placed", "Placed %"], rows: o.byDepartment.map((d) => [d.name, d.total, d.placed, `${d.percentage}%`]) } },
    { heading: "By batch", table: { head: ["Batch", "Registered", "Placed", "Placed %"], rows: o.byBatch.map((b) => [b.name, b.total, b.placed, `${b.percentage}%`]) } },
  ], c ? rgb(c[0] / 255, c[1] / 255, c[2] / 255) : undefined);
}

/**
 * NAAC/NIRF-style placement data for the batch graduating in `year`, per program and overall:
 * students graduating, placed, higher studies, entrepreneurship, and median/average/highest package (LPA).
 */
export async function nirfTable(collegeId: string, year: number) {
  const students = await db.student.findMany({
    where: { collegeId, batch: { endYear: year } },
    select: { id: true, participationStatus: true, program: { select: { name: true } }, offers: { where: { status: "ACCEPTED" }, select: { packageLpa: true, offerYear: true, offeredAt: true } } },
  });
  const groups = new Map<string, typeof students>();
  const add = (k: string, s: (typeof students)[number]) => (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  for (const s of students) { add("All programs", s); add(s.program?.name ?? "Unassigned", s); }
  const rows = [...groups.entries()].map(([program, list]) => {
    const placedPkgs = list.filter((s) => s.offers.length).map((s) => Math.max(...s.offers.map((o) => Number(o.packageLpa)))); // highest accepted offer per student
    const st = packageStats(placedPkgs);
    return { program, graduating: list.length, placed: placedPkgs.length, higherStudies: list.filter((s) => s.participationStatus === "HIGHER_STUDIES").length, entrepreneurship: list.filter((s) => s.participationStatus === "ENTREPRENEURSHIP").length, medianPackageLpa: st.median, averagePackageLpa: st.average, highestPackageLpa: st.highest };
  }).sort((a, b) => (a.program === "All programs" ? -1 : b.program === "All programs" ? 1 : a.program.localeCompare(b.program)));
  return { year, rows };
}

export async function nirfXlsx(collegeId: string, year: number) {
  const t = await nirfTable(collegeId, year);
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(`Placement ${year}`);
  ws.addRow(["Program", "Students graduating", "Placed", "Higher studies", "Entrepreneurship", "Median package (LPA)", "Average package (LPA)", "Highest package (LPA)"]).font = { bold: true };
  for (const r of t.rows) ws.addRow([r.program, r.graduating, r.placed, r.higherStudies, r.entrepreneurship, r.medianPackageLpa, r.averagePackageLpa, r.highestPackageLpa]);
  ws.columns.forEach((c) => (c.width = 24));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function nextRun(from: Date, f: ReportFrequency) {
  const d = new Date(from);
  if (f === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7); else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Sends every report that is due (optionally for one college). Each schedule is claimed first, so overlapping runs never double-send. */
export async function runDueReports(collegeId?: string, now = new Date()) {
  const due = await db.reportSchedule.findMany({ where: { isActive: true, nextRunAt: { lte: now }, ...(collegeId ? { collegeId } : {}) } });
  let sent = 0; const failures: { id: string; error: string }[] = [];
  for (const sch of due) {
    const claim = await db.reportSchedule.updateMany({ where: { id: sch.id, nextRunAt: sch.nextRunAt }, data: { nextRunAt: nextRun(now, sch.frequency) } });
    if (claim.count === 0) continue;
    try {
      const year = now.getUTCFullYear();
      const att = sch.type === "PLACEMENT_SUMMARY"
        ? { filename: `placement-report-${year}.pdf`, content: await placementSummaryPdf(sch.collegeId, year), contentType: "application/pdf" }
        : { filename: `placement-data-${year}.xlsx`, content: await nirfXlsx(sch.collegeId, year), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      const res = await sendBulkEmail({ collegeId: sch.collegeId, userId: sch.createdById }, {
        purpose: `report.${sch.type.toLowerCase()}`, subject: `Placement report (${sch.type === "NIRF" ? "NAAC/NIRF data" : "summary"}), ${now.toISOString().slice(0, 10)}`,
        body: "Please find the scheduled placement report attached.", recipients: sch.recipients.map((email) => ({ email })), attachments: [att],
      });
      await db.reportSchedule.update({ where: { id: sch.id }, data: { lastRunAt: now, lastError: res.failed.length ? `${res.failed.length} recipient(s) failed` : null } });
      await audit({ collegeId: sch.collegeId, userId: sch.createdById }, { action: "report.scheduled", entity: "ReportSchedule", entityId: sch.id, after: { sent: res.sent } });
      sent++;
    } catch (e) {
      failures.push({ id: sch.id, error: (e as Error).message });
      await db.reportSchedule.update({ where: { id: sch.id }, data: { lastError: (e as Error).message.slice(0, 300) } });
    }
  }
  return { due: due.length, sent, failures };
}
export type { ReportType };

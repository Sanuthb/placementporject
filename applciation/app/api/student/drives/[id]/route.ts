import { studentRoute } from "@/lib/api/studentHandler";
import { notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { eligibilityFor } from "@/lib/studentDrives";

export const GET = studentRoute<{ id: string }>({ module: "DRIVES" }, async (_req, me, { id }) => {
  const d = await db.drive.findFirst({
    where: { id, collegeId: me.collegeId, status: { in: ["PUBLISHED", "CLOSED"] } },
    include: { company: { select: { id: true, name: true, tier: true, industry: true, website: true } }, rounds: { orderBy: { order: "asc" } }, documents: true, savedBy: { where: { studentId: me.studentId }, select: { studentId: true } }, applications: { where: { studentId: me.studentId }, select: { id: true, status: true, appliedAt: true } } },
  });
  if (!d) throw notFound("Drive not found");
  const bucket = supabaseAdmin().storage.from("drive-documents");
  const documents = await Promise.all(d.documents.map(async (x) => ({ id: x.id, fileName: x.fileName, url: (await bucket.createSignedUrl(x.storagePath, 600)).data?.signedUrl ?? null })));
  return {
    id: d.id, role: d.role, jobType: d.jobType, location: d.location, packageMinLpa: d.packageMinLpa, packageMaxLpa: d.packageMaxLpa, venue: d.venue, description: d.description, driveDate: d.driveDate, applicationDeadline: d.applicationDeadline, status: d.status,
    company: d.company, rounds: d.rounds.map((r) => ({ id: r.id, order: r.order, type: r.type, name: r.name, scheduledAt: r.scheduledAt, venue: r.venue })), documents,
    rules: { minCgpa: d.minCgpa, minTenthPct: d.minTenthPct, minTwelfthPct: d.minTwelfthPct, maxActiveBacklogs: d.maxActiveBacklogs, allowPlaced: d.allowPlaced },
    saved: d.savedBy.length > 0, myApplication: d.applications[0] ?? null, eligibility: await eligibilityFor(d, me.studentId),
  };
});

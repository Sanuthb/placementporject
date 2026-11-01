import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { readSheet } from "@/lib/import/sheet";
import { TIER_RANK } from "@/lib/ops/offers";
import { CompanyTier } from "@/generated/prisma/client";

const COLUMNS = ["enrollment_no", "name", "email", "department_code", "batch_name", "company_name", "company_tier", "role", "package_lpa", "offer_year", "joined"] as const;
const REQUIRED = ["enrollment_no", "name", "email", "department_code", "batch_name", "company_name", "role", "package_lpa", "offer_year"] as const;
const MAX_ROWS = 5000;
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const rowSchema = z.object({
  enrollment_no: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(120),
  email: z.email("email is not valid").transform((e) => e.toLowerCase()),
  department_code: z.string().trim().min(1).transform((c) => c.toUpperCase()),
  batch_name: z.string().trim().min(1),
  company_name: z.string().trim().min(2).max(200),
  company_tier: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase().replace(/[\s-]+/g, "_") : undefined), z.enum(CompanyTier).optional()),
  role: z.string().trim().min(2).max(150),
  package_lpa: z.coerce.number("package_lpa must be a number").positive().max(1000),
  offer_year: z.coerce.number("offer_year must be a year").int().min(1990).max(new Date().getUTCFullYear()),
  joined: z.preprocess(blank, z.string().trim().toLowerCase().pipe(z.enum(["yes", "no", "true", "false", "y", "n"])).optional()),
});

/**
 * Loads past years' placements (students, companies, offers, packages) so analytics work from day one.
 * Students are stored as archived and inactive, so they never mix with the current season. Done in bulk inside one transaction.
 * Re-uploading the same file is safe: existing offers are skipped.
 */
export async function importHistorical(s: { collegeId: string; userId: string }, buffer: Buffer, fileName: string, dryRun: boolean) {
  const raw = await readSheet(buffer, fileName, COLUMNS, REQUIRED, MAX_ROWS);
  const [depts, batches, companies, students] = await Promise.all([
    db.department.findMany({ where: { collegeId: s.collegeId }, select: { id: true, code: true } }),
    db.batch.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }),
    db.company.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true, tier: true } }),
    db.student.findMany({ where: { collegeId: s.collegeId }, select: { id: true, enrollmentNo: true, email: true, isArchived: true } }),
  ]);
  const deptBy = new Map(depts.map((d) => [d.code.toUpperCase(), d.id]));
  const batchBy = new Map(batches.map((b) => [b.name.toLowerCase(), b.id]));
  const companyBy = new Map(companies.map((c) => [c.name.toLowerCase(), c]));
  const studentBy = new Map(students.map((x) => [x.enrollmentNo.toLowerCase(), x]));
  const emailOwner = new Map(students.map((x) => [x.email.toLowerCase(), x.enrollmentNo.toLowerCase()]));

  type Good = z.infer<typeof rowSchema> & { departmentId: string; batchId: string };
  const good: (Good & { row: number })[] = [];
  const failed: { row: number; reasons: string[] }[] = [];
  const fileEmail = new Map<string, string>(); // email -> enrollment within this file
  const fileStudent = new Map<string, { name: string; email: string }>();

  for (const { row, data } of raw) {
    const p = rowSchema.safeParse(data);
    if (!p.success) { failed.push({ row, reasons: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }); continue; }
    const v = p.data, en = v.enrollment_no.toLowerCase(), reasons: string[] = [];
    const departmentId = deptBy.get(v.department_code), batchId = batchBy.get(v.batch_name.toLowerCase());
    if (!departmentId) reasons.push(`Unknown department_code "${v.department_code}"`);
    if (!batchId) reasons.push(`Unknown batch_name "${v.batch_name}"`);
    const existing = studentBy.get(en);
    if (existing && !existing.isArchived) reasons.push("This enrollment number belongs to a current student");
    const owner = emailOwner.get(v.email) ?? fileEmail.get(v.email);
    if (owner && owner !== en) reasons.push("This email belongs to a different student");
    const prev = fileStudent.get(en);
    if (prev && prev.email !== v.email) reasons.push("Same enrollment_no appears with a different email in this file");
    if (reasons.length || !departmentId || !batchId) { failed.push({ row, reasons }); continue; }
    fileEmail.set(v.email, en); fileStudent.set(en, { name: v.name, email: v.email });
    good.push({ ...v, departmentId, batchId, row });
  }

  const newStudents = new Map<string, Good>(); // enrollment -> first row
  const tierOf = new Map<string, CompanyTier>(); // enrollment -> best tier
  const newCompanies = new Map<string, { name: string; tier: CompanyTier }>();
  for (const g of good) {
    const en = g.enrollment_no.toLowerCase(), cn = g.company_name.toLowerCase();
    if (!studentBy.has(en) && !newStudents.has(en)) newStudents.set(en, g);
    const known = companyBy.get(cn);
    const tier = known?.tier ?? g.company_tier ?? "REGULAR";
    if (!known && !newCompanies.has(cn)) newCompanies.set(cn, { name: g.company_name, tier });
    const cur = tierOf.get(en);
    if (!cur || TIER_RANK[tier] > TIER_RANK[cur]) tierOf.set(en, tier);
  }

  const summary = { dryRun, rows: raw.length, valid: good.length, failed: failed.length, studentsToCreate: newStudents.size, companiesToCreate: newCompanies.size, errors: failed.slice(0, 200) };
  if (dryRun) return { ...summary, offersToCreate: good.length };

  const result = await db.$transaction(async (tx) => {
    if (newStudents.size) {
      await tx.student.createMany({
        data: [...newStudents.entries()].map(([en, g]) => ({
          collegeId: s.collegeId, enrollmentNo: g.enrollment_no, name: g.name, email: g.email, departmentId: g.departmentId, batchId: g.batchId,
          isArchived: true, isActive: false, stage: "ONBOARDED" as const, onboardedAt: new Date(), isPlaced: true, placedTier: tierOf.get(en),
        })),
        skipDuplicates: true,
      });
    }
    if (newCompanies.size) await tx.company.createMany({ data: [...newCompanies.values()].map((c) => ({ collegeId: s.collegeId, name: c.name, tier: c.tier })), skipDuplicates: true });
    const [studs, cos] = await Promise.all([
      tx.student.findMany({ where: { collegeId: s.collegeId, enrollmentNo: { in: [...new Set(good.map((g) => g.enrollment_no))] } }, select: { id: true, enrollmentNo: true } }),
      tx.company.findMany({ where: { collegeId: s.collegeId }, select: { id: true, name: true } }),
    ]);
    const sid = new Map(studs.map((x) => [x.enrollmentNo.toLowerCase(), x.id])), cid = new Map(cos.map((c) => [c.name.toLowerCase(), c.id]));
    const have = new Set((await tx.offer.findMany({ where: { collegeId: s.collegeId, isHistorical: true }, select: { studentId: true, companyId: true, role: true, offerYear: true } })).map((o) => `${o.studentId}|${o.companyId}|${o.role.toLowerCase()}|${o.offerYear}`));
    const offers = [];
    let duplicates = 0;
    for (const g of good) {
      const studentId = sid.get(g.enrollment_no.toLowerCase()), companyId = cid.get(g.company_name.toLowerCase());
      if (!studentId || !companyId) continue;
      const key = `${studentId}|${companyId}|${g.role.toLowerCase()}|${g.offer_year}`;
      if (have.has(key)) { duplicates++; continue; }
      have.add(key);
      const joined = g.joined && ["yes", "y", "true"].includes(g.joined);
      offers.push({
        collegeId: s.collegeId, studentId, companyId, role: g.role, packageLpa: g.package_lpa, status: "ACCEPTED" as const, isHistorical: true, offerYear: g.offer_year,
        offeredAt: new Date(Date.UTC(g.offer_year, 5, 1)), respondedAt: new Date(Date.UTC(g.offer_year, 5, 1)), createdById: s.userId,
        joiningStatus: g.joined ? (joined ? "JOINED" as const : "NOT_JOINED" as const) : "PENDING" as const,
      });
    }
    if (offers.length) await tx.offer.createMany({ data: offers });
    await audit(s, { action: "historical.import", entity: "Offer", after: { fileName, offers: offers.length, students: newStudents.size, companies: newCompanies.size, failed: failed.length } }, tx);
    return { offersCreated: offers.length, duplicatesSkipped: duplicates };
  }, { timeout: 120_000, maxWait: 10_000 });
  return { ...summary, ...result };
}

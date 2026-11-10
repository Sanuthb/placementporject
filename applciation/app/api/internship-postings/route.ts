import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { INT_ADMIN } from "@/lib/internshipService";
import { InternshipMode } from "@/generated/prisma/client";

const rule = (max: number) => z.number().min(0).max(max).nullish();
export const postingFields = z.object({
  title: z.string().trim().min(3).max(150), companyId: z.uuid().nullish(), companyName: z.string().trim().min(2).max(200).optional(), description: z.string().trim().max(6000).nullish(), location: z.string().trim().max(120).nullish(),
  mode: z.enum(InternshipMode).optional(), stipendInr: z.number().int().min(0).max(1_000_000).nullish(), openings: z.number().int().min(1).max(1000).nullish(), skills: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  startDate: z.coerce.date(), endDate: z.coerce.date(), applicationDeadline: z.coerce.date(),
  minCgpa: rule(10), minTenthPct: rule(100), minTwelfthPct: rule(100), maxActiveBacklogs: z.number().int().min(0).max(30).nullish(),
  departmentIds: z.array(z.uuid()).max(50).optional(), batchIds: z.array(z.uuid()).max(50).optional(), programIds: z.array(z.uuid()).max(50).optional(), allowPlaced: z.boolean().optional(),
});

/** Resolves the company name and checks the audience belongs to this college. */
export async function checkPosting(collegeId: string, b: Partial<z.infer<typeof postingFields>>) {
  let companyName = b.companyName;
  if (b.companyId) { const c = await db.company.findFirst({ where: { id: b.companyId, collegeId }, select: { name: true } }); if (!c) throw badRequest("Company not found"); companyName = c.name; }
  if (b.startDate && b.endDate && b.endDate <= b.startDate) throw badRequest("The end date must be after the start date");
  if (b.startDate && b.applicationDeadline && b.startDate <= b.applicationDeadline) throw badRequest("The internship should start after the application deadline");
  const chk = async (ids: string[] | undefined, model: "department" | "batch" | "program", label: string) => {
    if (ids?.length && (await (db[model] as unknown as { count: (a: unknown) => Promise<number> }).count({ where: { id: { in: ids }, collegeId } })) !== new Set(ids).size) throw badRequest(`A chosen ${label} was not found`);
  };
  await chk(b.departmentIds, "department", "department"); await chk(b.batchIds, "batch", "batch"); await chk(b.programIds, "program", "programme");
  return companyName;
}

export const GET = route(INT_ADMIN, async (_req, s) => {
  const rows = await db.internshipPosting.findMany({ where: { collegeId: s.collegeId }, orderBy: { createdAt: "desc" }, take: 200, include: { applications: { select: { status: true } } } });
  return rows.map((p) => ({ id: p.id, title: p.title, companyName: p.companyName, mode: p.mode, status: p.status, openings: p.openings, applicationDeadline: p.applicationDeadline, startDate: p.startDate, endDate: p.endDate, companyConfirmed: p.companyConfirmed, applications: p.applications.length, selected: p.applications.filter((a) => a.status === "ALLOTTED").length }));
});

/** Adds an internship posting as a draft. It opens to students once the company has confirmed it. */
export const POST = route(INT_ADMIN, async (req, s) => {
  const b = await parseBody(req, postingFields);
  const companyName = await checkPosting(s.collegeId, b);
  if (!companyName) throw badRequest("Choose a company or type its name");
  const p = await db.internshipPosting.create({ data: { ...b, companyName, collegeId: s.collegeId, createdById: s.userId } });
  await audit(s, { action: "internship_posting.create", entity: "InternshipPosting", entityId: p.id, after: { title: p.title, companyName } });
  return p;
});

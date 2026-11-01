import { recruiterRoute } from "@/lib/api/recruiterHandler";
import { db } from "@/lib/db";

export const GET = recruiterRoute(async (_req, r) => ({ ...r, company: await db.company.findUniqueOrThrow({ where: { id: r.companyId }, select: { id: true, name: true, tier: true, industry: true } }) }));

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { RecruiterJobStatus } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(RecruiterJobStatus).default("PENDING_REVIEW") });

/** Jobs recruiters have posted, waiting for staff review. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "RECRUITER_PORTAL" }, async (req, s) => db.recruiterJob.findMany({ where: { collegeId: s.collegeId, status: parseQuery(req, query).status }, include: { recruiter: { select: { id: true, name: true, company: { select: { id: true, name: true } } } } }, orderBy: { createdAt: "asc" }, take: 200 }));

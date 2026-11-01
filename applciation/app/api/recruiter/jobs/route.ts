import { z } from "zod";
import { recruiterRoute } from "@/lib/api/recruiterHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { JobType } from "@/generated/prisma/client";

const create = z.object({ title: z.string().trim().min(3).max(200), jobType: z.enum(JobType), location: z.string().trim().max(200).optional(), description: z.string().trim().max(10_000).optional(), applyUrl: z.url(), deadline: z.coerce.date().optional() });

export const GET = recruiterRoute((_req, r) => db.recruiterJob.findMany({ where: { recruiterId: r.recruiterId }, select: { id: true, title: true, jobType: true, status: true, reviewNote: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 }));

/** Post an opening. Staff review it before students see it. */
export const POST = recruiterRoute(async (req, r) => {
  const b = await parseBody(req, create);
  return db.$transaction(async (tx) => {
    const j = await tx.recruiterJob.create({ data: { ...b, collegeId: r.collegeId, recruiterId: r.recruiterId }, select: { id: true, status: true } });
    await notifyStaff(r.collegeId, { type: "recruiterJob.submitted", title: `${r.name} posted a job for review: ${b.title}`, link: "/recruiter-jobs" }, tx);
    return j;
  });
});

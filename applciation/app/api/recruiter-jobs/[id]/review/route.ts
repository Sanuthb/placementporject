import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const body = z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(500).optional() }).refine((v) => v.decision === "APPROVE" || !!v.note, { message: "Give the recruiter a reason", path: ["note"] });

/** Approving publishes the posting as a job alert to students; rejecting tells the recruiter why. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "RECRUITER_PORTAL" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  return db.$transaction(async (tx) => {
    const job = await tx.recruiterJob.findFirst({ where: { id, collegeId: s.collegeId, status: "PENDING_REVIEW" }, include: { recruiter: { include: { company: { select: { name: true } } } } } });
    const claim = await tx.recruiterJob.updateMany({ where: { id, collegeId: s.collegeId, status: "PENDING_REVIEW" }, data: { status: b.decision === "APPROVE" ? "APPROVED" : "REJECTED", reviewedById: s.userId, reviewNote: b.note } });
    if (claim.count === 0 || !job) throw new ApiError(409, "CONFLICT", "This posting is not awaiting review");
    let jobAlertId: string | null = null;
    if (b.decision === "APPROVE") {
      const alert = await tx.jobAlert.create({ data: { collegeId: s.collegeId, title: job.title, companyName: job.recruiter.company.name, jobType: job.jobType, location: job.location, description: job.description, applyUrl: job.applyUrl, deadline: job.deadline, status: "PUBLISHED", publishedAt: new Date(), createdById: s.userId } });
      jobAlertId = alert.id;
      await tx.recruiterJob.update({ where: { id }, data: { jobAlertId } });
    }
    await audit(s, { action: `recruiterJob.${b.decision.toLowerCase()}`, entity: "RecruiterJob", entityId: id, reason: b.note }, tx);
    return { id, status: b.decision === "APPROVE" ? "APPROVED" : "REJECTED", jobAlertId };
  });
});

import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { KINDS } from "@/lib/resumeEngine";
import { createVersion, driftOf, loadMaster } from "@/lib/resumeService";
import { TEMPLATES } from "@/lib/resumeRender";

/** My resumes, newest first, each with whether my profile has new things since it was approved. */
export const GET = studentRoute({ module: "ONBOARDING" }, async (_req, me) => {
  const [rows, master] = await Promise.all([db.resumeVersion.findMany({ where: { studentId: me.studentId, status: { not: "ARCHIVED" } }, orderBy: { number: "desc" }, select: { id: true, number: true, title: true, kind: true, template: true, status: true, isPrimary: true, targetCompany: true, targetRole: true, verifiedOnly: true, approvedAt: true, updatedAt: true, profileKeys: true } }), loadMaster(me.collegeId, me.studentId)]);
  return rows.map(({ profileKeys, ...r }) => ({ ...r, newItems: r.status === "APPROVED" ? driftOf({ ...r, profileKeys } as never, master).added.length : 0 }));
});

export const createBody = z.object({
  kind: z.enum(KINDS), template: z.enum(TEMPLATES).default("ATS"), title: z.string().trim().max(80).optional(), targetCompany: z.string().trim().max(100).nullish(), targetRole: z.string().trim().max(100).nullish(),
  targetText: z.string().trim().max(6000).nullish(), verifiedOnly: z.boolean().optional(), markEvidence: z.boolean().optional(),
});

/** Start a resume of one kind from my master profile. It stays a draft until I approve it. A company-specific resume takes the company, the role and the job description or skills wanted. */
export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "resume-create", max: 40, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, createBody);
  const v = await createVersion(me.collegeId, me.studentId, b);
  return { id: v.id, number: v.number };
});

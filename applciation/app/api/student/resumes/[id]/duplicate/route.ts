import { studentRoute } from "@/lib/api/studentHandler";
import { createVersion, versionOf } from "@/lib/resumeService";
import type { Kind } from "@/lib/resumeEngine";
import type { Prisma } from "@/generated/prisma/client";

/** Copy a resume into a new draft (with the same kind, template, target and my edits) to change it. The original stays as it was. */
export const POST = studentRoute<{ id: string }>({ module: "ONBOARDING", limit: { name: "resume-create", max: 40, windowSec: 3600 } }, async (_req, me, { id }) => {
  const v = await versionOf(me.studentId, id);
  const n = await createVersion(me.collegeId, me.studentId, { kind: v.kind as Kind, template: v.template, title: `${v.title} (copy)`.slice(0, 80), targetCompany: v.targetCompany, targetRole: v.targetRole, targetText: v.targetText, verifiedOnly: v.verifiedOnly, markEvidence: v.markEvidence, edits: v.edits as Prisma.InputJsonValue });
  return { id: n.id, number: n.number };
});

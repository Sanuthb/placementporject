import { studentRoute } from "@/lib/api/studentHandler";
import { approveVersion, versionOf } from "@/lib/resumeService";

/** Approve a draft: you have read it and it is right. Its document is frozen. The first one you approve becomes your main resume. */
export const POST = studentRoute<{ id: string }>({ module: "ONBOARDING" }, async (_req, me, { id }) => {
  const v = await approveVersion(await versionOf(me.studentId, id));
  return { id: v.id, status: v.status, isPrimary: v.isPrimary };
});

import { studentRoute } from "@/lib/api/studentHandler";
import { makePrimary, versionOf } from "@/lib/resumeService";

/** Make an approved resume my main one. */
export const POST = studentRoute<{ id: string }>({ module: "ONBOARDING" }, async (_req, me, { id }) => {
  await makePrimary(await versionOf(me.studentId, id));
  return { ok: true };
});

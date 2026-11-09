import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { mfaStatus } from "@/lib/auth/mfa";
import { verifyTokenInfo } from "@/lib/auth/verifyToken";

/** Reachable before two-step sign-in is finished (`skipMfa`), so the screens can learn that a code is needed and where to send the person. */
export const GET = route({ skipMfa: true, facultyOk: true }, async (req, session) => {
  const modules = await db.collegeModule.findMany({ where: { collegeId: session.collegeId, enabled: true }, select: { module: true } });
  const token = (req.headers.get("authorization") ?? "").slice(7);
  const { aal } = await verifyTokenInfo(token);
  return { ...session, modules: modules.map((m) => m.module), mfa: await mfaStatus(session, aal) };
});

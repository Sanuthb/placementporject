import { route } from "@/lib/api/handler";
import { db } from "@/lib/db";

export const GET = route({}, async (_req, session) => {
  const modules = await db.collegeModule.findMany({
    where: { collegeId: session.collegeId, enabled: true },
    select: { module: true },
  });
  return { ...session, modules: modules.map((m) => m.module) };
});

import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { provisionInput, provisionInstitution } from "@/lib/provision";

/** Platform administrators only. Counts only; no college's records are returned. */
export const GET = platformRoute({}, async () => {
  const rows = await db.college.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, isActive: true, createdAt: true, _count: { select: { users: true, students: true, departments: true } } },
  });
  return rows;
});

export const POST = platformRoute({ limit: { name: "provision", max: 20, windowSec: 3600 } }, async (req, admin) =>
  provisionInstitution(admin, await parseBody(req, provisionInput)));

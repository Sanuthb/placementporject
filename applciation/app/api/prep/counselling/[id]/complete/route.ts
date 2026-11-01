import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";

const body = z.object({ notes: z.string().trim().max(5000).optional() });

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, async (req, s, { id }) => {
  const { notes } = await parseBody(req, body.default({}));
  const r = await db.counsellingSlot.updateMany({ where: { id, collegeId: s.collegeId, status: "BOOKED" }, data: { status: "COMPLETED", notes } });
  if (r.count === 0) throw new ApiError(409, "CONFLICT", "Only booked sessions can be completed");
  return { id, status: "COMPLETED" };
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { JoiningStatus } from "@/generated/prisma/client";

const body = z.object({ joiningStatus: z.enum(JoiningStatus), joiningDate: z.coerce.date().optional() })
  .refine((v) => v.joiningStatus !== "JOINED" || !!v.joiningDate, { message: "A joining date is required when marking a student as joined", path: ["joiningDate"] });

/** Tracks accepted vs actually joined. Only accepted offers have a joining status. */
export const PATCH = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const data = await parseBody(req, body);
  return db.$transaction(async (tx) => {
    const claim = await tx.offer.updateMany({ where: { id, collegeId: s.collegeId, status: "ACCEPTED" }, data: { joiningStatus: data.joiningStatus, joiningDate: data.joiningDate ?? null } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", "Only accepted offers can have a joining status");
    await audit(s, { action: "offer.joining", entity: "Offer", entityId: id, after: { joiningStatus: data.joiningStatus } }, tx);
    return { id, ...data };
  });
});

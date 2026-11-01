import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadScope } from "@/lib/attendance";

const body = z.object({ status: z.enum(["IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"]) });
const FROM: Record<string, string[]> = { IN_PROGRESS: ["SCHEDULED"], COMPLETED: ["IN_PROGRESS"], NO_SHOW: ["SCHEDULED", "IN_PROGRESS"], CANCELLED: ["SCHEDULED"] };

/** Moves a slot through its day: start, complete, no-show or cancel. A panel runs one interview at a time. */
export const PATCH = route<{ id: string; slotId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id, slotId }) => {
  const { status } = await parseBody(req, body);
  await loadScope(s.collegeId, id);
  return db.$transaction(async (tx) => {
    const slot = await tx.interviewSlot.findFirst({ where: { id: slotId, driveId: id } });
    if (!slot) throw notFound("Slot not found");
    if (status === "IN_PROGRESS" && (await tx.interviewSlot.findFirst({ where: { panelId: slot.panelId, status: "IN_PROGRESS" } }))) throw new ApiError(409, "PANEL_BUSY", "This panel is already interviewing someone");
    const claim = await tx.interviewSlot.updateMany({ where: { id: slotId, status: { in: FROM[status] as never[] } }, data: { status } });
    if (claim.count === 0) throw new ApiError(409, "CONFLICT", `A ${slot.status.toLowerCase().replace("_", " ")} slot cannot become ${status.toLowerCase().replace("_", " ")}`);
    await audit(s, { action: "slot.status", entity: "InterviewSlot", entityId: slotId, before: { status: slot.status }, after: { status } }, tx);
    return { id: slotId, status };
  });
});

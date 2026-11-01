import { route } from "@/lib/api/handler";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadScope } from "@/lib/attendance";

export const DELETE = route<{ id: string; panelId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (_req, s, { id, panelId }) => {
  await loadScope(s.collegeId, id);
  const panel = await db.interviewPanel.findFirst({ where: { id: panelId, driveId: id }, include: { _count: { select: { slots: true } } } });
  if (!panel) throw notFound("Panel not found");
  if (panel._count.slots) throw new ApiError(409, "CONFLICT", "This panel has slots; cancel or move them first");
  await db.$transaction(async (tx) => {
    await tx.interviewPanel.delete({ where: { id: panelId } });
    await audit(s, { action: "panel.delete", entity: "Drive", entityId: id, after: { panelId } }, tx);
  });
  return { deleted: true };
});

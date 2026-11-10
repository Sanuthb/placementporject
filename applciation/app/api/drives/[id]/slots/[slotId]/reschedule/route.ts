import { notifyStudent } from "@/lib/notify";
import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { ApiError, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadScope } from "@/lib/attendance";
import { assertNoConflict } from "@/lib/scheduling";
import { sendBulkEmail } from "@/lib/ops/email";

const body = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date(), panelId: z.uuid().optional(), reason: z.string().trim().max(300).optional() })
  .refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });

/** Moves a slot and emails the student. The move stands even if the email cannot be sent. */
export const POST = route<{ id: string; slotId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id, slotId }) => {
  const b = await parseBody(req, body);
  const { drive } = await loadScope(s.collegeId, id);
  const slot = await db.interviewSlot.findFirst({ where: { id: slotId, driveId: id }, include: { application: { select: { studentId: true, student: { select: { email: true, name: true } } } } } });
  if (!slot) throw notFound("Slot not found");
  if (slot.status !== "SCHEDULED") throw new ApiError(409, "CONFLICT", "Only scheduled slots can be rescheduled");
  const panelId = b.panelId ?? slot.panelId;
  if (b.panelId && !(await db.interviewPanel.findFirst({ where: { id: b.panelId, driveId: id } }))) throw new ApiError(400, "BAD_REQUEST", "Panel not found in this drive");

  await db.$transaction(async (tx) => {
    await assertNoConflict(tx, { panelId, studentId: slot.application.studentId, startsAt: b.startsAt, endsAt: b.endsAt, excludeSlotId: slotId });
    await tx.interviewSlot.update({ where: { id: slotId }, data: { startsAt: b.startsAt, endsAt: b.endsAt, panelId, rescheduleCount: { increment: 1 } } });
    await audit(s, { action: "slot.reschedule", entity: "InterviewSlot", entityId: slotId, before: { startsAt: slot.startsAt.toISOString() }, after: { startsAt: b.startsAt.toISOString(), panelId }, reason: b.reason }, tx);
  });
  await notifyStudent(s.collegeId, slot.application.studentId, { type: "interview.slot", title: `Interview rescheduled: ${drive.role}`, body: `${b.startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST${b.reason ? `. ${b.reason}` : ""}`, link: "/student/applications" }).catch(() => undefined);
  let notified = false;
  try {
    const r = await sendBulkEmail(s, { purpose: "slot.reschedule", subject: "Your interview has been rescheduled", body: `Hello ${slot.application.student.name},\n\nYour interview for ${drive.role} has been moved to ${b.startsAt.toUTCString()}.${b.reason ? `\n\nReason: ${b.reason}` : ""}`, recipients: [{ email: slot.application.student.email, studentId: slot.application.studentId }] });
    notified = r.sent === 1;
  } catch { /* email not configured or failed: reported below */ }
  return { id: slotId, startsAt: b.startsAt, endsAt: b.endsAt, notified };
});

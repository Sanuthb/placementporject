import { notifyStudent } from "@/lib/notify";
import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { loadScope } from "@/lib/attendance";
import { assertNoConflict } from "@/lib/scheduling";

const query = z.object({ roundId: z.uuid().optional() });
const body = z.object({ roundId: z.uuid(), panelId: z.uuid(), applicationId: z.uuid(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), notes: z.string().trim().max(500).optional() })
  .refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] })
  .refine((v) => v.endsAt.getTime() - v.startsAt.getTime() <= 8 * 3_600_000, { message: "A slot cannot be longer than 8 hours", path: ["endsAt"] });

/** Day-of view: every slot, plus per panel who is in the interview now and who is next. */
export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const q = parseQuery(req, query);
  await loadScope(s.collegeId, id, q.roundId);
  const slots = await db.interviewSlot.findMany({
    where: { driveId: id, roundId: q.roundId },
    select: { id: true, roundId: true, panelId: true, startsAt: true, endsAt: true, status: true, notes: true, rescheduleCount: true, application: { select: { id: true, student: { select: { id: true, name: true, enrollmentNo: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  const panels = await db.interviewPanel.findMany({ where: { driveId: id }, orderBy: { name: "asc" } });
  return {
    panels: panels.map((p) => {
      const mine = slots.filter((x) => x.panelId === p.id);
      return { ...p, inInterview: mine.find((x) => x.status === "IN_PROGRESS") ?? null, next: mine.find((x) => x.status === "SCHEDULED") ?? null };
    }),
    slots,
  };
});

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const b = await parseBody(req, body);
  const { round } = await loadScope(s.collegeId, id, b.roundId);
  const [panel, app] = await Promise.all([
    db.interviewPanel.findFirst({ where: { id: b.panelId, driveId: id } }),
    db.application.findFirst({ where: { id: b.applicationId, driveId: id, status: "SHORTLISTED", currentRound: round!.order }, select: { id: true, studentId: true } }),
  ]);
  if (!panel) throw badRequest("Panel not found in this drive");
  if (!app) throw badRequest("This student is not waiting for this round");
  const made = await db.$transaction(async (tx) => {
    if (await tx.interviewSlot.findFirst({ where: { applicationId: app.id, roundId: b.roundId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } } })) throw new ApiError(409, "CONFLICT", "This student already has a slot for this round");
    await assertNoConflict(tx, { panelId: b.panelId, studentId: app.studentId, startsAt: b.startsAt, endsAt: b.endsAt });
    const slot = await tx.interviewSlot.create({ data: { collegeId: s.collegeId, driveId: id, roundId: b.roundId, panelId: b.panelId, applicationId: app.id, startsAt: b.startsAt, endsAt: b.endsAt, notes: b.notes, createdById: s.userId } });
    await audit(s, { action: "slot.create", entity: "InterviewSlot", entityId: slot.id, after: { applicationId: app.id, panelId: b.panelId } }, tx);
    return slot;
  });
  const d = await db.drive.findUnique({ where: { id }, select: { role: true, company: { select: { name: true } } } });
  await notifyStudent(s.collegeId, app.studentId, { type: "interview.slot", title: `Interview scheduled: ${d?.company.name ?? ""} ${d?.role ?? ""}`.trim(), body: `${b.startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST. See Applications for the room.`, link: "/student/applications" }).catch(() => undefined);
  return made;
});

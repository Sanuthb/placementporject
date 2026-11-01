import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notify";
import { saveSection } from "@/lib/verification";
import type { Session } from "@/lib/auth/session";
import { departmentScope } from "@/lib/auth/session";
import { notFound } from "@/lib/api/errors";
import { ProfileSection, TicketCategory } from "@/generated/prisma/client";

export const ticketInput = z.object({
  studentId: z.uuid(), category: z.enum(TicketCategory), subject: z.string().trim().min(3).max(200), message: z.string().trim().min(3).max(5000),
  section: z.enum(ProfileSection).optional(), data: z.record(z.string(), z.unknown()).optional(),
}).refine((v) => v.category !== "DATA_CORRECTION" || (v.section && v.data), { message: "A data correction needs the section and the corrected data", path: ["data"] });
export type TicketInput = z.infer<typeof ticketInput>;

/** Staff-side ticket access: coordinators only reach their own department. */
export async function ticketFor(s: Session, id: string) {
  const t = await db.ticket.findFirst({ where: { id, collegeId: s.collegeId, ...departmentScope(s) } });
  if (!t) throw notFound("Ticket not found");
  return t;
}

/**
 * Opens a ticket. A correction to verified data goes straight into the verification queue as a pending
 * revision: the verified values stay in place until a reviewer approves the change.
 */
export async function createTicket(s: { collegeId: string; userId: string | null }, input: TicketInput, authorStudentId?: string) {
  const student = await db.student.findFirst({ where: { id: input.studentId, collegeId: s.collegeId }, select: { id: true, name: true, departmentId: true } });
  if (!student) throw notFound("Student not found");
  return db.$transaction(async (tx) => {
    const t = await tx.ticket.create({
      data: { collegeId: s.collegeId, studentId: student.id, departmentId: student.departmentId, category: input.category, section: input.section, subject: input.subject, messages: { create: { authorUserId: s.userId, authorStudentId, body: input.message } } },
    });
    if (input.category === "DATA_CORRECTION") await saveSection(tx, { collegeId: s.collegeId, actorId: s.userId }, student.id, input.section!, input.data, true);
    await audit(s, { action: "ticket.create", entity: "Ticket", entityId: t.id, after: { category: input.category, studentId: student.id } }, tx);
    await notifyStaff(s.collegeId, { type: "ticket.created", title: `New ticket from ${student.name}: ${input.subject}`, link: `/tickets/${t.id}`, departmentId: student.departmentId, excludeUserId: s.userId }, tx);
    return t;
  });
}

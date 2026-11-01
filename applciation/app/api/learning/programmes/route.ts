import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveStudents } from "@/lib/learning";
import { ProgrammeDelivery } from "@/generated/prisma/client";

const create = z.object({
  title: z.string().trim().min(3).max(200), goal: z.string().trim().min(3).max(200), delivery: z.enum(ProgrammeDelivery).default("IN_HOUSE"), partnerName: z.string().trim().max(200).optional(),
  journeyId: z.uuid().optional(), startsAt: z.coerce.date().optional(), endsAt: z.coerce.date().optional(),
  studentIds: z.array(z.uuid()).max(2000).optional(), departmentId: z.uuid().optional(), batchId: z.uuid().optional(),
}).refine((v) => v.delivery !== "PARTNER" || !!v.partnerName, { message: "A partner programme needs the partner's name", path: ["partnerName"] })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "LEARNING" }, (_req, s) =>
  db.learningProgramme.findMany({ where: { collegeId: s.collegeId }, include: { journey: { select: { id: true, name: true } }, _count: { select: { members: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
);

/** Creates a programme (a group of students with a preparation goal) and optionally enrols students straight away. */
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "LEARNING" }, async (req, s) => {
  const { studentIds, departmentId, batchId, ...b } = await parseBody(req, create);
  if (b.journeyId && !(await db.learningJourney.findFirst({ where: { id: b.journeyId, collegeId: s.collegeId } }))) throw badRequest("Journey not found");
  const enrol = studentIds?.length || departmentId || batchId ? await resolveStudents(s.collegeId, { studentIds, departmentId, batchId }) : [];
  return db.$transaction(async (tx) => {
    const p = await tx.learningProgramme.create({ data: { ...b, collegeId: s.collegeId, createdById: s.userId } });
    if (enrol.length) {
      await tx.learningMember.createMany({ data: enrol.map((studentId) => ({ programmeId: p.id, studentId })), skipDuplicates: true });
      await tx.notification.createMany({ data: enrol.map((studentId) => ({ collegeId: s.collegeId, studentId, type: "learning.enrolled", title: `You were enrolled in ${p.title}`, link: `/learning/${p.id}` })) });
    }
    await audit(s, { action: "programme.create", entity: "LearningProgramme", entityId: p.id, after: { title: p.title, enrolled: enrol.length } }, tx);
    return { ...p, enrolled: enrol.length };
  });
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { ApiError, badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStudent } from "@/lib/notify";
import { scope } from "@/lib/internshipService";
import { InternshipStatus } from "@/generated/prisma/client";

const R = { module: "INTERNSHIPS" as const, facultyOk: true };
const query = z.object({ status: z.enum(InternshipStatus).optional(), studentId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional() });
const allot = z.object({
  studentId: z.uuid(), companyId: z.uuid().optional(), companyName: z.string().trim().min(2).max(200).optional(), role: z.string().trim().min(2).max(150),
  startDate: z.coerce.date(), endDate: z.coerce.date(), mentorName: z.string().trim().max(120).optional(), mentorEmail: z.email().optional(),
}).refine((v) => v.endDate > v.startDate, { message: "endDate must be after startDate", path: ["endDate"] }).refine((v) => v.companyId || v.companyName, { message: "Give companyId or companyName", path: ["companyName"] });

export const GET = route(R, async (req, s) => {
  const q = parseQuery(req, query);
  const rows = await db.internship.findMany({
    where: { ...scope(s), status: q.status, studentId: q.studentId },
    include: { student: { select: { id: true, name: true, enrollmentNo: true } }, _count: { select: { logs: true, evaluations: true, tasks: true } } },
    orderBy: [{ startDate: "desc" }, { id: "asc" }], take: q.limit + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > q.limit;
  const items = hasMore ? rows.slice(0, q.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
});

/** Allots a student to an internship. A student can have only one running at a time. */
export const POST = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "INTERNSHIPS" }, async (req, s) => {
  const b = await parseBody(req, allot);
  const student = await db.student.findFirst({ where: { id: b.studentId, collegeId: s.collegeId, isActive: true, isArchived: false }, select: { id: true } });
  if (!student) throw badRequest("Student not found or not active");
  let companyName = b.companyName;
  if (b.companyId) { const c = await db.company.findFirst({ where: { id: b.companyId, collegeId: s.collegeId } }); if (!c) throw badRequest("Company not found"); companyName = c.name; }
  if (await db.internship.findFirst({ where: { studentId: b.studentId, status: { in: ["ALLOTTED", "ONGOING"] } } })) throw new ApiError(409, "CONFLICT", "This student already has an internship in progress");
  return db.$transaction(async (tx) => {
    const i = await tx.internship.create({ data: { collegeId: s.collegeId, studentId: b.studentId, companyId: b.companyId, companyName: companyName!, role: b.role, startDate: b.startDate, endDate: b.endDate, mentorName: b.mentorName, mentorEmail: b.mentorEmail, createdById: s.userId } });
    await audit(s, { action: "internship.allot", entity: "Internship", entityId: i.id, after: { studentId: b.studentId, companyName } }, tx);
    await notifyStudent(s.collegeId, b.studentId, { type: "internship.allotted", title: `Internship allotted: ${b.role} at ${companyName}`, link: `/internships/${i.id}` }, tx);
    return i;
  });
});

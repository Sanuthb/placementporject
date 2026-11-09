import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { facultyStudentWhere } from "@/lib/faculty";

const query = z.object({ q: z.string().trim().max(80).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });

/**
 * The students a faculty member may see: their mentees and the students of their allocated programmes and batches, in their own college.
 * Only academic fields are returned: no documents, psychometrics, offers or contact history.
 */
export const GET = route({ roles: ["FACULTY"] }, async (req, s) => {
  const { q, limit } = parseQuery(req, query);
  const scope = await facultyStudentWhere(s.collegeId, s.userId);
  const items = await db.student.findMany({
    where: { AND: [scope, q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { enrollmentNo: { contains: q, mode: "insensitive" } }] } : {}] },
    select: {
      id: true, name: true, enrollmentNo: true, email: true, mentorId: true,
      department: { select: { name: true } }, program: { select: { name: true } }, batch: { select: { name: true } }, currentSemester: { select: { name: true } },
    },
    orderBy: { name: "asc" }, take: limit,
  });
  return { items: items.map((i) => ({ ...i, isMentee: i.mentorId === s.userId, mentorId: undefined })) };
});

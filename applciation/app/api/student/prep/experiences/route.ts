import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notify";
import { RoundType } from "@/generated/prisma/client";

const query = z.object({ company: z.string().trim().max(100).optional(), mine: z.enum(["true", "false"]).default("false") });
const create = z.object({ companyName: z.string().trim().min(2).max(200), role: z.string().trim().min(2).max(150), roundType: z.enum(RoundType).optional(), experience: z.string().trim().min(50).max(8000), difficulty: z.number().int().min(1).max(5) });

/** Approved experiences from other students, without names. `mine=true` lists my own submissions with their moderation status. */
export const GET = studentRoute({ module: "STUDENT_PREP" }, async (req, me) => {
  const q = parseQuery(req, query);
  if (q.mine === "true") return db.interviewExperience.findMany({ where: { studentId: me.studentId }, select: { id: true, companyName: true, role: true, status: true, moderationNote: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  return db.interviewExperience.findMany({ where: { collegeId: me.collegeId, status: "APPROVED", ...(q.company ? { companyName: { contains: q.company, mode: "insensitive" } } : {}) }, select: { id: true, companyName: true, role: true, roundType: true, experience: true, difficulty: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
});

/** Shared experiences are reviewed by staff before other students see them. */
export const POST = studentRoute({ limit: { name: "experience", max: 10, windowSec: 3600 }, module: "STUDENT_PREP" }, async (req, me) => {
  const b = await parseBody(req, create);
  return db.$transaction(async (tx) => {
    const e = await tx.interviewExperience.create({ data: { ...b, collegeId: me.collegeId, studentId: me.studentId }, select: { id: true, status: true } });
    await notifyStaff(me.collegeId, { type: "experience.submitted", title: `${me.name} shared an interview experience for review`, link: "/prep/experiences" }, tx);
    return e;
  });
});

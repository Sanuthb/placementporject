import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { ModerationStatus } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(ModerationStatus).default("PENDING") });

/** Moderation queue for interview experiences students have shared. */
export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "STUDENT_PREP" }, async (req, s) =>
  db.interviewExperience.findMany({ where: { collegeId: s.collegeId, status: parseQuery(req, query).status }, include: { student: { select: { id: true, name: true, enrollmentNo: true } } }, orderBy: { createdAt: "asc" }, take: 200 }),
);

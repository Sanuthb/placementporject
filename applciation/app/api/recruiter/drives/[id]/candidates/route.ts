import { z } from "zod";
import { recruiterRoute, recruiterDrive } from "@/lib/api/recruiterHandler";
import { parseQuery } from "@/lib/api/parse";
import { db } from "@/lib/db";

const query = z.object({ roundId: z.uuid().optional() });

/** Shortlisted candidates only (optionally those who cleared a given round). Rejected and unshortlisted students are never shown. */
export const GET = recruiterRoute<{ id: string }>(async (req, r, { id }) => {
  await recruiterDrive(r, id);
  const { roundId } = parseQuery(req, query);
  const apps = await db.application.findMany({
    where: { driveId: id, status: "SHORTLISTED", ...(roundId ? { results: { some: { roundId, status: "CLEARED" } } } : {}) },
    select: { id: true, currentRound: true, clearedAllRounds: true, student: { select: { id: true, name: true, enrollmentNo: true, email: true, department: { select: { name: true } }, sections: { where: { section: "ACADEMICS", status: "VERIFIED" }, select: { data: true } } } } },
    orderBy: { student: { name: "asc" } },
  });
  return apps.map(({ student: { sections, department, ...st }, ...a }) => ({ ...a, student: { ...st, department: department.name, cgpa: (sections[0]?.data as { cgpa?: number } | undefined)?.cgpa ?? null } }));
});

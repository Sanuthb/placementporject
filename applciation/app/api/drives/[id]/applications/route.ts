import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody, parseQuery } from "@/lib/api/parse";
import { applyToDrive } from "@/lib/ops/apply";
import { getDrive } from "@/lib/drives";
import { listApplications } from "@/lib/applications";
import { ApplicationStatus } from "@/generated/prisma/client";

const query = z.object({ status: z.enum(ApplicationStatus).optional() });
const body = z.object({ studentId: z.uuid() });

export const GET = route<{ id: string }>({ module: "DRIVES" }, async (req, s, { id }) => {
  await getDrive(s.collegeId, id);
  return listApplications(s, id, parseQuery(req, query).status);
});

/** Staff applying on a student's behalf. The same eligibility and deadline rules apply as for the student. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const { studentId } = await parseBody(req, body);
  await getDrive(s.collegeId, id);
  return applyToDrive(s, id, studentId, "Applied on behalf of student");
});

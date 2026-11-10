import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { assertDriveRefs, checkDriveShape, createDriveSchema } from "@/lib/drives";
import { driveFromJd } from "@/lib/jd";
import { dataOf, jdOf } from "@/lib/jdService";

/**
 * Create a draft drive from an approved job description: role, type, location, salary, description, eligibility rules and selection rounds are filled in from it.
 * You give the company, the application deadline and the drive date. The drive stays linked: it cannot be published unless this job description is approved.
 */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const j = await jdOf(s.collegeId, id);
  if (j.status !== "APPROVED") throw badRequest("Only an approved job description can start a drive");
  if (j.driveId) throw badRequest("This job description already has a drive");
  const b = await parseBody(req, z.object({ companyId: z.uuid(), applicationDeadline: z.coerce.date(), driveDate: z.coerce.date(), venue: z.string().trim().max(200).optional() }));
  const { rounds, ...from } = driveFromJd(dataOf(j));
  const parsed = createDriveSchema.parse({ ...from, ...b, rounds: rounds.slice(0, 10) });
  const { rounds: rs, ...data } = parsed;
  checkDriveShape(data);
  await assertDriveRefs(s.collegeId, data);
  return db.$transaction(async (tx) => {
    const d = await tx.drive.create({ data: { ...data, collegeId: s.collegeId, createdById: s.userId, rounds: { create: rs.map((r, i) => ({ ...r, order: i + 1 })) } } });
    await tx.jobDescription.update({ where: { id }, data: { driveId: d.id, companyId: b.companyId } });
    await audit(s, { action: "drive.create", entity: "Drive", entityId: d.id, after: { fromJd: id, role: d.role } }, tx);
    return { driveId: d.id };
  });
});

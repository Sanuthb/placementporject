import { z } from "zod";
import { studentRoute } from "@/lib/api/studentHandler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyStaff } from "@/lib/notify";

const body = z.object({ field: z.enum(["name", "department", "programme", "branch", "batch", "admissionNumber", "admissionYear", "graduationYear", "campus", "email", "other"]), message: z.string().trim().min(5).max(500) });

/** The student cannot change what the institution assigned. They can ask for it to be corrected, and staff are told. */
export const POST = studentRoute({ module: "ONBOARDING", limit: { name: "correction-request", max: 20, windowSec: 3600 } }, async (req, me) => {
  const b = await parseBody(req, body);
  return db.$transaction(async (tx) => {
    const c = await tx.studentCorrectionRequest.create({ data: { collegeId: me.collegeId, studentId: me.studentId, ...b }, select: { id: true } });
    await notifyStaff(me.collegeId, { type: "student.correction", title: `${me.name} asked for a correction to their ${b.field}`, body: b.message, link: `/staff/students/${me.studentId}`, departmentId: me.departmentId }, tx);
    await audit({ collegeId: me.collegeId, userId: null }, { action: "student.correction.request", entity: "Student", entityId: me.studentId, after: b }, tx);
    return c;
  });
});

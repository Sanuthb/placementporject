import { db } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { ApplicationStatus } from "@/generated/prisma/client";

type Academics = { cgpa?: number };

/** Applicants with a profile summary. Only verified data is surfaced. Coordinators see their own department only. */
export async function listApplications(s: Session, driveId: string, status?: ApplicationStatus) {
  const rows = await db.application.findMany({
    where: { driveId, collegeId: s.collegeId, status, ...(s.role === "DEPARTMENT_COORDINATOR" ? { student: { departmentId: s.departmentId ?? "none" } } : {}) },
    select: {
      id: true, status: true, appliedAt: true,
      student: {
        select: {
          id: true, name: true, enrollmentNo: true, email: true, departmentId: true, batchId: true,
          sections: { where: { status: "VERIFIED", section: { in: ["ACADEMICS", "RESUME"] } }, select: { section: true, data: true } },
        },
      },
    },
    orderBy: [{ appliedAt: "asc" }, { id: "asc" }],
  });
  return rows.map(({ student: { sections, ...st }, ...a }) => ({
    ...a,
    student: { ...st, cgpa: (sections.find((x) => x.section === "ACADEMICS")?.data as Academics | undefined)?.cgpa ?? null, resume: sections.find((x) => x.section === "RESUME")?.data ?? null },
  }));
}

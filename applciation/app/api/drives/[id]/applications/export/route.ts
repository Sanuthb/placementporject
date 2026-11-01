import { route } from "@/lib/api/handler";
import { getDrive } from "@/lib/drives";
import { listApplications } from "@/lib/applications";
import { sheetResponse } from "@/lib/xlsx";

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  await getDrive(s.collegeId, id);
  const rows = await listApplications(s, id);
  return sheetResponse(`applicants-${id.slice(0, 8)}.xlsx`, ["enrollment_no", "name", "email", "cgpa", "status", "applied_at"], rows.map((r) => [r.student.enrollmentNo, r.student.name, r.student.email, r.student.cgpa, r.status, r.appliedAt.toISOString()]));
});

import { route } from "@/lib/api/handler";
import { evaluateEligibility } from "@/lib/eligibility";
import { getDrive } from "@/lib/drives";
import { sheetResponse } from "@/lib/xlsx";

export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (_req, s, { id }) => {
  const drive = await getDrive(s.collegeId, id);
  const rows = (await evaluateEligibility(drive)).filter((r) => r.eligible);
  return sheetResponse(`eligible-${id.slice(0, 8)}.xlsx`, ["enrollment_no", "name", "via_exception"], rows.map((r) => [r.enrollmentNo, r.name, r.viaException ? "yes" : "no"]));
});

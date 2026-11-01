import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseQuery } from "@/lib/api/parse";
import { attendanceSummary, loadScope } from "@/lib/attendance";

const query = z.object({ roundId: z.uuid().optional(), detail: z.enum(["true", "false"]).default("false") });

/** Live counts (expected, present, absent, not yet marked) for a drive or one of its rounds. */
export const GET = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ATTENDANCE_BLOCKING" }, async (req, s, { id }) => {
  const q = parseQuery(req, query);
  const { round } = await loadScope(s.collegeId, id, q.roundId);
  return attendanceSummary(s.collegeId, id, round, q.detail === "true");
});

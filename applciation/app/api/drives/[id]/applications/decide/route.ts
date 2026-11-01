import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { getDrive } from "@/lib/drives";
import { gate } from "@/lib/approvals";
import { decideApplications } from "@/lib/ops/applications";

const body = z.object({ applicationIds: z.array(z.uuid()).min(1).max(500), status: z.enum(["SHORTLISTED", "ON_HOLD", "REJECTED"]), note: z.string().trim().max(500).optional() });

/** Shortlist, hold or reject applicants. Changing more than one at once is a bulk status change and may need approval. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => {
  const input = await parseBody(req, body);
  const drive = await getDrive(s.collegeId, id);
  const run = () => decideApplications(s, id, input);
  if (input.applicationIds.length < 2) return run();
  return gate(s, "BULK_STATUS_CHANGE", `Mark ${input.applicationIds.length} applicants as ${input.status} for "${drive.role}"`, { kind: "applications", driveId: id, input }, run);
});

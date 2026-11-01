import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { getDrive } from "@/lib/drives";
import { gate } from "@/lib/approvals";
import { recordRoundResults } from "@/lib/ops/roundResults";
import { RoundResultStatus } from "@/generated/prisma/client";

const body = z.object({ results: z.array(z.object({ applicationId: z.uuid(), status: z.enum(RoundResultStatus), score: z.number().optional(), remarks: z.string().trim().max(500).optional() })).min(1).max(500) });

/** Marks applicants attended, absent, cleared or rejected for a round. More than one result at once is a bulk status change. */
export const POST = route<{ id: string; roundId: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id, roundId }) => {
  const { results } = await parseBody(req, body);
  const drive = await getDrive(s.collegeId, id);
  const run = () => recordRoundResults(s, id, roundId, results);
  if (results.length < 2) return run();
  return gate(s, "BULK_STATUS_CHANGE", `Record ${results.length} round results for "${drive.role}"`, { kind: "results", driveId: id, roundId, results }, run);
});

import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { respondToOffer } from "@/lib/ops/offers";

const body = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) });

/** Records the student's decision on their behalf. Accepting marks the student as placed automatically. */
export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => respondToOffer(s, id, (await parseBody(req, body)).decision));

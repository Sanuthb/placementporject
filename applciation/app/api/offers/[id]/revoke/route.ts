import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { revokeOffer } from "@/lib/ops/offers";

const body = z.object({ reason: z.string().trim().min(3).max(500) });

export const POST = route<{ id: string }>({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "DRIVES" }, async (req, s, { id }) => revokeOffer(s, id, (await parseBody(req, body)).reason));

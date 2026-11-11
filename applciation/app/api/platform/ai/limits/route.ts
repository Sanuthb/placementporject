import { z } from "zod";
import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { ApiError } from "@/lib/api/errors";
import { MAX_LIMIT, listLimits, setLimitAudited, validKey, type LimitKind } from "@/lib/ai/limits";
import { auditBase } from "@/lib/ai/admin";

const body = z.object({
  kind: z.enum(["COLLEGE_DEFAULT", "COLLEGE", "PROVIDER", "PURPOSE"]),
  key: z.string().trim().min(1).max(64),
  /** null removes the limit (no limit applies). 0 blocks every call in the scope. */
  dailyCalls: z.number().int().min(0).max(MAX_LIMIT).nullable(),
}).strict();

export const GET = platformRoute({}, async () => ({ limits: await listLimits(), max: MAX_LIMIT }));

/** Sets or removes one daily limit. Audited in the same transaction as the change; rate limited like the other AI configuration writes. */
export const PUT = platformRoute({ limit: { name: "ai-config-write", max: 60, windowSec: 600 } }, async (req, admin) => {
  const b = await parseBody(req, body);
  if (!validKey(b.kind, b.key)) throw new ApiError(422, "VALIDATION", "That key does not match the kind of limit");
  const out = await setLimitAudited({ kind: b.kind as LimitKind, key: b.key, dailyCalls: b.dailyCalls, adminId: admin.adminId },
    (before, after) => [{ ...auditBase(admin, req), action: after === null ? "ai.limit.remove" : "ai.limit.set", detail: { kind: b.kind, key: b.key, before, after } }]);
  return { limit: { kind: b.kind, key: b.key, ...out } };
});

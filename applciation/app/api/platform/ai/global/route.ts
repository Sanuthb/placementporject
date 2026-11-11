import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { auditForGlobal, globalBody } from "@/lib/ai/admin";
import { setGlobalAudited } from "@/lib/ai/store";

/** The global AI kill switch. Off switches every AI feature off at once (no fallback to the environment). The change and its audit record are one transaction. */
export const PUT = platformRoute({ limit: { name: "ai-config-write", max: 60, windowSec: 600 } }, async (req, admin) => {
  const b = await parseBody(req, globalBody);
  const { after } = await setGlobalAudited(b.enabled, admin.adminId, b.reason, (before, now) => auditForGlobal(admin, req, before, now));
  return { global: after };
});

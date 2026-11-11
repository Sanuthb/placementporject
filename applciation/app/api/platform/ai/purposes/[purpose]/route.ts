import { platformRoute } from "@/lib/api/platformHandler";
import { ApiError, badRequest } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { AiKeyError, VALID_SECRET, loadMasterKeys } from "@/lib/ai/crypto";
import { SUPPORTED_PROVIDER } from "@/lib/ai/config";
import { auditForReset, auditForSave, parsePurpose, putBody } from "@/lib/ai/admin";
import { AiConfigInputError, deleteConfigAudited, saveConfigAudited } from "@/lib/ai/store";

/**
 * Configure one purpose (TEXT, VISION or INTERVIEW): model, on/off, and the API key (write-only). The provider is fixed per purpose; asking for another is refused (422).
 * The key is encrypted before it is stored and is never returned: the answer carries only the last four characters. The change and its audit rows are one transaction.
 */
export const PUT = platformRoute<{ purpose: string }>({ limit: { name: "ai-config-write", max: 60, windowSec: 600 } }, async (req, admin, { purpose: raw }) => {
  const purpose = parsePurpose(raw);
  const b = await parseBody(req, putBody);
  const provider = SUPPORTED_PROVIDER[purpose];
  if (b.provider && b.provider !== provider) throw new ApiError(422, "UNSUPPORTED_PROVIDER", `${purpose} can only use ${provider} in this version`);
  if (typeof b.apiKey === "string" && !VALID_SECRET.test(b.apiKey)) throw badRequest("The API key is not valid: it must be 8 to 512 characters with no spaces");
  const keyAction = typeof b.apiKey === "string" ? "replace" : b.apiKey === null ? "remove" : null;
  try {
    const { after } = await saveConfigAudited(
      { purpose, provider, model: b.model, enabled: b.enabled, apiKey: b.apiKey, adminId: admin.adminId }, loadMasterKeys(),
      (before, now) => auditForSave(admin, req, purpose, keyAction, before, now),
      (before) => { if (b.expectedUpdatedAt !== undefined && (before?.updatedAt.toISOString() ?? "") !== b.expectedUpdatedAt) throw new ApiError(409, "CONFLICT", "This configuration was changed by someone else. Reload the page and try again"); },
    );
    return { config: after };
  } catch (e) {
    if (e instanceof AiConfigInputError) throw badRequest(e.message);
    if (e instanceof AiKeyError) {
      if (e.code === "NO_ACTIVE_KEY") throw new ApiError(409, "MASTER_KEY_REQUIRED", "API keys cannot be stored until a master key is configured on the server (AI_MASTER_KEY_V<n> and AI_MASTER_KEY_ACTIVE)");
      if (e.code === "INVALID_SECRET") throw badRequest("The API key is not valid: it must be 8 to 512 characters with no spaces");
      throw new ApiError(503, "MASTER_KEY_INVALID", "The server's AI master key settings are invalid");
    }
    throw e;
  }
});

/** Removes the stored configuration of a purpose: it returns to the environment variables and the defaults. */
export const DELETE = platformRoute<{ purpose: string }>({ limit: { name: "ai-config-write", max: 60, windowSec: 600 } }, async (req, admin, { purpose: raw }) => {
  const purpose = parsePurpose(raw);
  const removed = await deleteConfigAudited(purpose, (before) => auditForReset(admin, req, purpose, before));
  return { removed: !!removed };
});

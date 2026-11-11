import { platformRoute } from "@/lib/api/platformHandler";
import { ApiError } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/parse";
import { resolveAi, SUPPORTED_PROVIDER } from "@/lib/ai/config";
import { parsePurpose, testBody } from "@/lib/ai/admin";
import { listProviderModels } from "@/lib/ai/probe";
import { platformAudit } from "@/lib/platformAudit";

/**
 * Checks a purpose's key and model WITHOUT any paid call: it only lists the models the key can use. By default it tests what the purpose would use now (stored key, else environment);
 * a key typed into the form can be tested before it is saved (it is used for this one request and never stored or logged).
 */
export const POST = platformRoute<{ purpose: string }>({ limit: { name: "ai-config-test", max: 12, windowSec: 600 } }, async (req, admin, { purpose: raw }) => {
  const purpose = parsePurpose(raw);
  const b = await parseBody(req, testBody);
  const r = await resolveAi(purpose);
  const key = b.apiKey ?? r.apiKey?.reveal();
  if (!key) throw new ApiError(409, "NO_KEY", "There is no key to test for this purpose");
  const res = await listProviderModels(SUPPORTED_PROVIDER[purpose], key, r.baseUrl);
  await platformAudit({ adminId: admin.adminId, email: admin.email, req, action: "ai.provider.test", detail: { purpose, provider: SUPPORTED_PROVIDER[purpose], model: r.model, usedTypedKey: b.apiKey !== undefined, ok: res.ok, reason: res.reason } });
  return { ok: res.ok, reason: res.reason, status: res.status, ms: res.ms, model: r.model, modelListed: res.ok ? res.models.includes(r.model) : null, modelCount: res.models.length };
});

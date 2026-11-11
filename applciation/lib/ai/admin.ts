import type { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { clientIp } from "@/lib/rateLimit";
import type { PlatformSession } from "@/lib/auth/platform";
import { AiKeyError, loadMasterKeys, masterKeyInfo } from "@/lib/ai/crypto";
import { DEFAULTS, PURPOSES, SUPPORTED_PROVIDER, describeResolved, resolveAi, type Purpose } from "@/lib/ai/config";
import { getGlobal, listConfigs, VALID_MODEL, type AuditData, type PublicConfig } from "@/lib/ai/store";

/** Shared pieces of the platform AI administration API (Phase 4.4.4). Nothing here ever returns, logs or audits a key or ciphertext. */
export const purposeParam = z.enum(["TEXT", "VISION", "INTERVIEW"]);
export const parsePurpose = (p: string): Purpose => { const r = purposeParam.safeParse(p); if (!r.success) throw new ApiError(404, "NOT_FOUND", "Unknown AI purpose"); return r.data; };

export const putBody = z.object({
  model: z.string().trim().regex(VALID_MODEL, "The model name is not valid"),
  enabled: z.boolean().optional(),
  /** A new key (write-only), null to remove the stored key, absent to leave it. Validated by hand so a rejected key is never echoed in an error. */
  apiKey: z.union([z.string().max(4096), z.null()]).optional(),
  /** Only the provider that purpose's call path can serve is accepted. */
  provider: z.enum(["GROQ", "ANTHROPIC"]).optional(),
  /** The `updatedAt` the editor was looking at; a different value means someone else changed it meanwhile (409). */
  expectedUpdatedAt: z.string().max(40).optional(),
}).strict();
export const globalBody = z.object({ enabled: z.boolean(), reason: z.string().trim().max(300).nullable().optional() }).strict();
export const testBody = z.object({ apiKey: z.string().max(4096).optional() }).strict();

/** The masked, safe view of everything the page needs. */
export async function overview() {
  const [rows, global] = await Promise.all([listConfigs(), getGlobal()]);
  let mk: ReturnType<typeof masterKeyInfo> | null = null, mkProblem: string | null = null;
  try { mk = masterKeyInfo(loadMasterKeys()); } catch (e) { mkProblem = e instanceof AiKeyError ? e.code : "ERROR"; }
  const purposes = await Promise.all(PURPOSES.map(async (p) => {
    let effective: ReturnType<typeof describeResolved> | null = null, problem: string | null = null;
    try { effective = describeResolved(await resolveAi(p)); } catch (e) { problem = (e as { code?: string })?.code ?? "ERROR"; }
    return { purpose: p, supportedProvider: SUPPORTED_PROVIDER[p], default: DEFAULTS[p], stored: rows.find((r) => r.purpose === p) ?? null, effective, problem, modelSuggestions: [DEFAULTS[p].model] };
  }));
  const warnings: string[] = [];
  if (!mk || mk.active === null) warnings.push(mkProblem ? "The AI master key settings are invalid: keys cannot be stored until they are fixed." : "No master key is configured: API keys cannot be stored here until AI_MASTER_KEY_V<n> and AI_MASTER_KEY_ACTIVE are set on the server. Environment keys still work.");
  if (!global.enabled) warnings.push("All AI features are switched OFF by the global switch.");
  for (const p of purposes) {
    if (p.problem === "AI_CONFIG_UNAVAILABLE") warnings.push(`${p.purpose}: the configuration cannot be read right now.`);
    if (p.problem === "AI_KEY_UNREADABLE") warnings.push(`${p.purpose}: the stored key cannot be read (wrong or missing master key, or the row was altered). The feature is refused until the key is replaced.`);
    if (p.effective?.stale) warnings.push(`${p.purpose}: showing the last known configuration because the database could not be read.`);
    if (p.stored && p.stored.provider !== p.supportedProvider) warnings.push(`${p.purpose}: stored for ${p.stored.provider}, which this feature cannot use. It is refused until reset.`);
  }
  return { global, masterKey: { configured: !!mk && mk.active !== null, active: mk?.active ?? null, versions: mk?.versions ?? [], problem: mkProblem }, purposes, warnings };
}

export type Actor = Pick<PlatformSession, "adminId" | "email">;
const base = (a: Actor, req: NextRequest) => ({ adminId: a.adminId, email: a.email, ip: clientIp(req) });
const pub = (c: PublicConfig | null) => (c ? { provider: c.provider, model: c.model, enabled: c.enabled, keyConfigured: c.keyConfigured, keyLast4: c.keyLast4, keyVersion: c.keyVersion } : null);

/** The audit rows for one save: one row per kind of change, each with before and after in masked form (last four characters of a key only). */
export function auditForSave(a: Actor, req: NextRequest, purpose: Purpose, keyAction: "replace" | "remove" | null, before: PublicConfig | null, after: PublicConfig): AuditData[] {
  const out: AuditData[] = [];
  const ctx = { purpose, before: pub(before), after: pub(after) };
  if (!before || before.model !== after.model || before.provider !== after.provider) out.push({ ...base(a, req), action: "ai.model.change", detail: ctx });
  if (keyAction === "replace") out.push({ ...base(a, req), action: "ai.key.replace", detail: { purpose, provider: after.provider, keyLast4: after.keyLast4, keyVersion: after.keyVersion } });
  if (keyAction === "remove") out.push({ ...base(a, req), action: "ai.key.remove", detail: { purpose, provider: after.provider } });
  if ((before?.enabled ?? true) !== after.enabled) out.push({ ...base(a, req), action: after.enabled ? "ai.purpose.enable" : "ai.purpose.disable", detail: { purpose } });
  if (!out.length) out.push({ ...base(a, req), action: "ai.config.save", detail: ctx }); // saved with nothing different: still recorded
  return out;
}
export const auditForReset = (a: Actor, req: NextRequest, purpose: Purpose, before: PublicConfig): AuditData[] => [{ ...base(a, req), action: "ai.config.reset", detail: { purpose, removed: pub(before) } }];
export const auditForGlobal = (a: Actor, req: NextRequest, before: { enabled: boolean }, after: { enabled: boolean; reason: string | null }): AuditData[] => [{ ...base(a, req), action: after.enabled ? "ai.global.enable" : "ai.global.disable", detail: { before: before.enabled, after: after.enabled, reason: after.reason } }];
export const auditBase = base;

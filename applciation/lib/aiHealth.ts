import { PURPOSES, SUPPORTED_PROVIDER, resolveAi, type Purpose, type Provider } from "@/lib/ai/config";
import { listProviderModels } from "@/lib/ai/probe";
import { consumption, dayOf } from "@/lib/ai/limits";
import { db } from "@/lib/db";

/**
 * What the platform health check needs to know about AI (Phase 4.4.5): the effective configuration per purpose as the resolver sees it (database first, then environment), the
 * switches, whether a stored key can be read, whether the configuration is stale, one free model-list check per provider in use (never a paid request), and today's usage.
 * Nothing here holds a key beyond the moment of the probe; the result is safe to show an administrator (no key, ciphertext, prompt or person).
 */
export type AiHealthPurpose = { purpose: Purpose; provider: Provider; model: string; enabled: boolean; disabledBy: "global" | "purpose" | null; configured: boolean; source: string; keyLast4: string | null; stale: boolean; error: string | null };
export type AiHealthProbe = { provider: Provider; ok: boolean; reason: string; ms: number } | null;
export type AiHealthCfg = {
  purposes: AiHealthPurpose[];
  probes: Partial<Record<Provider, AiHealthProbe>>;
  usage: { available: boolean; callsToday: number; failuresToday: number; blockedToday: number; nearLimit: { scope: string; used: number; limit: number }[] };
};

export async function loadAiHealth(probeMs = 4000): Promise<AiHealthCfg> {
  const purposes: AiHealthPurpose[] = [];
  const keys: Partial<Record<Provider, { key: string; base: string | null }>> = {};
  for (const p of PURPOSES) {
    try {
      const r = await resolveAi(p);
      purposes.push({ purpose: p, provider: r.provider, model: r.model, enabled: r.enabled, disabledBy: r.disabledBy, configured: r.configured, source: r.source.key, keyLast4: r.keyLast4, stale: r.stale, error: null });
      if (r.enabled && r.apiKey && !keys[r.provider]) keys[r.provider] = { key: r.apiKey.reveal(), base: r.baseUrl };
    } catch (e) {
      purposes.push({ purpose: p, provider: SUPPORTED_PROVIDER[p], model: "", enabled: true, disabledBy: null, configured: false, source: "none", keyLast4: null, stale: false, error: (e as { code?: string })?.code ?? "AI_CONFIG_UNAVAILABLE" });
    }
  }
  const probes: AiHealthCfg["probes"] = {};
  await Promise.all((Object.keys(keys) as Provider[]).map(async (pv) => {
    const r = await listProviderModels(pv, keys[pv]!.key, keys[pv]!.base, probeMs);
    probes[pv] = { provider: pv, ok: r.ok, reason: r.reason, ms: r.ms };
  }));
  let usage: AiHealthCfg["usage"] = { available: false, callsToday: 0, failuresToday: 0, blockedToday: 0, nearLimit: [] };
  try {
    const day = new Date(`${dayOf()}T00:00:00Z`);
    const [t, c] = await Promise.all([db.aiUsageDaily.aggregate({ where: { day }, _sum: { calls: true, failures: true, blocked: true } }), consumption()]);
    usage = { available: true, callsToday: t._sum.calls ?? 0, failuresToday: t._sum.failures ?? 0, blockedToday: t._sum.blocked ?? 0, nearLimit: c.filter((x) => x.limit !== null && x.limit > 0 && x.used / x.limit >= 0.8).map((x) => ({ scope: x.scope, used: x.used, limit: x.limit! })).slice(0, 10) };
  } catch { /* usage unavailable: reported as such */ }
  return { purposes, probes, usage };
}

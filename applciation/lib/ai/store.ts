import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { AiKeyError, VALID_SECRET, encryptSecret, envelopeVersion, last4Of, loadMasterKeys, type MasterKeys } from "@/lib/ai/crypto";
import { PROVIDERS, PURPOSES, invalidateAiConfigCache, type Provider, type Purpose } from "@/lib/ai/config";
import type { RotationStore } from "@/lib/ai/rotate";

/**
 * Database access for AiProviderConfig: the only code that writes an encrypted key. Phase 4.4.2 provides it and tests it; the routes and the page that call it come in 4.4.4
 * (and audit logging with them). Nothing here ever returns, logs or throws the key or the ciphertext: `PublicConfig` is the only shape that leaves this module.
 */
export type PublicConfig = {
  purpose: Purpose; provider: Provider; model: string; enabled: boolean;
  keyConfigured: boolean; keyLast4: string | null; keyVersion: number | null; keyUpdatedAt: Date | null; updatedAt: Date;
};

type Row = { id: string; purpose: Purpose; provider: Provider; model: string; enabled: boolean; keyCiphertext: string | null; keyVersion: number | null; keyLast4: string | null; keyUpdatedAt: Date | null; updatedAt: Date };
/** The ONLY projection to the outside: no ciphertext, no id. */
export const toPublic = (r: Row): PublicConfig => ({ purpose: r.purpose, provider: r.provider, model: r.model, enabled: r.enabled, keyConfigured: !!r.keyCiphertext, keyLast4: r.keyLast4, keyVersion: r.keyVersion, keyUpdatedAt: r.keyUpdatedAt, updatedAt: r.updatedAt });

export class AiConfigInputError extends Error { constructor(message: string) { super(message); this.name = "AiConfigInputError"; } }
export const VALID_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

export type SaveInput = {
  purpose: Purpose; provider: Provider; model: string; enabled?: boolean;
  /** A new key to store (encrypted). undefined: leave the stored key as it is (cleared automatically if the provider changes: a key is only ever sent to the provider it was entered for). null: remove the stored key. */
  apiKey?: string | null;
  adminId?: string | null;
};

export async function listConfigs(): Promise<PublicConfig[]> {
  return (await db.aiProviderConfig.findMany({ orderBy: { purpose: "asc" } })).map((r) => toPublic(r as Row));
}

type Db = Prisma.TransactionClient | typeof db;
/** One audit row for the platform trail, written in the SAME transaction as the change it describes (so a change can never exist without its audit record). Never holds a key. */
export type AuditData = { adminId?: string | null; email?: string | null; action: string; detail?: Prisma.InputJsonValue; ip?: string | null };

function validate(i: SaveInput) {
  if (!PURPOSES.includes(i.purpose)) throw new AiConfigInputError("Unknown purpose");
  if (!PROVIDERS.includes(i.provider)) throw new AiConfigInputError("Unknown provider");
  if (!VALID_MODEL.test(i.model)) throw new AiConfigInputError("The model name is not valid");
  if (typeof i.apiKey === "string" && !VALID_SECRET.test(i.apiKey)) throw new AiKeyError("INVALID_SECRET", "An API key must be 8 to 512 printable characters with no spaces");
}

/** The change itself, against `client` (the database or a transaction). Does not retry. */
async function applySave(client: Db, i: SaveInput, mk: MasterKeys): Promise<{ before: Row | null; row: Row }> {
  const existing = (await client.aiProviderConfig.findUnique({ where: { purpose: i.purpose } })) as Row | null;
  const id = existing?.id ?? randomUUID();
  const providerChanged = !!existing && existing.provider !== i.provider;
  let key: { keyCiphertext: string | null; keyVersion: number | null; keyLast4: string | null; keyUpdatedAt: Date | null; keyUpdatedBy: string | null } | null = null;
  if (typeof i.apiKey === "string") {
    const e = encryptSecret(i.apiKey, { id, purpose: i.purpose, provider: i.provider }, mk);
    key = { keyCiphertext: e.envelope, keyVersion: e.version, keyLast4: last4Of(i.apiKey), keyUpdatedAt: new Date(), keyUpdatedBy: i.adminId ?? null };
  } else if (i.apiKey === null || providerChanged) {
    key = { keyCiphertext: null, keyVersion: null, keyLast4: null, keyUpdatedAt: existing?.keyCiphertext ? new Date() : (existing?.keyUpdatedAt ?? null), keyUpdatedBy: i.adminId ?? null };
  }
  const data = { provider: i.provider, model: i.model, enabled: i.enabled ?? existing?.enabled ?? true, updatedBy: i.adminId ?? null, ...(key ?? {}) };
  const row = existing ? await client.aiProviderConfig.update({ where: { id: existing.id }, data }) : await client.aiProviderConfig.create({ data: { id, purpose: i.purpose, ...data } });
  return { before: existing, row: row as Row };
}
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Creates or updates the configuration of one purpose. Throws AiConfigInputError for bad input and AiKeyError if the key cannot be encrypted. */
export async function saveConfig(i: SaveInput, mk: MasterKeys = loadMasterKeys()): Promise<PublicConfig> {
  validate(i);
  for (let attempt = 0; ; attempt++) {
    try { const r = await applySave(db, i, mk); invalidateAiConfigCache(i.purpose); return toPublic(r.row); }
    catch (e) { if (attempt === 0 && isUnique(e)) continue; throw e; } // two administrators creating the same purpose at once: the loser retries as an update
  }
}

/** The same, with its audit rows written in the same transaction. `audit` receives the row before and after (public shapes) and returns the rows to write. */
export async function saveConfigAudited(i: SaveInput, mk: MasterKeys, audit: (before: PublicConfig | null, after: PublicConfig) => AuditData[], guard?: (before: PublicConfig | null) => void): Promise<{ before: PublicConfig | null; after: PublicConfig }> {
  validate(i);
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await db.$transaction(async (tx) => {
        const r = await applySave(tx, i, mk);
        const before = r.before ? toPublic(r.before) : null, after = toPublic(r.row);
        guard?.(before); // for example a stale-edit check; throwing here rolls the change back
        for (const a of audit(before, after)) await tx.platformAuditLog.create({ data: { adminId: a.adminId ?? null, email: a.email ?? null, action: a.action, detail: a.detail, ip: a.ip ?? null } });
        return { before, after };
      });
      invalidateAiConfigCache(i.purpose);
      return out;
    } catch (e) { if (attempt === 0 && isUnique(e)) continue; throw e; }
  }
}

/** Removes a purpose's configuration (it returns to the environment) and audits it in the same transaction. Returns what was removed, or null. */
export async function deleteConfigAudited(purpose: Purpose, audit: (before: PublicConfig) => AuditData[]): Promise<PublicConfig | null> {
  const out = await db.$transaction(async (tx) => {
    const row = (await tx.aiProviderConfig.findUnique({ where: { purpose } })) as Row | null;
    if (!row) return null;
    await tx.aiProviderConfig.delete({ where: { id: row.id } });
    const before = toPublic(row);
    for (const a of audit(before)) await tx.platformAuditLog.create({ data: { adminId: a.adminId ?? null, email: a.email ?? null, action: a.action, detail: a.detail, ip: a.ip ?? null } });
    return before;
  });
  invalidateAiConfigCache(purpose);
  return out;
}

/** The global kill switch, audited in the same transaction. */
export async function setGlobalAudited(enabled: boolean, adminId: string | null, reason: string | null | undefined, audit: (before: PublicGlobal, after: PublicGlobal) => AuditData[]): Promise<{ before: PublicGlobal; after: PublicGlobal }> {
  const r = reason?.trim() ? reason.trim().slice(0, 300) : null;
  const out = await db.$transaction(async (tx) => {
    const g0 = await tx.aiGlobalSetting.findUnique({ where: { id: "global" } });
    const before = { enabled: g0?.enabled ?? true, reason: g0?.reason ?? null, updatedAt: g0?.updatedAt ?? null };
    const g = await tx.aiGlobalSetting.upsert({ where: { id: "global" }, create: { id: "global", enabled, reason: r, updatedBy: adminId }, update: { enabled, reason: r, updatedBy: adminId } });
    const after = { enabled: g.enabled, reason: g.reason, updatedAt: g.updatedAt };
    for (const a of audit(before, after)) await tx.platformAuditLog.create({ data: { adminId: a.adminId ?? null, email: a.email ?? null, action: a.action, detail: a.detail, ip: a.ip ?? null } });
    return { before, after };
  });
  invalidateAiConfigCache("GLOBAL");
  return out;
}

/** The per-purpose kill switch. Returns null if the purpose has no configuration row (nothing to switch: it follows the environment). */
export async function setEnabled(purpose: Purpose, enabled: boolean, adminId?: string | null): Promise<PublicConfig | null> {
  const r = await db.aiProviderConfig.updateMany({ where: { purpose }, data: { enabled, updatedBy: adminId ?? null } });
  invalidateAiConfigCache(purpose);
  if (!r.count) return null;
  return toPublic((await db.aiProviderConfig.findUniqueOrThrow({ where: { purpose } })) as Row);
}

export type PublicGlobal = { enabled: boolean; reason: string | null; updatedAt: Date | null };
/** The platform-wide kill switch. No row means on. */
export async function getGlobal(): Promise<PublicGlobal> {
  const g = await db.aiGlobalSetting.findUnique({ where: { id: "global" } });
  return { enabled: g?.enabled ?? true, reason: g?.reason ?? null, updatedAt: g?.updatedAt ?? null };
}
/** Switches ALL AI features off (or on again). The reason is free text for administrators (at most 300 characters, never a credential). */
export async function setGlobalEnabled(enabled: boolean, adminId?: string | null, reason?: string | null): Promise<PublicGlobal> {
  const r = reason?.trim() ? reason.trim().slice(0, 300) : null;
  const g = await db.aiGlobalSetting.upsert({ where: { id: "global" }, create: { id: "global", enabled, reason: r, updatedBy: adminId ?? null }, update: { enabled, reason: r, updatedBy: adminId ?? null } });
  invalidateAiConfigCache("GLOBAL");
  return { enabled: g.enabled, reason: g.reason, updatedAt: g.updatedAt };
}

/** Removes the stored configuration of a purpose: it returns to the environment variables and the defaults. */
export async function deleteConfig(purpose: Purpose): Promise<boolean> {
  const r = await db.aiProviderConfig.deleteMany({ where: { purpose } });
  invalidateAiConfigCache(purpose);
  return r.count > 0;
}

/** How many stored keys use each master-key version, for rotation progress and for knowing when an old master key may be retired. Reads no ciphertext. */
export async function keyVersionCounts(): Promise<Record<string, number>> {
  const g = await db.aiProviderConfig.groupBy({ by: ["keyVersion"], where: { keyCiphertext: { not: null } }, _count: { _all: true } });
  return Object.fromEntries(g.map((x) => [String(x.keyVersion ?? "unknown"), x._count._all]));
}

/** The database side of master-key rotation: stable paging by id and a compare-and-set update, so a concurrent change is never overwritten. */
export const dbRotationStore: RotationStore = {
  async listBatch(afterId, limit) {
    const rows = await db.aiProviderConfig.findMany({ where: { keyCiphertext: { not: null }, ...(afterId ? { id: { gt: afterId } } : {}) }, orderBy: { id: "asc" }, take: limit, select: { id: true, purpose: true, provider: true, keyCiphertext: true } });
    return rows.map((r) => ({ id: r.id, purpose: r.purpose, provider: r.provider, keyCiphertext: r.keyCiphertext! }));
  },
  async compareAndSet(id, oldCipher, newCipher, newVersion) {
    const r = await db.aiProviderConfig.updateMany({ where: { id, keyCiphertext: oldCipher }, data: { keyCiphertext: newCipher, keyVersion: newVersion } });
    invalidateAiConfigCache();
    return r.count === 1;
  },
};
export { envelopeVersion };

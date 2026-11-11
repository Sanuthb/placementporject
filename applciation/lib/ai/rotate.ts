import { AiKeyError, envelopeVersion, reencrypt, type AiKeyErrorCode, type MasterKeys } from "@/lib/ai/crypto";

/**
 * Master-key rotation (Phase 4.4.2). Procedure (docs/AI_CONFIG.md):
 *   1. add the NEW master key as AI_MASTER_KEY_V<n+1> and keep the old one; deploy.
 *   2. set AI_MASTER_KEY_ACTIVE=<n+1>; from now on new and changed keys use it. Old keys still decrypt with their own version.
 *   3. run `npm run ai:rotate-keys -- --dry-run`, then `npm run ai:rotate-keys`: every stored key is re-encrypted under the new version.
 *   4. when `keyVersionCounts` shows no key left on the old version, the old master key may be removed.
 *
 * Safety properties (each is tested):
 *  - nothing is written until the target version's key is confirmed present; a row is changed only after the re-encrypted value has been decrypted again and compared with the original plaintext;
 *  - the write is a compare-and-set against the exact ciphertext that was read, so a key an administrator saved meanwhile is never overwritten (counted as a conflict, not lost);
 *  - one bad row (tampered, or encrypted with a master key that is no longer available) is reported by id and purpose and skipped; the other rows are still rotated;
 *  - repeatable and resumable: rows already on the target version are skipped, so an interrupted or repeated run changes nothing twice;
 *  - plaintext exists only in zero-filled buffers; the report contains ids, purposes and error codes, never keys or ciphertext.
 */
export type RotationRow = { id: string; purpose: string; provider: string; keyCiphertext: string };
export type RotationStore = {
  /** Rows that have a stored key, in id order, after `afterId`. */
  listBatch(afterId: string | null, limit: number): Promise<RotationRow[]>;
  /** Replace oldCipher by newCipher (and set the version) only if the row still holds oldCipher. True if it did. */
  compareAndSet(id: string, oldCipher: string, newCipher: string, newVersion: number): Promise<boolean>;
};
export type RotationReport = {
  target: number; dryRun: boolean; scanned: number; rotated: number; wouldRotate: number; alreadyCurrent: number; conflicts: number;
  failed: { id: string; purpose: string; code: AiKeyErrorCode | "ERROR" }[];
};

export async function rotateAiKeys(o: { store: RotationStore; masterKeys: MasterKeys; target?: number; dryRun?: boolean; batchSize?: number }): Promise<RotationReport> {
  const target = o.target ?? o.masterKeys.active;
  if (target === null || target === undefined) throw new AiKeyError("NO_ACTIVE_KEY", "No target master key version: set AI_MASTER_KEY_ACTIVE or pass --to");
  if (!o.masterKeys.keys.has(target)) throw new AiKeyError("MASTER_KEY_MISSING", `Master key version ${target} is not available (set AI_MASTER_KEY_V${target}); nothing was changed`);
  const dryRun = !!o.dryRun, batch = Math.max(1, Math.min(500, o.batchSize ?? 50));
  const rep: RotationReport = { target, dryRun, scanned: 0, rotated: 0, wouldRotate: 0, alreadyCurrent: 0, conflicts: 0, failed: [] };
  let after: string | null = null;
  for (;;) {
    const rows = await o.store.listBatch(after, batch);
    if (!rows.length) break;
    for (const r of rows) {
      rep.scanned++;
      if (envelopeVersion(r.keyCiphertext) === target) { rep.alreadyCurrent++; continue; }
      let next: string;
      try { next = reencrypt(r.keyCiphertext, { id: r.id, purpose: r.purpose, provider: r.provider }, o.masterKeys, target); }
      catch (e) { rep.failed.push({ id: r.id, purpose: r.purpose, code: e instanceof AiKeyError ? e.code : "ERROR" }); continue; }
      if (dryRun) { rep.wouldRotate++; continue; }
      if (await o.store.compareAndSet(r.id, r.keyCiphertext, next, target)) rep.rotated++; else rep.conflicts++;
    }
    after = rows[rows.length - 1].id;
    if (rows.length < batch) break;
  }
  return rep;
}

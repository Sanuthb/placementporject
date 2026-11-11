/**
 * Re-encrypts every stored AI provider key under a newer master key.   npm run ai:rotate-keys -- --dry-run     then     npm run ai:rotate-keys
 * Options: --to <version> (default AI_MASTER_KEY_ACTIVE), --dry-run (decrypt and re-encrypt in memory, change nothing), --batch <n>.
 * Guarded: runs only against the isolated local stack unless ALLOW_REMOTE_DB is set deliberately. Prints versions, counts, row ids and error codes; never keys or ciphertext.
 * Exit code 1 if any row failed or was changed by someone else during the run (run it again), 2 if the target master key is unavailable.
 */
import { loadEnvFiles } from "./lib/envFiles";
import { assertLocalTargets } from "../lib/localOnly";

loadEnvFiles();
assertLocalTargets(process.env, { what: "rotate AI keys" });

async function main() {
  const args = process.argv.slice(2);
  const val = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const { loadMasterKeys, masterKeyInfo, AiKeyError } = await import("../lib/ai/crypto");
  const { rotateAiKeys } = await import("../lib/ai/rotate");
  const { dbRotationStore, keyVersionCounts } = await import("../lib/ai/store");
  const mk = loadMasterKeys();
  console.log("master keys:", JSON.stringify(masterKeyInfo(mk)));
  console.log("stored keys per master-key version (before):", JSON.stringify(await keyVersionCounts()));
  try {
    const rep = await rotateAiKeys({ store: dbRotationStore, masterKeys: mk, target: val("--to") ? Number(val("--to")) : undefined, dryRun: args.includes("--dry-run"), batchSize: val("--batch") ? Number(val("--batch")) : undefined });
    console.log("report:", JSON.stringify(rep));
    console.log("stored keys per master-key version (after):", JSON.stringify(await keyVersionCounts()));
    process.exit(rep.failed.length || rep.conflicts ? 1 : 0);
  } catch (e) {
    console.error(e instanceof AiKeyError ? `${e.code}: ${e.message}` : "rotation failed");
    process.exit(e instanceof AiKeyError ? 2 : 1);
  }
}
void main();

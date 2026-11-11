/**
 * Prints a new random master key for AI key encryption:   npm run ai:master-key -- 2
 * The number is the version (default 1). Copy the line into the server's environment (never into a file that is committed, a chat or a ticket) and keep the old versions until
 * `npm run ai:rotate-keys` has moved every stored key. This command connects to nothing and is the only place a master key is ever printed.
 */
import { randomBytes } from "node:crypto";

const version = Number(process.argv[2] ?? 1);
if (!Number.isInteger(version) || version < 1 || version > 9999) { console.error("Usage: npm run ai:master-key -- <version, a whole number from 1>"); process.exit(2); }
console.log(`AI_MASTER_KEY_V${version}=${randomBytes(32).toString("base64")}`);
console.log(`# then set AI_MASTER_KEY_ACTIVE=${version} (after the key is deployed everywhere)`);

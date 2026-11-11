import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { inspect } from "node:util";

/**
 * AES-256-GCM protection for provider API keys stored in the database (Phase 4.4.2).
 *
 * Envelope (text, safe to store):  aigcm1.<masterKeyVersion>.<iv>.<tag>.<ciphertext>   (iv, tag and ciphertext are base64url)
 *  - A fresh random 96-bit IV for every encryption, a 128-bit authentication tag.
 *  - The master-key VERSION is inside the envelope, so a stored key says which master key decrypts it and rotation can proceed one version at a time.
 *  - The row is bound in as additional authenticated data (id, purpose, provider): a ciphertext copied to another row, or a row whose provider/purpose was changed in the
 *    database, fails authentication instead of sending a key to the wrong place. Any change to iv, tag or ciphertext fails too.
 *  - Master keys live only in the environment: AI_MASTER_KEY_V<n> (32 bytes as base64/base64url or 64 hex characters) and AI_MASTER_KEY_ACTIVE=<n>, the version used to encrypt.
 *    They are never stored in the database, logged, or put in an error message; errors name the VARIABLE or the version, never a value.
 */
export const ENVELOPE_PREFIX = "aigcm1";
export type AiKeyErrorCode = "NO_ACTIVE_KEY" | "MASTER_KEY_MISSING" | "MASTER_KEY_INVALID" | "MALFORMED" | "UNREADABLE" | "INVALID_SECRET";

/** Every failure is an AiKeyError with a code and a fixed, value-free message. */
export class AiKeyError extends Error {
  constructor(public code: AiKeyErrorCode, message: string) { super(message); this.name = "AiKeyError"; }
}

export type MasterKeys = { active: number | null; keys: ReadonlyMap<number, Buffer>; fingerprints: Readonly<Record<number, string>> };

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: string) => (/^[A-Za-z0-9_-]*$/.test(s) ? Buffer.from(s, "base64url") : null);

/** A short one-way identifier of a master key (domain-separated SHA-256, first 6 bytes). Lets operators confirm two environments hold the same key without revealing it. */
export const fingerprintOf = (key: Buffer) => createHash("sha256").update("ai-master-key-fingerprint:").update(key).digest("hex").slice(0, 12);

function decodeKey(raw: string): Buffer | null {
  const v = raw.trim();
  let b: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) b = Buffer.from(v, "hex");
  else if (/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(v)) b = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (!b || b.length !== 32) return null;
  if (b.every((x) => x === b![0])) return null; // all one byte (zeros, 0xff...): not a real key
  return b;
}

/** Reads every AI_MASTER_KEY_V<n> and AI_MASTER_KEY_ACTIVE from `env`. Throws AiKeyError(MASTER_KEY_INVALID) naming the variable (never its value) if any is malformed. */
export function loadMasterKeys(env: Record<string, string | undefined> = process.env): MasterKeys {
  const keys = new Map<number, Buffer>();
  for (const [name, value] of Object.entries(env)) {
    const m = /^AI_MASTER_KEY_V(\d{1,4})$/.exec(name);
    if (!m || value === undefined || value.trim() === "") continue;
    const version = Number(m[1]);
    if (version < 1) throw new AiKeyError("MASTER_KEY_INVALID", `${name}: versions start at 1`);
    const key = decodeKey(value);
    if (!key) throw new AiKeyError("MASTER_KEY_INVALID", `${name} is not a valid 256-bit key (32 random bytes as base64 or 64 hex characters, not all the same byte)`);
    keys.set(version, key);
  }
  const prints = [...keys.entries()].map(([v, k]) => [v, fingerprintOf(k)] as const);
  if (new Set(prints.map(([, p]) => p)).size !== prints.length) throw new AiKeyError("MASTER_KEY_INVALID", "Two AI_MASTER_KEY_V<n> variables hold the same key: a new version must be a different key");
  let active: number | null = null;
  const a = env.AI_MASTER_KEY_ACTIVE;
  if (a !== undefined && a.trim() !== "") {
    if (!/^\d{1,4}$/.test(a.trim()) || Number(a) < 1) throw new AiKeyError("MASTER_KEY_INVALID", "AI_MASTER_KEY_ACTIVE must be a version number such as 1");
    active = Number(a.trim());
    if (!keys.has(active)) throw new AiKeyError("MASTER_KEY_INVALID", `AI_MASTER_KEY_ACTIVE=${active} but AI_MASTER_KEY_V${active} is not set`);
  }
  return { active, keys, fingerprints: Object.fromEntries(prints) };
}

/** What may be shown about the master keys: versions and fingerprints, never key material. */
export const masterKeyInfo = (mk: MasterKeys) => ({ active: mk.active, versions: [...mk.keys.keys()].sort((a, b) => a - b), fingerprints: mk.fingerprints });

/** Row binding authenticated with every ciphertext. */
export type KeyContext = { id: string; purpose: string; provider: string };
const aad = (c: KeyContext) => Buffer.from(`ai-key|v1|${c.id}|${c.purpose}|${c.provider}`, "utf8");

/** API keys are printable ASCII without spaces, 8 to 512 characters. Anything else is refused before it is encrypted. */
export const VALID_SECRET = /^[\x21-\x7e]{8,512}$/;

/** Encrypts `plain` with the ACTIVE master key. */
export function encryptSecret(plain: string, ctx: KeyContext, mk: MasterKeys): { envelope: string; version: number } {
  if (!VALID_SECRET.test(plain)) throw new AiKeyError("INVALID_SECRET", "An API key must be 8 to 512 printable characters with no spaces");
  if (mk.active === null) throw new AiKeyError("NO_ACTIVE_KEY", "No active master key: set AI_MASTER_KEY_V<n> and AI_MASTER_KEY_ACTIVE before storing a key");
  return { envelope: seal(Buffer.from(plain, "utf8"), ctx, mk.keys.get(mk.active)!, mk.active), version: mk.active };
}

function seal(plain: Buffer, ctx: KeyContext, key: Buffer, version: number): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  c.setAAD(aad(ctx));
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return `${ENVELOPE_PREFIX}.${version}.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}

type Parsed = { version: number; iv: Buffer; tag: Buffer; ct: Buffer };
function parse(envelope: string): Parsed {
  const p = envelope.split(".");
  if (p.length !== 5 || p[0] !== ENVELOPE_PREFIX || !/^\d{1,4}$/.test(p[1])) throw new AiKeyError("MALFORMED", "The stored key is not in a recognised format");
  const iv = fromB64u(p[2]), tag = fromB64u(p[3]), ct = fromB64u(p[4]);
  if (!iv || !tag || !ct || iv.length !== 12 || tag.length !== 16 || ct.length < 1 || ct.length > 1024) throw new AiKeyError("MALFORMED", "The stored key is not in a recognised format");
  return { version: Number(p[1]), iv, tag, ct };
}

/** The master-key version an envelope was encrypted with, or null if it is not a valid envelope. Reads no key material. */
export const envelopeVersion = (envelope: string | null | undefined): number | null => { try { return envelope ? parse(envelope).version : null; } catch { return null; } };

/** Decrypts into a Buffer (so callers can zero it). Fails with a fixed message that does not reveal which part was wrong. */
export function decryptToBuffer(envelope: string, ctx: KeyContext, mk: MasterKeys): Buffer {
  const { version, iv, tag, ct } = parse(envelope);
  const key = mk.keys.get(version);
  if (!key) throw new AiKeyError("MASTER_KEY_MISSING", `The stored key was encrypted with master key version ${version}, which is not available (set AI_MASTER_KEY_V${version})`);
  try {
    const d = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    d.setAAD(aad(ctx));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
  } catch {
    throw new AiKeyError("UNREADABLE", "The stored key could not be decrypted: wrong master key, altered data, or it belongs to another configuration");
  }
}

export function decryptSecret(envelope: string, ctx: KeyContext, mk: MasterKeys): string {
  const b = decryptToBuffer(envelope, ctx, mk);
  try { return b.toString("utf8"); } finally { b.fill(0); }
}

/** Re-encrypts an envelope under `toVersion` (fresh IV) after proving the result decrypts to the same plaintext. Plaintext exists only in zeroed buffers. */
export function reencrypt(envelope: string, ctx: KeyContext, mk: MasterKeys, toVersion: number): string {
  const target = mk.keys.get(toVersion);
  if (!target) throw new AiKeyError("MASTER_KEY_MISSING", `Master key version ${toVersion} is not available (set AI_MASTER_KEY_V${toVersion})`);
  const plain = decryptToBuffer(envelope, ctx, mk);
  try {
    const next = seal(plain, ctx, target, toVersion);
    const check = decryptToBuffer(next, ctx, mk);
    try { if (check.length !== plain.length || !timingSafeEqual(check, plain)) throw new AiKeyError("UNREADABLE", "Re-encryption could not be verified"); } finally { check.fill(0); }
    return next;
  } finally { plain.fill(0); }
}

/** The last four characters for display, or null when the key is too short to show any part of it safely. */
export const last4Of = (plain: string) => (plain.length >= 16 ? plain.slice(-4) : null);

/**
 * A secret in memory. It cannot be printed, stringified, spread or serialized by accident: String(), template literals, JSON.stringify, console.log and util.inspect all give
 * "[hidden]". The only way to the value is the explicit, greppable `.reveal()`, which only provider-calling code should use.
 */
export class Secret {
  readonly #value: string;
  constructor(value: string) { this.#value = value; }
  reveal() { return this.#value; }
  toString() { return "[hidden]"; }
  toJSON() { return "[hidden]"; }
  [inspect.custom]() { return "Secret([hidden])"; }
}

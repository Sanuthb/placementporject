import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { unauthorized } from "@/lib/api/errors";

export type TokenInfo = { userId: string; /** "aal2" once the person has confirmed with an authenticator code. */ aal: string; sessionId: string | null; methods: string[] };
type Cached = TokenInfo & { exp: number };
const cache = new Map<string, Cached>();
const TTL_MS = 60_000; // short, so a revoked session is noticed within a minute; the JWT itself lives an hour anyway
const MAX_ENTRIES = 5000;

/** Reads the claims of a token that Supabase has just accepted. The signature was checked by Supabase, so these are trustworthy. */
function claimsOf(token: string): { aal: string; sessionId: string | null; methods: string[] } {
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { aal?: string; session_id?: string; amr?: { method?: string }[] };
    return { aal: p.aal ?? "aal1", sessionId: p.session_id ?? null, methods: (p.amr ?? []).map((a) => a.method ?? "").filter(Boolean) };
  } catch { return { aal: "aal1", sessionId: null, methods: [] }; }
}

/**
 * Asks Supabase who a bearer token belongs to. Results are cached for a minute per instance, which
 * removes a network round trip from almost every request. Authorisation (active user, role, module)
 * is still checked against the database on every call, so deactivation takes effect immediately.
 */
export async function verifyTokenInfo(token: string): Promise<TokenInfo> {
  const key = createHash("sha256").update(token).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit;

  const { data, error } = await createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
  if (error || !data.user) { cache.delete(key); throw unauthorized("Invalid or expired token"); }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!); // drop the oldest
  const info = { userId: data.user.id, ...claimsOf(token), exp: Date.now() + TTL_MS };
  cache.set(key, info);
  return info;
}

export async function verifyToken(token: string): Promise<string> {
  return (await verifyTokenInfo(token)).userId;
}

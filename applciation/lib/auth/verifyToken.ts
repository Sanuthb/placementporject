import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { unauthorized } from "@/lib/api/errors";

type Verified = { userId: string; exp: number };
const cache = new Map<string, Verified>();
const TTL_MS = 60_000; // short, so a revoked session is noticed within a minute; the JWT itself lives an hour anyway
const MAX_ENTRIES = 5000;

/**
 * Asks Supabase who a bearer token belongs to. Results are cached for a minute per instance, which
 * removes a network round trip from almost every request. Authorisation (active user, role, module)
 * is still checked against the database on every call, so deactivation takes effect immediately.
 */
export async function verifyToken(token: string): Promise<string> {
  const key = createHash("sha256").update(token).digest("hex");
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.userId;

  const { data, error } = await createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token);
  if (error || !data.user) { cache.delete(key); throw unauthorized("Invalid or expired token"); }
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!); // drop the oldest
  cache.set(key, { userId: data.user.id, exp: Date.now() + TTL_MS });
  return data.user.id;
}

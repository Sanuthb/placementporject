/**
 * Local-only protection (Phase 4.4.1). Pure and dependency-free so the app, the scripts and Prisma's config can all use it.
 * A target is "local" only if its host is exactly localhost, 127.0.0.1 or ::1. Anything else (a Supabase pooler, an internal IP, "localhost.example.com"),
 * and anything that cannot be parsed, counts as remote: the check fails closed. Only host names and ports are ever reported, never credentials.
 */
export const GUARDED = ["DATABASE_URL", "DIRECT_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
/** The only value that lets a database script run against a non-local target: a deliberate, typed acknowledgement. */
export const OVERRIDE_VALUE = "I_UNDERSTAND_THIS_IS_NOT_LOCAL";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export type Target = { name: string; set: boolean; host: string | null; port: string | null; local: boolean };

/** Host and port of a URL-like value without trusting URL parsing (passwords may contain '@' or ':'). Null when there is no usable host. */
export function parseHost(value: string | undefined | null): { host: string; port: string | null } | null {
  if (!value || !value.trim()) return null;
  const rest = value.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const authority = rest.split(/[/?#]/, 1)[0];
  const hostport = authority.slice(authority.lastIndexOf("@") + 1);
  let host: string;
  let port: string | null = null;
  if (hostport.startsWith("[")) {
    const end = hostport.indexOf("]");
    if (end < 0) return null;
    host = hostport.slice(1, end);
    const p = hostport.slice(end + 1);
    if (p.startsWith(":")) port = p.slice(1) || null;
  } else {
    const i = hostport.lastIndexOf(":");
    if (i >= 0) { host = hostport.slice(0, i); port = hostport.slice(i + 1) || null; } else host = hostport;
  }
  host = host.trim().toLowerCase();
  if (!host || /\s/.test(host)) return null;
  if (port !== null && !/^\d{1,5}$/.test(port)) return null;
  return { host, port };
}

export function resolveTargets(env: Record<string, string | undefined>, names: readonly string[] = GUARDED): Target[] {
  return names.map((name) => {
    const v = env[name];
    const set = !!v && v.trim() !== "";
    const p = set ? parseHost(v) : null;
    return { name, set, host: p?.host ?? null, port: p?.port ?? null, local: set ? !!p && LOCAL_HOSTS.has(p.host) : true };
  });
}

/** Targets that are set and not local (an unparseable value counts as remote). */
export const remoteTargets = (env: Record<string, string | undefined>, names: readonly string[] = GUARDED) => resolveTargets(env, names).filter((t) => t.set && !t.local);

const label = (t: Target) => `${t.name} -> ${t.host ?? "(unreadable value)"}${t.port ? ":" + t.port : ""}`;

/**
 * Throws unless every guarded target is local. `strict` ignores the override (used by the runtime switch REQUIRE_LOCAL_DB, which must never be bypassed).
 * The message contains host names and ports only.
 */
export function assertLocalTargets(env: Record<string, string | undefined> = process.env, o: { names?: readonly string[]; strict?: boolean; what?: string } = {}) {
  const bad = remoteTargets(env, o.names);
  if (!bad.length) return;
  if (!o.strict && env.ALLOW_REMOTE_DB === OVERRIDE_VALUE) return;
  throw new Error(
    `Refusing${o.what ? ` to ${o.what}` : ""}: not the isolated local stack. ${bad.map(label).join("; ")}. ` +
      (o.strict ? "REQUIRE_LOCAL_DB is on." : `Use the Docker stack (.env.local, docs/LOCAL_ENV.md), or for a deliberate, approved operation set ALLOW_REMOTE_DB=${OVERRIDE_VALUE}.`),
  );
}

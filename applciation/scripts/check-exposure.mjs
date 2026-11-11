// Fails (exit 1) if the public anon key can reach any table through Supabase's REST API.
// Run after every migration:  npm run check:exposure
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

// Same order as the app: environment, then .env.local, then .env. Refuses a non-local SUPABASE_URL (this script sends requests to it) unless ALLOW_REMOTE_DB is set deliberately.
for (const f of [".env.local", ".env"]) if (existsSync(f)) for (const [k, v] of Object.entries(parse(readFileSync(f)))) if (!(k in process.env)) process.env[k] = v;
{
  const h = /^[a-z]+:\/\/(?:[^/@]*@)?(\[[^\]]*\]|[^/:?#]*)/i.exec(process.env.SUPABASE_URL ?? "")?.[1]?.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(h ?? "") && process.env.ALLOW_REMOTE_DB !== "I_UNDERSTAND_THIS_IS_NOT_LOCAL") {
    console.error(`Refusing: SUPABASE_URL resolves to ${h || "(unreadable)"}, not the isolated local stack. See docs/LOCAL_ENV.md.`);
    process.exit(2);
  }
}

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) { console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY"); process.exit(2); }
const h = { apikey: key, Authorization: `Bearer ${key}` };

// 1. The REST root lists every table the role can see.
const root = await fetch(`${url}/rest/v1/`, { headers: h });
const spec = root.ok ? await root.json().catch(() => ({})) : {};
const listed = Object.keys(spec.paths ?? {}).filter((p) => p !== "/" && !p.startsWith("/rpc/"));
// 2. Probe a few sensitive tables directly, for reads and writes.
const probes = ["Student", "User", "Offer", "PsychAttempt", "AuditLog"];
const bad = [];
for (const t of probes) {
  const r = await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, { headers: h });
  if (r.ok) bad.push(`READ  ${t} (HTTP ${r.status})`);
  const w = await fetch(`${url}/rest/v1/${t}`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: "{}" });
  if (w.status < 400) bad.push(`WRITE ${t} (HTTP ${w.status})`);
}
if (listed.length) bad.push(`REST API advertises: ${listed.slice(0, 8).join(", ")}${listed.length > 8 ? "..." : ""}`);
if (bad.length) { console.error("EXPOSED:\n  " + bad.join("\n  ") + "\nRun: npm run db:harden"); process.exit(1); }
console.log("OK: the public anon key reaches no tables.");

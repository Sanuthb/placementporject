/**
 * Resolved-host verification:  npm run guard:local   (--check also talks to the local stack, --json is for machines, --dir <path> reads another folder's env files)
 * Prints, for each guarded variable, where it comes from (environment, .env.local or .env) and the host and port it resolves to. Exits 2 if any is not local.
 * Never prints a credential. The database scripts in package.json run this first, so a wrong .env cannot reach a hosted database by accident.
 */
import { loadEnvFiles } from "./lib/envFiles";
import { GUARDED, OVERRIDE_VALUE, remoteTargets, resolveTargets } from "../lib/localOnly";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const dir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : process.cwd();
const env: NodeJS.ProcessEnv = { ...process.env };
const source = loadEnvFiles(dir, env);
const targets = resolveTargets(env, GUARDED);
const bad = remoteTargets(env, GUARDED);
const override = env.ALLOW_REMOTE_DB === OVERRIDE_VALUE;
const rows = targets.map((t) => ({
  variable: t.name,
  source: t.set ? (source[t.name] ?? "?") : "(not set)",
  host: t.set ? `${t.host ?? "(unreadable)"}${t.port ? ":" + t.port : ""}` : "-",
  verdict: !t.set ? "unset" : t.local ? "LOCAL" : "REMOTE",
}));

const check: { database?: { ok: boolean; [k: string]: unknown }; auth?: { ok: boolean; [k: string]: unknown } } = {};
if (flag("--check") && !bad.length) {
  const url = env.DIRECT_URL || env.DATABASE_URL;
  try {
    const { default: pg } = await import("pg");
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
    await c.connect();
    const r = (await c.query("select current_database() as db, inet_server_port() as port")).rows[0];
    const m = await c.query('select count(*)::int as n from "_prisma_migrations"').then((x) => x.rows[0].n, () => null);
    check.database = { ok: true, name: r.db, listeningPort: r.port, migrationsApplied: m };
    await c.end();
  } catch (e) {
    check.database = { ok: false, error: (e as Error).name };
  }
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(4000) });
    check.auth = { ok: r.ok, status: r.status };
  } catch (e) {
    check.auth = { ok: false, error: (e as Error).name };
  }
}

if (flag("--json")) {
  console.log(JSON.stringify({ ok: !bad.length || override, override, targets: rows, ...check }));
} else {
  const w = (k: "variable" | "source" | "host" | "verdict") => Math.max(k.length, ...rows.map((r) => r[k].length));
  const line = (r: Record<string, string>) => `${r.variable.padEnd(w("variable"))}  ${r.source.padEnd(w("source"))}  ${r.host.padEnd(w("host"))}  ${r.verdict}`;
  console.log(line({ variable: "variable", source: "source", host: "host", verdict: "verdict" }));
  for (const r of rows) console.log(line(r));
  if (check.database) console.log("local database:", JSON.stringify(check.database));
  if (check.auth) console.log("local auth:", JSON.stringify(check.auth));
  if (!bad.length) console.log("OK: every target resolves to the isolated local stack.");
  else if (override) console.log(`WARNING: non-local targets allowed because ALLOW_REMOTE_DB is set: ${bad.map((b) => b.name).join(", ")}`);
  else console.error(`REFUSED: ${bad.map((b) => b.name).join(", ")} resolve to a non-local host. Use .env.local (docs/LOCAL_ENV.md) so the Docker stack is used. For a deliberate, approved operation set ALLOW_REMOTE_DB=${OVERRIDE_VALUE}.`);
}
const dbFailed = check.database && !check.database.ok;
process.exit(bad.length && !override ? 2 : dbFailed ? 3 : 0);

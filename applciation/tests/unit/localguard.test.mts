// Unit and process-level tests for the local-only protection (Phase 4.4.1): host parsing, env-file precedence, the guard CLI, Prisma config, scripts and the runtime switch.
// Nothing here can reach a real database: every "remote" host is a fake `.invalid` name, and each refusal is asserted to happen BEFORE any connection is attempted.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseHost, resolveTargets, remoteTargets, assertLocalTargets, OVERRIDE_VALUE } from "../../lib/localOnly";
import { loadEnvFiles } from "../../scripts/lib/envFiles";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const REMOTE = "postgresql://postgres.abcdefgh:S3cr3t-Pa55@db.guard-test.invalid:6543/postgres";

// ---------------- host parsing (fails closed) ----------------
t("parse: a plain local URL", JSON.stringify(parseHost("postgresql://postgres:postgres@localhost:54330/postgres")) === JSON.stringify({ host: "localhost", port: "54330" }));
t("parse: 127.0.0.1 and [::1] are understood", parseHost("http://127.0.0.1:54321")?.host === "127.0.0.1" && parseHost("postgresql://u:p@[::1]:5432/db")?.host === "::1" && parseHost("postgresql://u:p@[::1]:5432/db")?.port === "5432");
t("parse: a password containing @ and : cannot hide the real host", parseHost("postgresql://user:p@ss:w0rd@aws-0-ap-south-1.pooler.supabase.com:6543/postgres")?.host === "aws-0-ap-south-1.pooler.supabase.com");
t("parse: a password that looks like a local host cannot fake locality", parseHost("postgresql://user:@localhost:5@evil.example.com:5432/x")?.host === "evil.example.com");
t("parse: upper case, query strings and no port", parseHost("POSTGRESQL://U:P@LocalHost/db?pgbouncer=true")?.host === "localhost" && parseHost("POSTGRESQL://U:P@LocalHost/db?x=1")?.port === null);
t("parse: nothing, blanks and garbage give null", parseHost(undefined) === null && parseHost("") === null && parseHost("   ") === null && parseHost("postgresql://u:p@:5432/db") === null && parseHost("postgresql://u:p@host:notaport/db") === null && parseHost("postgresql://u:p@[::1/db") === null);

// ---------------- locality ----------------
const env = (o: Record<string, string>) => o;
t("local: localhost, 127.0.0.1 and ::1 are local", remoteTargets(env({ DATABASE_URL: "postgresql://a:b@localhost:1/x", DIRECT_URL: "postgresql://a:b@127.0.0.1:1/x", SUPABASE_URL: "http://[::1]:54321" })).length === 0);
t("local: look-alikes are REMOTE (localhost.example.com, 127.0.0.1.nip.io, xlocalhost, 0.0.0.0, a private IP, host.docker.internal)", ["postgresql://a:b@localhost.example.com/x", "postgresql://a:b@127.0.0.1.nip.io/x", "postgresql://a:b@xlocalhost/x", "postgresql://a:b@0.0.0.0/x", "postgresql://a:b@192.168.1.10/x", "postgresql://a:b@host.docker.internal/x"].every((u) => remoteTargets({ DATABASE_URL: u }).length === 1));
t("local: the hosted Supabase pooler and project hosts are REMOTE", remoteTargets({ DATABASE_URL: "postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres", SUPABASE_URL: "https://pjyfzinhunaygqkdbfez.supabase.co" }).length === 2);
t("local: an unreadable value is treated as remote (fail closed); an unset variable is not a problem", remoteTargets({ DATABASE_URL: "not a url at all" }).length === 1 && remoteTargets({}).length === 0 && resolveTargets({}).every((x) => !x.set && x.local));
t("local: only the four guarded variables are inspected by default", resolveTargets({}).map((x) => x.name).join() === "DATABASE_URL,DIRECT_URL,SUPABASE_URL,NEXT_PUBLIC_SUPABASE_URL");

// ---------------- assertLocalTargets ----------------
const msg = (e: Record<string, string>, o = {}) => { try { assertLocalTargets(e, o); return ""; } catch (x) { return (x as Error).message; } };
{
  const m = msg({ DATABASE_URL: REMOTE, SUPABASE_URL: "https://pjyfzinhunaygqkdbfez.supabase.co" }, { what: "run a thing" });
  t("assert: refuses, naming the variables and hosts, and starts with 'Refusing to run a thing'", /^Refusing to run a thing: not the isolated local stack\./.test(m) && /DATABASE_URL -> db\.guard-test\.invalid:6543/.test(m) && /SUPABASE_URL -> pjyfzinhunaygqkdbfez\.supabase\.co/.test(m), m);
  t("assert: the message contains no user name, password or database name", !/S3cr3t|postgres\.abcdefgh|Pa55|\/postgres/.test(m), m);
  t("assert: a local environment passes silently", msg({ DATABASE_URL: "postgresql://a:b@localhost:5/x" }) === "");
  t("assert: the typed override allows a remote target (and only that exact value)", msg({ DATABASE_URL: REMOTE, ALLOW_REMOTE_DB: OVERRIDE_VALUE }) === "" && msg({ DATABASE_URL: REMOTE, ALLOW_REMOTE_DB: "true" }) !== "" && msg({ DATABASE_URL: REMOTE, ALLOW_REMOTE_DB: "1" }) !== "");
  t("assert: strict mode (REQUIRE_LOCAL_DB) ignores the override completely", msg({ DATABASE_URL: REMOTE, ALLOW_REMOTE_DB: OVERRIDE_VALUE }, { strict: true }) !== "" && /REQUIRE_LOCAL_DB is on/.test(msg({ DATABASE_URL: REMOTE }, { strict: true })));
  t("assert: a name list limits what is inspected", msg({ DATABASE_URL: REMOTE, DIRECT_URL: "postgresql://a:b@localhost:5/x" }, { names: ["DIRECT_URL"] }) === "");
}

// ---------------- env file precedence ----------------
const dir = mkdtempSync(join(tmpdir(), "guard-"));
try {
  writeFileSync(join(dir, ".env"), 'DATABASE_URL="postgresql://u:p@db.guard-test.invalid:6543/x"\nSUPABASE_URL=https://proj.guard-test.invalid\nONLY_IN_ENV=1\n');
  writeFileSync(join(dir, ".env.local"), "DATABASE_URL=postgresql://u:p@localhost:54330/x\nONLY_IN_LOCAL=2\n");
  const e1: Record<string, string | undefined> = {}; const s1 = loadEnvFiles(dir, e1);
  t("env files: .env.local overrides .env, and .env fills what .env.local does not set", e1.DATABASE_URL?.includes("localhost") === true && e1.SUPABASE_URL?.includes("guard-test") === true && e1.ONLY_IN_ENV === "1" && e1.ONLY_IN_LOCAL === "2");
  t("env files: the source of every variable is reported (never its value)", s1.DATABASE_URL === ".env.local" && s1.SUPABASE_URL === ".env" && !JSON.stringify(s1).includes("S3cr3t") && !JSON.stringify(s1).includes("localhost"));
  const e2: Record<string, string | undefined> = { DATABASE_URL: "postgresql://u:p@127.0.0.1:1/x" }; const s2 = loadEnvFiles(dir, e2);
  t("env files: a variable already in the environment beats both files", e2.DATABASE_URL === "postgresql://u:p@127.0.0.1:1/x" && s2.DATABASE_URL === "environment");
  const e3: Record<string, string | undefined> = {}; loadEnvFiles(join(dir, "nothing-here"), e3);
  t("env files: a folder with no env files loads nothing and does not fail", Object.keys(e3).length === 0);

  // ---------------- the guard CLI (child processes) ----------------
  const BASE: Record<string, string | undefined> = { ...process.env }; for (const k of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "ALLOW_REMOTE_DB", "REQUIRE_LOCAL_DB"]) delete BASE[k];
  const run = (args: string[], over: Record<string, string> = {}, cwd = process.cwd()) => { const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8", env: { ...BASE, ...over } as NodeJS.ProcessEnv, timeout: 120_000 }); return { code: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") }; };
  const guard = (over: Record<string, string> = {}, extra: string[] = []) => run(["--import", "tsx", "scripts/guard-local.mts", ...extra], over);

  const g1 = guard();
  t("CLI: in this project (.env.local present) every guarded target resolves to LOCAL from .env.local and the command exits 0", g1.code === 0 && (g1.out.match(/LOCAL/g) ?? []).length === 4 && !/REMOTE/.test(g1.out) && /\.env\.local/.test(g1.out), g1.out);
  t("CLI: the output has hosts and ports only, no credentials", !/postgres:postgres|S3cr3t|eyJ|service_role/.test(g1.out), g1.out);
  const g2 = guard({ DATABASE_URL: REMOTE });
  t("CLI: a remote DATABASE_URL in the environment is REFUSED (exit 2), shown as REMOTE with its host, and its password is not printed", g2.code === 2 && /DATABASE_URL\s+environment\s+db\.guard-test\.invalid:6543\s+REMOTE/.test(g2.out) && !/S3cr3t|Pa55|abcdefgh/.test(g2.out), g2.out);
  const g3 = guard({}, ["--dir", dir]);
  t("CLI: a folder whose .env names hosted hosts is REFUSED for those variables even though its .env.local fixes DATABASE_URL (the situation before .env.local existed, partly fixed)", g3.code === 2 && /SUPABASE_URL\s+\.env\s+proj\.guard-test\.invalid\s+REMOTE/.test(g3.out) && /DATABASE_URL\s+\.env\.local\s+localhost:54330\s+LOCAL/.test(g3.out), g3.out);
  const g4 = guard({ DATABASE_URL: REMOTE, ALLOW_REMOTE_DB: OVERRIDE_VALUE });
  t("CLI: the typed override turns the refusal into a loud warning (exit 0)", g4.code === 0 && /WARNING: non-local targets allowed/.test(g4.out), g4.out);
  const g5 = guard({ DATABASE_URL: REMOTE }, ["--json"]);
  t("CLI: --json is parseable, says ok=false and carries no credential", (() => { try { const j = JSON.parse(g5.out.trim().split("\n").pop()!); return j.ok === false && j.targets.some((x: { verdict: string }) => x.verdict === "REMOTE") && !/S3cr3t/.test(g5.out); } catch { return false; } })(), g5.out);
  const g6 = guard({}, ["--check"]);
  t("CLI: --check reaches the local Docker database and Auth and reports the database, port and applied migrations (when the stack is up)", /local database:/.test(g6.out) && (g6.code === 0 || g6.code === 3), g6.out);
  const g7 = guard({ DATABASE_URL: REMOTE }, ["--check"]);
  t("CLI: --check never connects when a target is remote (no 'local database' line, exit 2)", g7.code === 2 && !/local database:/.test(g7.out) && !/local auth:/.test(g7.out), g7.out);

  // ---------------- the guarded entry points refuse BEFORE connecting ----------------
  const prismaBin = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  const bad = { DATABASE_URL: REMOTE, DIRECT_URL: REMOTE };
  for (const sub of [["migrate", "status"], ["migrate", "deploy"], ["db", "execute", "--file", "prisma/harden.sql"]]) {
    const r = run([prismaBin, ...sub], bad);
    t(`Prisma: 'prisma ${sub.slice(0, 2).join(" ")}' against a remote URL is refused by prisma.config.ts before any connection (no host-lookup or connection error appears)`, r.code !== 0 && /Refusing to run a Prisma database command/.test(r.out) && !/P1001|P1000|ENOTFOUND|ECONNREFUSED|Datasource|schema engine/i.test(r.out) && !/S3cr3t|Pa55/.test(r.out), r.out.slice(0, 300));
  }
  const gen = run([prismaBin, "generate"], bad);
  t("Prisma: 'prisma generate' (used by the build and postinstall) still works with a remote URL: it never connects, so hosted builds are unaffected", gen.code === 0 && /Generated Prisma Client/.test(gen.out), gen.out.slice(0, 300));
  const okp = run([prismaBin, "migrate", "status"], { DATABASE_URL: "postgresql://postgres:postgres@localhost:54330/postgres", DIRECT_URL: "postgresql://postgres:postgres@localhost:54330/postgres" });
  t("Prisma: a local URL is not blocked by the guard (status either reports or fails to connect, but is never 'Refusing')", !/Refusing/.test(okp.out));
  for (const s of ["prisma/seed.ts", "scripts/create-platform-admin.ts", "scripts/platform-mfa-recovery.ts"]) {
    const r = run(["--import", "tsx", s], { ...bad, SUPABASE_URL: "https://proj.guard-test.invalid", SUPABASE_SERVICE_ROLE_KEY: "x".repeat(30), SUPABASE_ANON_KEY: "x".repeat(30), SEED_ADMIN_EMAIL: "a@b.c", SEED_ADMIN_PASSWORD: "pw", PLATFORM_ADMIN_EMAIL: "a@b.c", PLATFORM_ADMIN_PASSWORD: "pw", PLATFORM_ADMIN_NAME: "n" });
    t(`script: ${s} refuses a non-local target before doing anything (no database or Auth error appears, no password printed)`, r.code !== 0 && /Refusing to run this script/.test(r.out) && !/ENOTFOUND|ECONNREFUSED|fetch failed|P1001/i.test(r.out) && !/S3cr3t|Pa55/.test(r.out), r.out.slice(0, 300));
  }
  const ce = run(["scripts/check-exposure.mjs"], { SUPABASE_URL: "https://proj.guard-test.invalid", SUPABASE_ANON_KEY: "x".repeat(30) });
  t("script: check-exposure refuses a non-local SUPABASE_URL before sending any request (it POSTs probes)", ce.code === 2 && /Refusing: SUPABASE_URL resolves to proj\.guard-test\.invalid/.test(ce.out) && !/fetch failed|ENOTFOUND/i.test(ce.out), ce.out);
  const rc = run(["-e", 'import("./tests/gate3/rec.mjs").then((m) => m.recorder("guardtest"))'], { SUPABASE_URL: "http://localhost:54321", DIRECT_URL: REMOTE });
  t("test recorder: refuses to run when DIRECT_URL is not local (the suites open it directly), before writing any result file", rc.code === 2 && /Refusing: DIRECT_URL is not the isolated local stack/.test(rc.out) && !/S3cr3t/.test(rc.out), rc.out.slice(0, 200));

  // ---------------- the runtime switch ----------------
  const probe = (over: Record<string, string>) => run(["--import", "tsx", "-e", 'import("./lib/db").then(()=>{console.log("LOADED")}).catch((e)=>{console.log("THROWN:"+String(e.message).slice(0,200))})'], over);
  const r1 = probe({ REQUIRE_LOCAL_DB: "true", DATABASE_URL: REMOTE, DIRECT_URL: REMOTE, SUPABASE_URL: "https://proj.guard-test.invalid" });
  t("runtime: with REQUIRE_LOCAL_DB=true, opening the database client against a remote target throws at once", /THROWN:Refusing to open a database connection/.test(r1.out) && !/S3cr3t|Pa55/.test(r1.out), r1.out);
  const r2 = probe({ REQUIRE_LOCAL_DB: "true", DATABASE_URL: REMOTE, DIRECT_URL: REMOTE, ALLOW_REMOTE_DB: OVERRIDE_VALUE });
  t("runtime: the override variable does NOT bypass REQUIRE_LOCAL_DB (it cannot be talked around)", /THROWN:Refusing/.test(r2.out), r2.out);
  const r3 = probe({ REQUIRE_LOCAL_DB: "true", DATABASE_URL: "postgresql://postgres:postgres@localhost:54330/postgres", DIRECT_URL: "postgresql://postgres:postgres@localhost:54330/postgres", SUPABASE_URL: "http://localhost:54321" });
  t("runtime: with local targets the client loads normally", /LOADED/.test(r3.out), r3.out);
  const r4 = probe({ DATABASE_URL: REMOTE });
  t("runtime: without REQUIRE_LOCAL_DB nothing changes for a hosted deployment (Vercel keeps working)", /LOADED/.test(r4.out), r4.out);
} finally { rmSync(dir, { recursive: true, force: true }); }

// ---------------- browser-test safety (Phase 4.4.2 pre-step) ----------------
{
  const { loadLocalBrowserEnv, requireLocalBrowserEnv } = await import("../web/lib/local-only");
  const d2 = mkdtempSync(join(tmpdir(), "guard-web-"));
  const keep = { ...process.env };
  try {
    writeFileSync(join(d2, ".env"), "DATABASE_URL=postgresql://u:S3cr3t@db.guard-test.invalid:6543/x\nPW_BASE_URL=http://localhost:3000\nPW_PROBE=from-dot-env\n");
    writeFileSync(join(d2, ".env.local"), "DATABASE_URL=postgresql://u:p@localhost:54330/x\nPW_LOCAL_PROBE=from-dot-env-local\n");
    for (const k of ["DATABASE_URL", "DIRECT_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "PW_BASE_URL", "PW_PROBE", "PW_LOCAL_PROBE", "ALLOW_REMOTE_DB"]) delete process.env[k];
    loadLocalBrowserEnv(d2);
    t("browser env: only .env.local is read; a bare .env (hosted URLs, PW_BASE_URL) is never loaded", process.env.PW_LOCAL_PROBE === "from-dot-env-local" && process.env.PW_PROBE === undefined && process.env.PW_BASE_URL === undefined && process.env.DATABASE_URL?.includes("localhost") === true);
    delete process.env.DATABASE_URL; delete process.env.PW_LOCAL_PROBE;
    process.env.DATABASE_URL = REMOTE; process.env.ALLOW_REMOTE_DB = OVERRIDE_VALUE;
    let m = ""; try { loadLocalBrowserEnv(join(d2, "nothing")); } catch (e) { m = (e as Error).message; }
    t("browser env: a remote target in the environment is refused, and the typed override does NOT apply to browser tests", /^Refusing to run a browser test: not the isolated local stack\./.test(m) && /REQUIRE_LOCAL_DB is on/.test(m) && !/S3cr3t/.test(m), m);
    delete process.env.DATABASE_URL; delete process.env.ALLOW_REMOTE_DB;
    const refuse = (u: string | undefined) => { try { requireLocalBrowserEnv(u); return ""; } catch (e) { return (e as Error).message; } };
    t("browser base URL: port 3000 (the usual dev server) is refused", /port 3000/.test(refuse("http://localhost:3000")) && /port 3000/.test(refuse("http://127.0.0.1:3000/login")));
    t("browser base URL: a hosted or look-alike host is refused", /not the local machine/.test(refuse("https://app.guard-test.invalid")) && /not the local machine/.test(refuse("http://localhost.example.com:3115")) && /not the local machine/.test(refuse("https://pjyfzinhunaygqkdbfez.supabase.co")));
    t("browser base URL: a missing base URL is refused, and the local test server port is accepted", /no base URL/.test(refuse(undefined)) && refuse("http://localhost:3115") === "");
  } finally { for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k]; Object.assign(process.env, keep); rmSync(d2, { recursive: true, force: true }); }
}

// ---------------- package.json wiring ----------------
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const needGuard = ["db:seed", "db:platform-admin", "db:platform-mfa-recovery", "db:migrate", "db:harden", "db:deploy", "check:exposure"];
t("package.json: every script that opens a database connection or probes Supabase starts with the local guard", needGuard.every((k) => /^tsx scripts\/guard-local\.mts && /.test(pkg.scripts[k] ?? "")), needGuard.filter((k) => !/^tsx scripts\/guard-local\.mts && /.test(pkg.scripts[k] ?? "")).join());
t("package.json: guard:local and guard:local:check exist, and build/generate/postinstall (which never connect) are not guarded", !!pkg.scripts["guard:local"] && !!pkg.scripts["guard:local:check"] && !/guard-local/.test(pkg.scripts.build + pkg.scripts["db:generate"] + pkg.scripts.postinstall));

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);

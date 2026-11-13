// Runs every suite against throwaway local servers. Local Docker stack only:  source tests/e2e/stack/env.sh  first (it supplies the database, Auth, mail sink and the seeded admin).
//   E2E_ALLOW=1 npm run test:e2e          (E2E_ONLY='^(10|12)-' to select suites; E2E_DEV=1 to use a dev server instead of a production build; E2E_NO_LOG=1 to skip the log files)
// Works on Windows (npx and npm are .cmd files there and need a shell). It never loads the project's .env: that file may hold hosted values, and the stack environment already provides everything the suites need.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

const WIN = process.platform === "win32";
const NPX = WIN ? "npx.cmd" : "npx", NPM = WIN ? "npm.cmd" : "npm";   // Windows cannot spawn a .cmd file without a shell
const LOG_DIR = "tests/gate3/results/logs";

if (process.env.E2E_ALLOW !== "1") { console.error("Refusing to run: these tests create and delete data.\nPoint .env at a TEST database (never production), then run:  E2E_ALLOW=1 npm run test:e2e"); process.exit(2); }
// Safety: only ever run against the isolated local stack (source tests/e2e/stack/env.sh). Real credentials in .env are shadowed by it.
if (!/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(process.env.SUPABASE_URL ?? "") || !/(localhost|127\.0\.0\.1)/.test(process.env.DIRECT_URL ?? "")) { console.error("Refusing to run: SUPABASE_URL and DIRECT_URL must point at the local test stack.\nRun:  bash tests/e2e/stack/up.sh && source tests/e2e/stack/env.sh"); process.exit(2); }
const only = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY) : null; // e.g. E2E_ONLY='^(10|12|13)-'
const envArgs = existsSync(".env.seed") ? ["--env-file=.env.seed"] : []; // never ".env" (see the header)
const servers = [];
const start = (port, extra, mode = "dev") => new Promise((resolve, reject) => {
  const p = spawn(NPX, ["next", mode, "-p", String(port)], { env: { ...process.env, REQUIRE_LOCAL_DB: "true", ...extra }, detached: !WIN, stdio: "ignore", shell: WIN, windowsHide: true });
  servers.push(p);
  const t0 = Date.now();
  const poll = async () => { try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) return resolve(); } catch {} if (Date.now() - t0 > 120_000) return reject(new Error(`server on ${port} did not start`)); setTimeout(poll, 1500); };
  poll();
});
const stop = () => { for (const p of servers) { try { if (WIN) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" }); else process.kill(-p.pid); } catch { /* already gone */ } } };
process.on("exit", stop); process.on("SIGINT", () => { stop(); process.exit(130); });

// Two servers cannot share one dev directory, so the security suite runs against a real production build (limits on, production headers).
const needSecurity = !only || only.test("09-security");
const useProd = process.env.E2E_DEV !== "1"; // functional suites run on the production build too: a dev server compiles routes lazily and is far too slow for the larger suites
const build = needSecurity || useProd ? spawnSync(NPM, ["run", "build"], { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024, shell: WIN }) : { status: 0 };
if (build.status !== 0) { console.error("build failed\n" + build.stdout.slice(-2000) + build.stderr.slice(-2000)); process.exit(1); }
if (needSecurity) await start(3112, { NODE_ENV: "production", CORS_ORIGINS: "http://localhost:5173", FLOOD_MAX_PER_MINUTE: "600" }, "start"); // security suite: production mode, limits on
await start(3111, { RATE_LIMIT_DISABLED: "true", FLOOD_MAX_PER_MINUTE: "1000000" }, useProd ? "start" : "dev");  // functional suites: limits off so repeated runs don't trip them
const results = [];
const run = (label, args, env = {}) => {
  const r = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const passed = /ALL PASSED/.test(out) && r.status === 0;
  results.push({ label, passed });
  if (/^\d\d-/.test(label) && process.env.E2E_NO_LOG !== "1") { mkdirSync(LOG_DIR, { recursive: true }); writeFileSync(`${LOG_DIR}/${label}.log`, out); } // raw suite output: tests/gate3/results/logs is what the report generator reads
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
  if (!passed) console.log(out.split("\n").filter((l) => /FAIL|Error|rror:/.test(l)).slice(0, 15).join("\n"));
};
if (!only) run("unit: scoring, config, templates", ["--import", "tsx", "tests/unit/scoring.test.mts"]);
if (!only) run("unit: invitations", ["--import", "tsx", "tests/unit/invitations.test.mts"]);
if (!only) run("unit: intelligence", ["--import", "tsx", "tests/unit/intelligence.test.mts"]);
if (!only) run("unit: institution", ["--import", "tsx", "tests/unit/institution.test.mts"]);
if (!only) run("unit: personal details", ["--import", "tsx", "tests/unit/personal.test.mts"]);
if (!only) run("unit: academic records", ["--import", "tsx", "tests/unit/academic.test.mts"]);
for (const f of ["reset.mjs"]) { const r = spawnSync(process.execPath, [...envArgs, `tests/e2e/${f}`], { encoding: "utf8", env: process.env }); if (r.status !== 0) { console.error(r.stdout + r.stderr); stop(); process.exit(1); } }
for (const f of readdirSync("tests/e2e").filter((n) => /^\d\d-.*\.mjs$/.test(n) && (!only || only.test(n))).sort()) {
  const sec = f.startsWith("09-");
  // Every suite starts from the same known state: the per-user send limits (one shared bucket for all e-mail routes) and rows earlier suites left behind would otherwise decide the result.
  spawnSync(process.execPath, [...envArgs, "tests/e2e/reset.mjs"], { encoding: "utf8", env: process.env });
  run(f.replace(".mjs", ""), [...envArgs, `tests/e2e/${f}`], { BASE_URL: sec ? "http://localhost:3112" : "http://localhost:3111", SECURITY_BASE_URL: "http://localhost:3112" });
}
stop();
if (process.env.E2E_NO_LOG !== "1") { mkdirSync(LOG_DIR, { recursive: true }); writeFileSync(`${LOG_DIR}/_run.json`, JSON.stringify({ date: new Date().toISOString().slice(0, 10), node: process.version, platform: process.platform, functionalServer: useProd ? "production build (next start)" : "dev server", suites: results.map((r) => ({ suite: r.label, passed: r.passed })) }, null, 1)); }
const bad = results.filter((r) => !r.passed);
console.log(bad.length ? `\n${bad.length} suite(s) failed` : `\nAll ${results.length} suites passed`);
process.exit(bad.length ? 1 : 0);

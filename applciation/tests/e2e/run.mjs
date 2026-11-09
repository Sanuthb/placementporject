// Runs every suite against throwaway local servers. Needs a TEST database in .env and the demo admin in .env.seed.
//   E2E_ALLOW=1 npm run test:e2e
import { spawn, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

if (process.env.E2E_ALLOW !== "1") { console.error("Refusing to run: these tests create and delete data.\nPoint .env at a TEST database (never production), then run:  E2E_ALLOW=1 npm run test:e2e"); process.exit(2); }
const envArgs = ["--env-file=.env", "--env-file=.env.seed"];
const servers = [];
const start = (port, extra, mode = "dev") => new Promise((resolve, reject) => {
  const p = spawn("npx", ["next", mode, "-p", String(port)], { env: { ...process.env, ...extra }, detached: true, stdio: "ignore" });
  servers.push(p);
  const t0 = Date.now();
  const poll = async () => { try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) return resolve(); } catch {} if (Date.now() - t0 > 120_000) return reject(new Error(`server on ${port} did not start`)); setTimeout(poll, 1500); };
  poll();
});
const stop = () => { for (const p of servers) try { process.kill(-p.pid); } catch {} };
process.on("exit", stop); process.on("SIGINT", () => { stop(); process.exit(130); });

// Two servers cannot share one dev directory, so the security suite runs against a real production build (limits on, production headers).
const build = spawnSync("npm", ["run", "build"], { encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
if (build.status !== 0) { console.error("build failed\n" + build.stdout.slice(-2000) + build.stderr.slice(-2000)); process.exit(1); }
await start(3112, { NODE_ENV: "production", CORS_ORIGINS: "http://localhost:5173", FLOOD_MAX_PER_MINUTE: "600" }, "start"); // security suite: production mode, limits on
await start(3111, { RATE_LIMIT_DISABLED: "true" });  // functional suites: dev mode, limits off so repeated runs don't trip them
const results = [];
const run = (label, args, env = {}) => {
  const r = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const passed = /ALL PASSED/.test(out) && r.status === 0;
  results.push({ label, passed });
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
  if (!passed) console.log(out.split("\n").filter((l) => /FAIL|Error|rror:/.test(l)).slice(0, 15).join("\n"));
};
run("unit: scoring, config, templates", ["--import", "tsx", "tests/unit/scoring.test.mts"]);
run("unit: invitations", ["--import", "tsx", "tests/unit/invitations.test.mts"]);
run("unit: intelligence", ["--import", "tsx", "tests/unit/intelligence.test.mts"]);
run("unit: institution", ["--import", "tsx", "tests/unit/institution.test.mts"]);
for (const f of ["reset.mjs"]) { const r = spawnSync(process.execPath, [...envArgs, `tests/e2e/${f}`], { encoding: "utf8", env: process.env }); if (r.status !== 0) { console.error(r.stdout + r.stderr); stop(); process.exit(1); } }
for (const f of readdirSync("tests/e2e").filter((n) => /^\d\d-.*\.mjs$/.test(n)).sort()) {
  const sec = f.startsWith("09-");
  run(f.replace(".mjs", ""), [...envArgs, `tests/e2e/${f}`], { BASE_URL: sec ? "http://localhost:3112" : "http://localhost:3111", SECURITY_BASE_URL: "http://localhost:3112" });
}
stop();
const bad = results.filter((r) => !r.passed);
console.log(bad.length ? `\n${bad.length} suite(s) failed` : `\nAll ${results.length} suites passed`);
process.exit(bad.length ? 1 : 0);

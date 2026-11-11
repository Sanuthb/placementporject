// Gate 3 recorder: every assertion is attached to a Test Case ID from claude/full-application-test-plan.csv.
// Output: tests/gate3/results/<suite>.jsonl (one assertion per line). claude/tools/gate3_report.py merges them into the results file.
// A case is Pass only if it has assertions and all passed; Fail if any failed; Blocked if none failed but one could not run.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function recorder(suite) {
  for (const k of ["SUPABASE_URL", "DIRECT_URL"]) {
  const h = /^[a-z]+:\/\/(?:[^/@]*@)?(\[[^\]]*\]|[^/:?#]*)/i.exec(process.env[k] ?? "")?.[1]?.replace(/^\[|\]$/g, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(h ?? "")) { console.error(`Refusing: ${k} is not the isolated local stack`); process.exit(2); }
}
  const file = fileURLToPath(new URL(`./results/${suite}.jsonl`, import.meta.url));
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, "");
  const date = new Date().toISOString();
  const env = "local Docker stack (Postgres 54330, Auth 54321, mail sink 54325); Next dev on :3111; synthetic data";
  let fails = 0, n = 0;
  const w = (o) => { n++; appendFileSync(file, JSON.stringify({ suite, date, env, ...o }) + "\n"); };
  return {
    /** t(["SA-TC-027"], "what was checked", ok, "actual result / evidence", "issue id") */
    t(ids, assertion, ok, actual = "", issue = "") { const s = ok ? "PASS" : "FAIL"; if (!ok) fails++; w({ ids: [].concat(ids), assertion, status: s, actual: String(actual).slice(0, 400), issue }); console.log(s, [].concat(ids).join(","), assertion, ok ? "" : String(actual).slice(0, 200)); },
    /** The step could not be run (missing prerequisite, feature absent, stop rule). Never counted as a pass. */
    blocked(ids, assertion, why, issue = "") { w({ ids: [].concat(ids), assertion, status: "BLOCKED", actual: why, issue }); console.log("BLOCKED", [].concat(ids).join(","), assertion, why); },
    done() { console.log(`${n} assertions, ${fails} failed`); return fails; },
  };
}

// Run against a server WITH rate limiting enabled (SECURITY_BASE_URL, default http://localhost:3112).
import { checker, client, login, upload } from "./lib.mjs";
import { spawnSync } from "node:child_process";
const { t, done } = checker();
const B = process.env.SECURITY_BASE_URL ?? "http://localhost:3112";
const staff = client(await login(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD), B);

// --- headers on every API response
const h = await fetch(B + "/api/health");
t("health is up and says nothing about configuration", h.status === 200 && (await h.json()).db === "up");
for (const [k, v] of [["x-content-type-options", "nosniff"], ["x-frame-options", "DENY"], ["referrer-policy", "no-referrer"], ["cache-control", "no-store"]]) t(`header ${k}`, h.headers.get(k) === v, h.headers.get(k));
t("request id on every response", !!h.headers.get("x-request-id"));
t("framework banner removed", !h.headers.get("x-powered-by"));
const echoed = await fetch(B + "/api/health", { headers: { "x-request-id": "trace-me-123" } });
t("a caller's request id is echoed back", echoed.headers.get("x-request-id") === "trace-me-123");

// --- errors are traceable
const e = await fetch(B + "/api/students", { headers: { "x-request-id": "trace-401" } });
const ej = await e.json();
t("errors carry the request id", e.status === 401 && ej.error.requestId === "trace-401" && ej.error.code === "UNAUTHORIZED", JSON.stringify(ej));
t("bad token is a clean 401", (await fetch(B + "/api/students", { headers: { authorization: "Bearer not.a.jwt" } })).status === 401);

// --- CORS
const ok = await fetch(B + "/api/health", { headers: { origin: "http://localhost:5173" } });
t("allowed origin gets CORS headers", ok.headers.get("access-control-allow-origin") === "http://localhost:5173" && /(^|,\s*)Origin(\s*,|$)/.test(ok.headers.get("vary") ?? "")); // Next adds its own Vary values (rsc, ...) after Origin, so check that Origin is listed
const evil = await fetch(B + "/api/health", { headers: { origin: "https://evil.example" } });
t("unknown origin gets none", !evil.headers.get("access-control-allow-origin"));
const pre = await fetch(B + "/api/students", { method: "OPTIONS", headers: { origin: "http://localhost:5173", "access-control-request-method": "POST" } });
t("preflight answered without auth", pre.status === 204 && /POST/.test(pre.headers.get("access-control-allow-methods") ?? "") && /authorization/.test(pre.headers.get("access-control-allow-headers") ?? ""));
t("preflight from an unknown origin gets no allowance", !(await fetch(B + "/api/students", { method: "OPTIONS", headers: { origin: "https://evil.example" } })).headers.get("access-control-allow-origin"));

// --- request size limits
const big = await staff("POST", "/api/companies", { name: "x".repeat(1_200_000) });
t("oversized JSON is refused (413)", big.s === 413 && big.code === "PAYLOAD_TOO_LARGE", big.s);
const drives = (await staff("GET", "/api/drives")).d?.items ?? [];
if (drives.length) {
  const f = new FormData(); f.append("file", new Blob([new Uint8Array(11 * 1024 * 1024)], { type: "application/pdf" }), "huge.pdf");
  const r = await staff("POST", `/api/drives/${drives[0].id}/documents`, null, f);
  t("oversized upload is refused before it is processed", r.s === 413, `${r.s} ${r.code}`);
}

// --- who may call scheduled-job endpoints
t("cron endpoint without the secret: 401 on GET", (await fetch(B + "/api/blocking/evaluate")).status === 401);
t("cron endpoint with a wrong secret: 401 on GET", (await fetch(B + "/api/blocking/evaluate", { headers: { authorization: "Bearer wrong-secret-wrong-secret-xx" } })).status === 401);
t("cron endpoint with the secret works on GET", (await fetch(B + "/api/blocking/evaluate", { headers: { authorization: "Bearer " + process.env.CRON_SECRET } })).status === 200);
t("cron endpoints refuse anonymous POST", (await fetch(B + "/api/reports/schedules/run", { method: "POST" })).status === 401);

// --- database-backed rate limiting
const codes = []; const probe = () => fetch(B + "/api/showcase/not-a-real-token").then((r) => r.status);
for (let i = 0; i < 7; i++) codes.push(...(await Promise.all(Array.from({ length: 20 }, probe))));
t("public link probing is rate limited (120/min)", codes.filter((c) => c === 404).length >= 100 && codes.includes(429), JSON.stringify({ n404: codes.filter((c) => c === 404).length, n429: codes.filter((c) => c === 429).length }));
const lim = await fetch(B + "/api/showcase/not-a-real-token"); const lj = await lim.json();
t("429 explains itself and says when to retry", lim.status === 429 && lj.error.code === "RATE_LIMITED" && Number(lim.headers.get("retry-after")) >= 1);

// --- the database is not reachable with the public key
const x = spawnSync(process.execPath, ["scripts/check-exposure.mjs"], { encoding: "utf8", env: process.env });
t("public anon key reaches no tables", x.status === 0, x.stderr || x.stdout);

// --- coarse flood guard (last: it blocks this address for the rest of the minute)
const flood = []; for (let i = 0; i < 12; i++) flood.push(...(await Promise.all(Array.from({ length: 70 }, () => fetch(B + "/api/health").then((r) => r.status)))));
t("flood guard trips on a burst from one address", flood.includes(429), flood.filter((c) => c === 429).length);
done();

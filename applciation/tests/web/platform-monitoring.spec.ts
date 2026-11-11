import { expect, test, type Page } from "@playwright/test"
import { createHmac } from "node:crypto"
import { spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

// Local-only. Needs the isolated stack, `source tests/e2e/stack/env.sh` and the production build (PW_BASE_URL).
const stamp = Date.now().toString().slice(-6)
const ADMIN = { email: `g3uimon${stamp}@example.com`, password: `G3-ui-mon-${stamp}-Pw!` }
const base = process.env.PW_BASE_URL ?? "http://localhost:3113"
let totpSecret = ""

function totp(secret: string, offset = 0) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0")
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset))
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0")
}
async function api(token: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  return { s: r.status, j: await r.json().catch(() => null) }
}
async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${next}`, { waitUntil: "networkidle" })
  await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: /^sign in$/i }).click()
}
const comp = (page: Page, key: string) => page.getByTestId(`component-${key}`)
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString()
const C = (key: string, label: string, status: string, summary: string, evidence: string[], latencyMs: number | null = null, details?: unknown) => ({ key, label, status, checkedAt: iso(), summary, evidence, latencyMs, ...(details ? { details } : {}) })

test.describe.configure({ mode: "serial" })
test.beforeAll(async () => {
  if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "") || !/localhost|127\.0\.0\.1/.test(process.env.DIRECT_URL ?? "")) throw new Error("Refusing: not the local stack")
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: ADMIN.email, PLATFORM_ADMIN_NAME: "UI Monitor Admin", PLATFORM_ADMIN_PASSWORD: ADMIN.password } })
  if (r.status !== 0) throw new Error(r.stderr)
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const s = (await anon.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })).data.session!
  const enr = await api(s.access_token, "POST", "/api/platform/mfa/enroll"); totpSecret = enr.j.data.secret
  await api(s.access_token, "POST", "/api/platform/mfa/verify", { factorId: enr.j.data.factorId, code: totp(totpSecret) })
})

test("anonymous and a college administrator are refused and see no health data", async ({ page, context }) => {
  await page.goto("/platform/monitoring", { waitUntil: "networkidle" })
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await expect(page.getByText("Overall platform health")).toHaveCount(0)
  await context.clearCookies()
  await signIn(page, process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!, "/platform/monitoring")
  await page.waitForURL((u) => u.pathname === "/platform/monitoring")
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await expect(page.getByText("Overall platform health")).toHaveCount(0)
})

test("platform administrator: second step, real health, refresh and throttling", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" }); await page.evaluate(() => localStorage.clear())
  await signIn(page, ADMIN.email, ADMIN.password, "/platform/monitoring")
  await page.waitForURL((u) => u.pathname === "/mfa")
  await page.goto("/platform/monitoring", { waitUntil: "networkidle" })           // password only: refused until the second step
  await expect(page.getByText("Confirm your sign-in")).toBeVisible()
  await expect(page.getByText("Overall platform health")).toHaveCount(0)
  await page.goto("/mfa?next=/platform/monitoring", { waitUntil: "networkidle" })
  await page.getByLabel("Code from your authenticator app").fill(totp(totpSecret, 1))
  await page.getByRole("button", { name: "Confirm" }).click()
  await page.waitForURL((u) => u.pathname === "/platform/monitoring")
  await expect(page.getByRole("heading", { name: "System health" })).toBeVisible()
  await expect(page.getByText("Overall platform health")).toBeVisible()

  // real data from the local stack
  await expect(comp(page, "database")).toContainText("Healthy")
  await expect(comp(page, "database")).toContainText("A trivial query succeeded")
  await expect(comp(page, "storage")).toContainText("Healthy")
  await expect(comp(page, "application")).toContainText(/Healthy|Degraded/)
  await expect(comp(page, "ai")).toContainText("Not configured")                      // no key on the local stack: never shown as healthy
  await expect(comp(page, "ai")).not.toContainText("Healthy")
  await expect(comp(page, "ai")).toContainText("GROQ_API_KEY is not set")
  await expect(comp(page, "email")).toContainText(/Healthy|Not configured/)
  await expect(page.getByRole("region", { name: "Scheduled jobs" })).toContainText("Unknown")
  await expect(page.getByRole("region", { name: "Scheduled jobs" }).locator("tbody tr")).toHaveCount(5)
  await expect(page.getByRole("region", { name: "Scheduled jobs" }).locator("tbody tr").first()).toContainText("Not recorded")
  await expect(comp(page, "backgroundJobs")).toContainText("no general job queue")
  for (const w of ["not configured", "unknown"]) await expect(page.getByText(new RegExp(w, "i")).first()).toBeVisible()
  const html = await page.locator("body").innerText()
  for (const secret of [process.env.SUPABASE_SERVICE_ROLE_KEY!, process.env.SUPABASE_ANON_KEY!, process.env.CRON_SECRET!, "postgres:postgres", "54330"]) expect(html).not.toContain(secret)

  // refresh: the check time moves; a second click straight away is throttled with a visible message
  const t0 = await page.getByTestId("checked-at").innerText()
  await page.waitForTimeout(5300)
  await page.getByRole("button", { name: "Refresh" }).click()
  await expect(page.getByTestId("checked-at")).not.toHaveText(t0)
  await page.getByRole("button", { name: "Refresh" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Refreshed too recently" })).toBeVisible()
  // the page itself never wrote anything: one more look at the error section shows its honest scope
  await expect(page.getByText(/Stored in the database and shared by all servers/)).toBeVisible()

  // ---- same session: every status, errors table, filters, paging, empty/loading/error states (API responses intercepted)
  const health = (overallStatus: string, comps: unknown[]) => ({ checkedAt: iso(), cached: false, throttled: false, ageMs: 0, overall: { status: overallStatus, counts: { healthy: 1, degraded: 1, unavailable: 1, unknown: 1, not_configured: 1 }, notes: ["1 component(s) cannot be confirmed", "1 component(s) not configured"] }, components: comps })
  const jobs = [{ path: "/api/notifications/reminders/run", schedule: "30 * * * *", description: "Reminds students (hourly)", nextDueAt: iso(900000), state: "no_run_recorded", history: "recorded", lastRunAt: null, lastSuccessAt: null, lastFailure: null, lastFailureAt: null, durationMs: null, attempts: null, failedAttempts: null }]
  const comps = [
    C("application", "Application", "healthy", "The application process is running with valid configuration", ["Mode production, up 100 s"]),
    C("database", "Database", "degraded", "The database answers, but slowly", ["A trivial query took 900 ms (slow above 500 ms)"], 900),
    C("storage", "File storage", "unavailable", "Storage did not answer in time", ["No answer within 3000 ms"], 3000),
    C("ai", "AI provider", "not_configured", "No AI provider key is configured", ["GROQ_API_KEY is not set"]),
    C("email", "Email (SMTP)", "unknown", "Delivery state cannot be confirmed", ["No evidence"]),
    C("scheduledJobs", "Scheduled jobs", "unknown", "Jobs are registered, but the application records no execution history", ["1 job(s) registered"], null, { jobs }),
    C("backgroundJobs", "Background jobs", "healthy", "No bulk import is stuck", ["Pending preview: 0"], null, { imports: { preview: 0, processing: 0, completed7d: 2, stuck: 0 } }),
    C("errors", "Server errors", "degraded", "2 server error(s) in the last 15 minutes", ["Counted since this server instance started"]),
  ]
  const errorsFor = (items: unknown[], total: number, page_ = 1) => ({ items, page: page_, pageSize: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)), capacity: 500, retained: total, since: iso(-3600000) })
  const mkErr = (i: number, service = "application") => ({ id: `e${i}`, at: iso(-i * 1000), service, status: 500, code: "INTERNAL", method: "GET", path: `/api/thing/${i}`, requestId: `req-${i}`, message: `failure number ${i}` })
  const seen: string[] = []
  await page.route("**/api/platform/monitoring?*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: health("unavailable", comps) }) }))
  await page.route("**/api/platform/monitoring", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: health("unavailable", comps) }) }))
  await page.route("**/api/platform/monitoring/errors*", (r) => { const u = new URL(r.request().url()); seen.push(u.search); const pg = Number(u.searchParams.get("page") ?? 1); const svc = u.searchParams.get("service"); const q = u.searchParams.get("q")
    if (q === "nothing") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ...errorsFor([], 0), retained: 25 } }) })   // events exist, none match
    const all = Array.from({ length: 25 }, (_, i) => mkErr(i + 1, svc ?? "application")); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: errorsFor(all.slice((pg - 1) * 10, pg * 10), 25, pg) }) }) })
  await page.reload({ waitUntil: "networkidle" })

  // every status has its own label, and the overall summary says what it is
  await expect(page.getByText("Unavailable").first()).toBeVisible()
  await expect(comp(page, "application")).toContainText("Healthy")
  await expect(comp(page, "database")).toContainText("Degraded"); await expect(comp(page, "database")).toContainText("900 ms")
  await expect(comp(page, "storage")).toContainText("Unavailable")
  await expect(comp(page, "ai")).toContainText("Not configured")
  await expect(comp(page, "email")).toContainText("Unknown")
  await expect(page.getByText("1 healthy · 1 degraded · 1 unavailable · 1 unknown · 1 not configured")).toBeVisible()
  await expect(page.getByText("1 component(s) cannot be confirmed · 1 component(s) not configured")).toBeVisible()
  // errors table
  const region = page.getByRole("region", { name: "Recent errors" })
  await expect(region.locator("tbody tr")).toHaveCount(10)
  await expect(region.locator("tbody tr").first()).toContainText("req-1")
  await expect(region.getByText("25 errors · page 1 of 3")).toBeVisible()
  await region.getByRole("button", { name: "Next" }).click(); await expect(region.getByText("page 2 of 3")).toBeVisible()
  await region.getByRole("button", { name: "Next" }).click(); await region.getByRole("button", { name: "Next" }).isDisabled().catch(() => undefined)
  await expect(region.getByText("page 3 of 3")).toBeVisible(); await expect(region.getByRole("button", { name: "Next" })).toBeDisabled()
  await region.getByRole("button", { name: "Previous" }).click(); await region.getByRole("button", { name: "Previous" }).click()
  // filters are sent to the API
  await region.getByRole("combobox").click(); await page.getByRole("option", { name: "ai", exact: true }).click()
  await expect.poll(() => seen.some((s) => s.includes("service=ai"))).toBe(true)
  await region.getByLabel("Search errors").fill("nothing")
  await expect(region.getByText("No errors match.")).toBeVisible()
  await region.getByLabel("Errors from date").fill("2032-01-01"); await region.getByLabel("Errors to date").fill("2031-01-01")
  await expect(region.getByText("The start date must not be after the end date.")).toBeVisible()
  await region.getByLabel("Errors from date").fill(""); await region.getByLabel("Errors to date").fill("")
  // error state for the errors table
  await page.unroute("**/api/platform/monitoring/errors*")
  await page.route("**/api/platform/monitoring/errors*", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "Something went wrong" } }) }))
  await region.getByLabel("Search errors").fill("again")
  await expect(region.getByText("Could not load errors")).toBeVisible()
  // empty state (nothing recorded)
  await page.unroute("**/api/platform/monitoring/errors*")
  await page.route("**/api/platform/monitoring/errors*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: errorsFor([], 0) }) }))
  await region.getByLabel("Search errors").fill("")
  await expect(region.getByText("No server errors have been recorded in the retention period.")).toBeVisible()
  // ---- database outage on the dashboard: last-known state marked stale, or a clear connection failure; never an invented "healthy"
  await page.unroute("**/api/platform/monitoring?*"); await page.unroute("**/api/platform/monitoring")
  let mode: "ok" | "down" = "ok"
  const down = { status: 503, headers: { "retry-after": "5" }, contentType: "application/json", body: JSON.stringify({ error: { code: "DATABASE_UNAVAILABLE", message: "The database is not reachable right now. Try again in a few seconds", requestId: "req-down-1" } }) }
  await page.route(/\/api\/platform\/monitoring(\?.*)?$/, (r) => (mode === "ok" ? r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: health("healthy", comps) }) }) : r.fulfill(down)))
  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByTestId("stale-warning")).toHaveCount(0)
  await expect(page.getByTestId("connection-failure")).toHaveCount(0)
  await expect(comp(page, "database")).toBeVisible()
  const checkedOk = await page.getByTestId("checked-at").innerText()
  expect(checkedOk).not.toContain("Stale")
  mode = "down"
  await page.getByRole("button", { name: "Refresh" }).click()
  const stale = page.getByTestId("stale-warning")
  await expect(stale).toBeVisible()
  await expect(stale).toContainText("Showing the last known state (stale)")
  await expect(stale).toContainText("database is unavailable")
  await expect(stale).toContainText("may no longer be true")
  await expect(stale).toContainText("req-down-1")
  await expect(page.getByTestId("checked-at")).toContainText("Stale: last checked")          // the time of the last good check is shown
  await expect(comp(page, "database")).toBeVisible()                                        // last-known figures stay on screen...
  await expect(page.locator("[data-stale=true]")).toBeVisible()                             // ...visibly dimmed and marked stale
  await expect(page.getByTestId("connection-failure")).toHaveCount(0)
  mode = "ok"
  await page.getByRole("button", { name: "Refresh" }).click()                               // recovery: warning and stale marking clear by themselves
  await expect(stale).toHaveCount(0)
  await expect(page.getByTestId("checked-at")).not.toContainText("Stale")
  mode = "down"; await page.reload()                                                        // no earlier data in this page load: a clear connection failure, no figures
  const fail = page.getByTestId("connection-failure")
  await expect(fail).toBeVisible()
  await expect(fail).toContainText("Cannot reach the monitoring service")
  await expect(fail).toContainText("database is unavailable")
  await expect(fail).toContainText("Nothing is bypassed")
  await expect(fail).toContainText("/api/health/ready")
  await expect(page.getByText("Overall platform health")).toHaveCount(0)
  await expect(page.locator("[data-testid^=component-]")).toHaveCount(0)
  await expect(page.getByTestId("stale-warning")).toHaveCount(0)
  await page.unroute(/\/api\/platform\/monitoring(\?.*)?$/)
  // health: loading skeleton, then a generic failure with nothing to show
  await page.unroute("**/api/platform/monitoring?*"); await page.unroute("**/api/platform/monitoring")
  await page.route("**/api/platform/monitoring", async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "Something went wrong" } }) }) })
  await page.reload()
  await expect(page.locator("[data-slot=skeleton]").first()).toBeVisible()
  await expect(page.getByText("Cannot reach the monitoring service")).toBeVisible()
  await expect(page.getByText("Overall platform health")).toHaveCount(0)
})

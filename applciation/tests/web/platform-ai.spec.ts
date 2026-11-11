import { expect, test, type Page } from "@playwright/test"
import { createHmac } from "node:crypto"
import { spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"

// Local-only. Needs the isolated stack, `source tests/e2e/stack/env.sh` and the production build (PW_BASE_URL).
const stamp = Date.now().toString().slice(-6)
const ADMIN = { email: `g4uiai${stamp}@example.com`, password: `G4-ui-ai-${stamp}-Pw!` }
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
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString()

test.describe.configure({ mode: "serial" })
test.beforeAll(async () => {
  if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "") || !/localhost|127\.0\.0\.1/.test(process.env.DIRECT_URL ?? "")) throw new Error("Refusing: not the local stack")
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: ADMIN.email, PLATFORM_ADMIN_NAME: "UI AI Admin", PLATFORM_ADMIN_PASSWORD: ADMIN.password } })
  if (r.status !== 0) throw new Error(r.stderr)
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const s = (await anon.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })).data.session!
  const enr = await api(s.access_token, "POST", "/api/platform/mfa/enroll"); totpSecret = enr.j.data.secret
  await api(s.access_token, "POST", "/api/platform/mfa/verify", { factorId: enr.j.data.factorId, code: totp(totpSecret) })
})

const KEY = "gsk_UI_TEST_KEY_Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1Ll2Mm3Nn4"
async function adminIn(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" }); await page.evaluate(() => localStorage.clear())
  await signIn(page, ADMIN.email, ADMIN.password, "/platform/ai")
  await page.waitForURL((u) => u.pathname === "/mfa")
  await page.getByLabel("Code from your authenticator app").fill(totp(totpSecret, 1)); await page.getByRole("button", { name: "Confirm" }).click()
  await page.waitForURL((u) => u.pathname === "/platform/ai")
  await expect(page.getByRole("heading", { name: "AI providers and models" })).toBeVisible()
}

test("a college administrator is refused and sees no AI settings", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" }); await page.evaluate(() => localStorage.clear())
  await signIn(page, process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!, "/platform/ai")
  await page.waitForURL((u) => u.pathname === "/platform/ai")
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await expect(page.getByTestId("ai-global")).toHaveCount(0)
})

test("platform administrator: configure, mask, validate, switch, error and mobile states", async ({ page }) => {
  await adminIn(page)
  // three purposes, fixed providers, global switch on
  for (const [p, prov] of [["TEXT", "Groq"], ["VISION", "Groq"], ["INTERVIEW", "Anthropic"]]) { const c = page.getByTestId(`ai-purpose-${p}`); await expect(c).toBeVisible(); await expect(c).toContainText(prov) }
  await expect(page.getByTestId("ai-global-status")).toHaveText("AI is on")
  await expect(page.getByTestId("ai-active-TEXT")).toContainText("llama-3.3-70b-versatile")

  // validation: a bad model and a bad key disable Save and say why; nothing is sent
  const text = page.getByTestId("ai-purpose-TEXT")
  await text.getByLabel("TEXT model").fill("bad model")
  await expect(text.getByText(/Use letters, digits/)).toBeVisible(); await expect(text.getByRole("button", { name: "Save Text" })).toBeDisabled()
  await text.getByLabel("TEXT model").fill("llama-3.3-70b-versatile")
  await text.getByLabel("TEXT API key").fill("short")
  await expect(text.getByText(/8 to 512 characters/)).toBeVisible(); await expect(text.getByRole("button", { name: "Save Text" })).toBeDisabled()

  // save a key: success, masked, never shown again, field cleared
  await text.getByLabel("TEXT API key").fill(KEY)
  expect(await text.getByLabel("TEXT API key").getAttribute("type")).toBe("password")
  await text.getByRole("button", { name: "Save Text" }).click()
  await expect(page.getByText("Saved; the key was replaced")).toBeVisible()
  await expect(text).toContainText(`stored: •••• ${KEY.slice(-4)}`)
  await expect(text.getByLabel("TEXT API key")).toHaveValue("")
  expect(await page.locator("body").innerText()).not.toContain(KEY)
  expect(await page.content()).not.toContain(KEY)
  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByTestId("ai-purpose-TEXT")).toContainText(`•••• ${KEY.slice(-4)}`)
  expect(await page.content()).not.toContain(KEY)

  // test key (the response is canned: no provider is contacted)
  await page.route("**/api/platform/ai/purposes/TEXT/test", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ok: true, reason: "ok", status: 200, ms: 12, model: "llama-3.3-70b-versatile", modelListed: true, modelCount: 3 } }) }))
  await page.getByTestId("ai-purpose-TEXT").getByRole("button", { name: "Test key" }).click()
  await expect(page.getByTestId("ai-test-TEXT")).toContainText("The key works"); await expect(page.getByTestId("ai-test-TEXT")).toContainText("3 models")
  await page.unroute("**/api/platform/ai/purposes/TEXT/test")

  // per-purpose switch and removing a key
  const vision = page.getByTestId("ai-purpose-VISION")
  await vision.getByRole("switch", { name: "VISION enabled" }).click()
  await vision.getByRole("button", { name: "Save Vision" }).click()
  await expect(page.getByTestId("ai-status-VISION")).toHaveText("Off")
  await page.getByTestId("ai-purpose-TEXT").getByRole("button", { name: "Remove stored key" }).click()
  await expect(page.getByText("Stored key removed")).toBeVisible()
  await expect(page.getByTestId("ai-purpose-TEXT")).not.toContainText("•••• ")

  // the global kill switch needs a confirmation
  await page.getByRole("button", { name: "Switch all AI off" }).click()
  await expect(page.getByText("Switch off every AI feature?")).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click(); await expect(page.getByTestId("ai-global-status")).toHaveText("AI is on")
  await page.getByRole("button", { name: "Switch all AI off" }).click(); await page.getByRole("button", { name: "Yes, switch off" }).click()
  await expect(page.getByTestId("ai-global-status")).toHaveText("All AI is OFF")
  await expect(page.getByTestId("ai-warnings")).toContainText("switched OFF")
  await expect(page.getByTestId("ai-status-TEXT")).toHaveText("Off (global switch)")
  await page.getByRole("button", { name: "Switch AI back on" }).click()
  await expect(page.getByTestId("ai-global-status")).toHaveText("AI is on")

  // a server error on save is shown inside the card, not lost
  await page.route("**/api/platform/ai/purposes/INTERVIEW", (r) => (r.request().method() === "PUT" ? r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "CONFLICT", message: "This configuration was changed by someone else. Reload the page and try again" } }) }) : r.continue()))
  const iv = page.getByTestId("ai-purpose-INTERVIEW"); await iv.getByLabel("INTERVIEW model").fill("claude-test-model"); await iv.getByRole("button", { name: "Save Interview" }).click()
  await expect(page.getByTestId("ai-error-INTERVIEW")).toContainText("changed by someone else")
  await page.unroute("**/api/platform/ai/purposes/INTERVIEW")

  // mobile width: no horizontal scroll, controls reachable
  await page.setViewportSize({ width: 390, height: 800 }); await page.reload({ waitUntil: "networkidle" })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await expect(page.getByTestId("ai-purpose-INTERVIEW").getByRole("button", { name: "Save Interview" })).toBeVisible()

  // load error state, with a skeleton first
  await page.setViewportSize({ width: 1360, height: 1000 })
  await page.route("**/api/platform/ai", async (r) => { await new Promise((x) => setTimeout(x, 1200)); await r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "Something went wrong" } }) }) })
  await page.reload()
  await expect(page.locator("[data-slot=skeleton]").first()).toBeVisible()
  await expect(page.getByTestId("ai-load-error")).toContainText("Could not load the AI settings")
})

const row = (key: string, calls: number, failures = 0, timeouts = 0, rateLimited = 0, blocked = 0, avgMs: number | null = 120) => ({ key, calls, failures, timeouts, rateLimited, blocked, avgMs })
const usageBody = (o: Record<string, unknown> = {}) => ({ data: {
  days: 7, totals: { calls: 1200, failures: 30, timeouts: 5, rateLimited: 2, blocked: 9, avgMs: 340 },
  byPurpose: [row("TEXT", 1000, 20, 3, 1, 5), row("INTERVIEW", 200, 10, 2, 1, 4)], byProvider: [row("GROQ", 1000, 20, 3, 1, 5), row("ANTHROPIC", 200, 10, 2, 1, 4)],
  byModel: [row("llama-3.3-70b-versatile", 1000), row("claude-opus-5-5", 200)], byFeature: [row("jd_parse", 600), row("resume_summary", 400), row("interview_question", 200)],
  trend: [{ day: "2026-11-09", calls: 300, failures: 5, blocked: 0 }, { day: "2026-11-10", calls: 900, failures: 25, blocked: 9 }],
  colleges: { page: 1, pageSize: 20, total: 45, rows: [{ collegeKey: "c-1", name: "Example Engineering College", calls: 700, failures: 10, blocked: 9, avgMs: 300 }, { collegeKey: "platform", name: "Platform", calls: 500, failures: 20, blocked: 0, avgMs: 400 }] },
  today: [{ scope: "provider:GROQ", kind: "provider", key: "GROQ", used: 90, limit: 100, ratio: 0.9 }, { scope: "purpose:TEXT", kind: "purpose", key: "TEXT", used: 10, limit: 100, ratio: 0.1 }], ...o } })
const ok = (b: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(b) })

test("usage and limits: numbers, breakdowns, warnings, empty, error, limit editing and mobile", async ({ page }) => {
  await adminIn(page)
  await page.route("**/api/platform/ai/usage**", (r) => r.fulfill(ok(usageBody())))
  await page.reload({ waitUntil: "networkidle" })
  const u = page.getByTestId("ai-usage")
  await expect(u).toBeVisible()
  await expect(u.getByTestId("ai-stat-calls")).toContainText("1,200"); await expect(u.getByTestId("ai-stat-failed")).toContainText("35"); await expect(u.getByTestId("ai-stat-blocked")).toContainText("9"); await expect(u.getByTestId("ai-stat-avg")).toContainText("340 ms")
  await expect(u.getByTestId("ai-by-provider")).toContainText("GROQ"); await expect(u.getByTestId("ai-by-model")).toContainText("claude-opus-5-5"); await expect(u.getByTestId("ai-by-feature")).toContainText("jd_parse"); await expect(u.getByTestId("ai-by-purpose")).toContainText("INTERVIEW")
  await expect(u.getByTestId("ai-by-college")).toContainText("Example Engineering College"); await expect(u.getByTestId("ai-by-college")).toContainText("Platform")
  await expect(u.getByTestId("ai-trend")).toContainText("2026-11-10")
  await expect(u.getByTestId("ai-limit-warnings")).toContainText("Provider GROQ: 90 of 100 today"); await expect(u.getByTestId("ai-limit-warnings")).not.toContainText("Purpose TEXT")
  await expect(u.getByTestId("ai-college-page")).toHaveText("Page 1 of 3")
  expect(await page.content()).not.toMatch(/gsk_|sk-ant-/)

  // changing the period asks for that period
  const asked: string[] = []
  await page.unroute("**/api/platform/ai/usage**")
  await page.route("**/api/platform/ai/usage**", (r) => { asked.push(r.request().url()); return r.fulfill(ok(usageBody({ days: 30 }))) })
  await u.getByLabel("Usage period").selectOption("30"); await expect.poll(() => asked.some((x) => x.includes("days=30&page=1"))).toBe(true)

  // empty state
  await page.unroute("**/api/platform/ai/usage**")
  await page.route("**/api/platform/ai/usage**", (r) => r.fulfill(ok(usageBody({ totals: { calls: 0, failures: 0, timeouts: 0, rateLimited: 0, blocked: 0, avgMs: null }, byPurpose: [], byProvider: [], byModel: [], byFeature: [], trend: [], today: [], colleges: { page: 1, pageSize: 20, total: 0, rows: [] } }))))
  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByTestId("ai-usage-empty")).toBeVisible(); await expect(page.getByTestId("ai-limit-warnings")).toHaveCount(0)

  // error state with a retry
  await page.unroute("**/api/platform/ai/usage**")
  await page.route("**/api/platform/ai/usage**", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "Something went wrong" } }) }))
  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByTestId("ai-usage-error")).toContainText("Could not load the usage"); await expect(page.getByTestId("ai-usage-error").getByRole("button", { name: "Retry" })).toBeVisible()
  await page.unroute("**/api/platform/ai/usage**")
  await page.route("**/api/platform/ai/usage**", (r) => r.fulfill(ok(usageBody())))
  await page.getByTestId("ai-usage-error").getByRole("button", { name: "Retry" }).click(); await expect(page.getByTestId("ai-stat-calls")).toContainText("1,200")

  // limits use the real API: none to start, invalid input is stopped before it is sent, set two, they survive a reload, remove them
  const lim = page.getByTestId("ai-limits")
  await expect(lim.getByTestId("ai-limits-empty")).toBeVisible()
  await lim.getByLabel("Calls per day").fill("-3"); await expect(lim.getByTestId("ai-limit-invalid")).toBeVisible(); await expect(lim.getByRole("button", { name: "Set limit" })).toBeDisabled()
  await lim.getByLabel("Calls per day").fill("1.5"); await expect(lim.getByRole("button", { name: "Set limit" })).toBeDisabled()
  await lim.getByLabel("Calls per day").fill("10000001"); await expect(lim.getByRole("button", { name: "Set limit" })).toBeDisabled()
  await lim.getByLabel("Calls per day").fill("250"); await expect(lim.getByRole("button", { name: "Set limit" })).toBeEnabled()
  await lim.getByRole("button", { name: "Set limit" }).click()
  await expect(page.getByText("Limit saved")).toBeVisible()
  await expect(lim.getByTestId("ai-limits-table")).toContainText("All institutions"); await expect(lim.getByTestId("ai-limits-table")).toContainText("250")
  await lim.getByLabel("Limit applies to").selectOption("PROVIDER"); await lim.getByLabel("Provider", { exact: true }).selectOption("ANTHROPIC"); await lim.getByLabel("Calls per day").fill("0"); await lim.getByRole("button", { name: "Set limit" }).click()
  await expect(lim.getByTestId("ai-limits-table")).toContainText("ANTHROPIC")
  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByTestId("ai-limits-table")).toContainText("250")
  for (let i = 0; i < 2; i++) { await page.getByTestId("ai-limits-table").getByRole("button", { name: "Remove" }).first().click(); await page.waitForTimeout(500) }
  await expect(page.getByTestId("ai-limits-empty")).toBeVisible()

  // a server refusal is shown, not lost
  await page.route("**/api/platform/ai/limits", (r) => (r.request().method() === "PUT" ? r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests. Try again in 60 seconds" } }) }) : r.continue()))
  await page.getByTestId("ai-limits").getByLabel("Calls per day").fill("7"); await page.getByTestId("ai-limits").getByRole("button", { name: "Set limit" }).click()
  await expect(page.getByTestId("ai-limit-error")).toContainText("Too many requests")
  await page.unroute("**/api/platform/ai/limits")

  // mobile width
  await page.setViewportSize({ width: 390, height: 800 }); await page.reload({ waitUntil: "networkidle" })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await expect(page.getByTestId("ai-stat-calls")).toBeVisible()
})

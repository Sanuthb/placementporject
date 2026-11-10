import { expect, test, type Page } from "@playwright/test"
import { createHmac, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"

// Local-only. Needs the isolated stack, `source tests/e2e/stack/env.sh`, and the production build running (PW_BASE_URL).
const stamp = Date.now().toString().slice(-6)
const ADMIN = { email: `g3uiaudit${stamp}@example.com`, password: `G3-ui-audit-${stamp}-Pw!` }
const SECRET_VALUE = "hunter2-ui-synthetic"
let totpSecret = ""
let pgc: pg.Client
const base = process.env.PW_BASE_URL ?? "http://localhost:3113"

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
async function signIn(page: Page, email: string, password: string, next = "/platform") {
  await page.goto(`/login?next=${next}`, { waitUntil: "networkidle" })
  await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: /^sign in$/i }).click()
}

test.describe.configure({ mode: "serial" })
test.beforeAll(async () => {
  if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "") || !/localhost|127\.0\.0\.1/.test(process.env.DIRECT_URL ?? "")) throw new Error("Refusing: not the local stack")
  const r = spawnSync("npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", env: { ...process.env, PLATFORM_ADMIN_EMAIL: ADMIN.email, PLATFORM_ADMIN_NAME: "UI Audit Admin", PLATFORM_ADMIN_PASSWORD: ADMIN.password } })
  if (r.status !== 0) throw new Error(r.stderr)
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const s = (await anon.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })).data.session!
  const enr = await api(s.access_token, "POST", "/api/platform/mfa/enroll"); totpSecret = enr.j.data.secret
  await api(s.access_token, "POST", "/api/platform/mfa/verify", { factorId: enr.j.data.factorId, code: totp(totpSecret) })
  pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect()
  const id = (await pgc.query(`select id from "PlatformAdmin" where email=$1`, [ADMIN.email])).rows[0].id
  await pgc.query(`insert into "PlatformAuditLog" (id,"adminId",email,action,detail,ip) values ($1,$2,$3,'g3.synthetic.ui',$4,'203.0.113.7')`, [randomUUID(), id, ADMIN.email, JSON.stringify({ password: SECRET_VALUE, note: "visible-ui-note" })])
  await pgc.query(`insert into "PlatformAuditLog" (id,"adminId",email,action,"createdAt") select gen_random_uuid(),$1,$2,'g3.synthetic.uibulk',now() - (g || ' minutes')::interval from generate_series(1,40) g`, [id, ADMIN.email])
})
test.afterAll(async () => { await pgc.query(`delete from "PlatformAuditLog" where action like 'g3.synthetic.%'`); await pgc.end() })

test("anonymous and non-platform users are refused on the page, and see no events", async ({ page, context }) => {
  await page.goto("/platform/audit", { waitUntil: "networkidle" })
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await expect(page.getByText("g3.synthetic")).toHaveCount(0)
  await context.clearCookies()
  await signIn(page, process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!, "/platform/audit")
  await page.waitForURL(/\/(staff|platform)/)
  await page.goto("/platform/audit", { waitUntil: "networkidle" })
  await expect(page.getByText("Platform administrators only")).toBeVisible()   // a college Head TPO is refused by the API
  await expect(page.getByText("g3.synthetic")).toHaveCount(0)
})

test("platform administrator: second step, then the audit log with search, sort, paging, details and masking", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" }); await page.evaluate(() => localStorage.clear())
  await signIn(page, ADMIN.email, ADMIN.password)
  await page.waitForURL((u) => u.pathname === "/mfa")   // enrolled administrators are sent to the second step
  // password-only session: the API refuses the audit log until the second step is done
  await page.goto("/platform/audit", { waitUntil: "networkidle" })
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await expect(page.getByText("Confirm your sign-in")).toBeVisible()
  await page.goto("/mfa?next=/platform", { waitUntil: "networkidle" })
  await page.getByLabel("Code from your authenticator app").fill(totp(totpSecret, 1))
  await page.getByRole("button", { name: "Confirm" }).click()
  await page.waitForURL((u) => u.pathname === "/platform")
  await expect(page.getByRole("heading", { name: "Institutions" })).toBeVisible()
  await page.getByRole("button", { name: "Audit log" }).or(page.getByRole("link", { name: "Audit log" })).first().click()
  await expect(page).toHaveURL(/\/platform\/audit/)
  await expect(page.getByRole("heading", { name: "Platform audit log" })).toBeVisible()
  await expect(page.getByText("Read-only record")).toBeVisible()
  await expect(page.getByText(/\d+ events? · page 1 of/)).toBeVisible()

  // search + empty state
  const search = page.getByLabel("Search audit events")
  await search.fill("g3.synthetic.ui")
  await expect(page.getByText("g3.synthetic.uibulk").first()).toBeVisible()
  await search.fill("zzz-nothing-matches-zzz")
  await expect(page.getByText("No audit events match.")).toBeVisible()
  await search.fill("g3.synthetic.uibulk")
  await expect(page.getByText(/41? events? · page 1 of 2/).or(page.getByText(/40 events · page 1 of 2/))).toBeVisible()

  // paging
  await page.getByRole("button", { name: "Next" }).click()
  await expect(page.getByText(/page 2 of 2/)).toBeVisible()
  await page.getByRole("button", { name: "Previous" }).click()
  await expect(page.getByText(/page 1 of 2/)).toBeVisible()

  // sort toggles the arrow and reverses the order of the first row
  const firstRow = () => page.locator("tbody tr").first().locator("td").nth(0).innerText()
  const newest = await firstRow()
  await page.getByRole("button", { name: /^When/ }).click()
  await expect(page.getByRole("button", { name: /When ▲/ })).toBeVisible()
  await expect.poll(firstRow).not.toBe(newest)

  // details: shows the visible note, hides the credential
  await search.fill("g3.synthetic.ui")
  await page.getByRole("button", { name: /^When/ }).click()   // back to newest first, so the sensitive event (created last) is on page 1
  await expect(page.getByRole("button", { name: /When ▼/ })).toBeVisible()
  await page.locator("tbody tr").filter({ has: page.getByRole("cell", { name: "g3.synthetic.ui", exact: true }) }).getByRole("button", { name: "Details" }).click()
  const dlg = page.getByRole("dialog")
  await expect(dlg).toBeVisible()
  await expect(dlg.getByText("Credentials are hidden")).toBeVisible()
  const html = await dlg.innerText()
  expect(html).not.toContain(SECRET_VALUE)
  expect(html).toContain("[hidden]")
  expect(html).toContain("visible-ui-note")
  expect(html).toContain("203.0.113.7")
  await page.keyboard.press("Escape")
  await expect(dlg).toBeHidden()
  // nothing in the whole page text carries the secret
  expect(await page.locator("body").innerText()).not.toContain(SECRET_VALUE)
})

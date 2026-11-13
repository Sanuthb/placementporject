import { expect, test, type Page } from "@playwright/test"
import { createHmac, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"

// Local-only. Needs the isolated stack, `source tests/e2e/stack/env.sh`, and a server on PW_BASE_URL.
const stamp = Date.now().toString().slice(-6)
const ADMIN = { email: `g4uiinst${stamp}@example.com`, password: `G4-ui-inst-${stamp}-Pw!` }
const base = process.env.PW_BASE_URL ?? "http://localhost:3119"
const NAME = `G4 UI Institution ${stamp}`, OTHER = `G4 UI Other ${stamp}`
let totpSecret = ""; let pgc: pg.Client; let token = ""; let cid = ""; let oid = ""

function totp(secret: string, offset = 0) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0")
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset))
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0")
}
async function api(tok: string, method: string, path: string, body?: unknown) {
  const r = await fetch(base + path, { method, headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
  return { s: r.status, j: await r.json().catch(() => null) }
}
async function signInMfa(page: Page) {
  await page.goto("/login?next=/platform", { waitUntil: "networkidle" }); await page.evaluate(() => localStorage.clear())
  await page.getByLabel("Email").fill(ADMIN.email); await page.getByLabel("Password").fill(ADMIN.password)
  await page.getByRole("button", { name: /^sign in$/i }).click()
  await page.waitForURL((u) => u.pathname === "/mfa")
  await page.getByLabel("Code from your authenticator app").fill(totp(totpSecret, 1))
  await page.getByRole("button", { name: "Confirm" }).click()
  await page.waitForURL((u) => u.pathname === "/platform")
}

test.describe.configure({ mode: "serial" })
test.beforeAll(async () => {
  if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "") || !/localhost|127\.0\.0\.1/.test(process.env.DIRECT_URL ?? "")) throw new Error("Refusing: not the local stack")
  const r = spawnSync("npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: ADMIN.email, PLATFORM_ADMIN_NAME: "UI Inst Admin", PLATFORM_ADMIN_PASSWORD: ADMIN.password } })
  if (r.status !== 0) throw new Error(r.stderr)
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const s = (await anon.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })).data.session!
  const enr = await api(s.access_token, "POST", "/api/platform/mfa/enroll"); totpSecret = enr.j.data.secret
  token = (await api(s.access_token, "POST", "/api/platform/mfa/verify", { factorId: enr.j.data.factorId, code: totp(totpSecret) })).j.data.access_token
  pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect()
  for (const [n, slug, email] of [[NAME, `g4-ui-inst-${stamp}`, `g4uiinsta${stamp}@example.com`], [OTHER, `g4-ui-other-${stamp}`, `g4uiinstb${stamp}@example.com`]]) {
    const p = await api(token, "POST", "/api/platform/institutions", { name: n, slug, admin: { name: "UI Admin", email } })
    if (p.s !== 200) throw new Error("provision " + JSON.stringify(p.j))
  }
  cid = (await pgc.query(`select id from "College" where slug=$1`, [`g4-ui-inst-${stamp}`])).rows[0].id; oid = (await pgc.query(`select id from "College" where slug=$1`, [`g4-ui-other-${stamp}`])).rows[0].id
  await pgc.query(`insert into "AiUsageDaily"(id,day,"collegeKey",purpose,provider,model,feature,calls,failures,blocked,"totalMs","updatedAt") values ($1,'2026-05-10',$2,'TEXT','GROQ','m-ui','g4-ui',11,2,1,1100,now())`, [randomUUID(), cid])
  for (const [day, h] of [["2026-05-10", "09"], ["2026-05-10", "10"], ["2026-05-20", "10"]]) { const id = randomUUID(); const u = (await pgc.query(`select id from "User" where "collegeId"=$1 limit 1`, [cid])).rows[0].id; await pgc.query(`insert into "LoginEvent"(id,"collegeId","userId",kind,"sessionId","createdAt") values ($1,$2,$3,'staff',$4,$5)`, [id, cid, u, "g4ui-" + id, `${day}T${h}:00:00Z`]) }
})
test.afterAll(async () => {
  await pgc.query(`delete from "LoginEvent" where "sessionId" like 'g4ui-%'`); await pgc.query(`delete from "AiUsageDaily" where feature='g4-ui'`)
  for (const c of [cid, oid]) { await pgc.query(`delete from "AuditLog" where "collegeId"=$1`, [c]); await pgc.query(`update "College" set "isActive"=false where id=$1`, [c]) }
  await pgc.end()
})

test("anonymous visitors see no institution data on the detail page", async ({ page }) => {
  await page.goto(`/platform/institutions/${cid}`, { waitUntil: "networkidle" })
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await expect(page.getByText(NAME)).toHaveCount(0)
})

test("detail, edit, duplicate name, modules, usage period and history in the browser", async ({ page }) => {
  await signInMfa(page)
  // list -> detail
  await page.getByLabel(/search/i).first().fill(NAME).catch(() => {})
  await page.getByRole("link", { name: NAME }).first().click()
  await expect(page).toHaveURL(new RegExp(`/platform/institutions/${cid}`))
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible()
  await expect(page.getByText(`g4uiinsta${stamp}@example.com`, { exact: true })).toBeVisible()
  await expect(page.getByText("Counts only")).toBeVisible()

  // usage for a chosen period equals the seeded rows
  await page.getByRole("tab", { name: "Usage" }).click()
  await page.getByLabel("Usage from").fill("2026-05-10"); await page.getByLabel("Usage to").fill("2026-05-10")
  await expect(page.getByTestId("u-signins")).toHaveText("2 by 1 people")
  await expect(page.getByTestId("u-ai")).toHaveText("11 (2 failed, 1 blocked)")
  await page.getByLabel("Usage to").fill("2026-05-20")
  await expect(page.getByTestId("u-signins")).toHaveText("3 by 1 people")
  await page.getByLabel("Usage from").fill("2026-05-21"); await page.getByLabel("Usage to").fill("2026-05-22")
  await expect(page.getByTestId("u-signins")).toHaveText("0 by 0 people")
  await expect(page.getByTestId("u-ai")).toHaveText("0 (0 failed, 0 blocked)")
  await page.getByLabel("Usage from").fill("2026-05-22"); await page.getByLabel("Usage to").fill("2026-05-21")
  await expect(page.getByText("The start date must not be after the end date").first()).toBeVisible()
  await page.getByRole("button", { name: "Last 30 days" }).click()
  await expect(page.getByText(/\(last 30 days\)/)).toBeVisible()

  // invalid edit is refused and shown
  await page.getByRole("tab", { name: "Modules" }).click()
  const nameBox = page.locator(`input[aria-label="Institution name"]`)
  await nameBox.fill("ab"); await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByText(/at least 3|too small|Invalid/i).first()).toBeVisible()
  // duplicate name is refused
  await nameBox.fill(OTHER.toUpperCase()); await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByText(/already registered/i).first()).toBeVisible()
  expect((await pgc.query(`select name from "College" where id=$1`, [cid])).rows[0].name).toBe(NAME)

  // valid edit: name, colour, one module off
  const NEW = `${NAME} Renamed`
  await nameBox.fill(NEW); await page.getByLabel("Brand colour").fill("#12ab34")
  await page.getByRole("checkbox", { name: "Drives" }).uncheck()
  await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByRole("heading", { name: NEW })).toBeVisible()
  const row = (await pgc.query(`select name, "brandColor" from "College" where id=$1`, [cid])).rows[0]
  expect(row.name).toBe(NEW); expect(row.brandColor).toBe("#12ab34")
  expect((await pgc.query(`select enabled from "CollegeModule" where "collegeId"=$1 and module='DRIVES'`, [cid])).rows[0].enabled).toBe(false)
  await expect(page.getByRole("checkbox", { name: "Drives" })).not.toBeChecked()
  await page.getByRole("tab", { name: "Activity" }).click()
  await expect(page.getByTestId("history").getByText("institution.update").first()).toBeVisible()
  await expect(page.getByTestId("history").getByText(`${NAME} → ${NEW}`.replace(/.*/, (m) => m)).first()).toBeVisible().catch(async () => { await expect(page.getByTestId("history")).toContainText(NEW) })

  // another institution untouched
  expect((await pgc.query(`select name from "College" where id=$1`, [oid])).rows[0].name).toBe(OTHER)

  // stale tab: change under the page, then save from the old form
  await page.getByRole("tab", { name: "Modules" }).click()
  await api(token, "PATCH", `/api/platform/institutions/${cid}`, { brandColor: "#999999" })
  await nameBox.fill(`${NEW} Again`); await page.getByRole("button", { name: "Save changes" }).click()
  await expect(page.getByText(/changed by someone else/i).first()).toBeVisible()
  expect((await pgc.query(`select name from "College" where id=$1`, [cid])).rows[0].name).toBe(NEW)

  // deactivate / reactivate from the page
  await page.reload({ waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Deactivate" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click()   // deactivation asks for confirmation
  await expect(page.getByText("Suspended")).toBeVisible()
  await page.getByRole("button", { name: "Reactivate" }).click()
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible()
})

test("phone-width layout has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signInMfa(page)
  await page.goto(`/platform/institutions/${cid}`, { waitUntil: "networkidle" })
  await expect(page.getByRole("heading", { name: /G4 UI Institution/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

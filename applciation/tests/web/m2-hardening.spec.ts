import { createHmac } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"

// Local-only: needs `bash tests/e2e/stack/up.sh`, `node tests/e2e/stack/fixtures-browser.mjs`, a platform admin from `npm run db:platform-admin`
// (platform@e2e.test), and the app running against the stack with RATE_LIMIT_DISABLED=true.
const SHOT = "tests/web/m2-shots/"
const PLATFORM = { email: "platform@e2e.test", password: "Platform-pass-12!" }
const ADMIN = { email: "admin@e2e.test", password: "E2e-admin-pass-1!" }
const FACULTY = { email: "faculty@e2e.test", password: "Faculty-pass-12!" }
const stamp = Date.now().toString(36)

function totp(secret: string, offset = 0) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0")
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset))
  const h = createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}
async function signIn(page: Page, u: { email: string; password: string }, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.getByLabel("Email").fill(u.email)
  await page.getByLabel("Password").fill(u.password)
  await page.getByRole("button", { name: /^sign in$/i }).click()
}
const signOut = async (page: Page) => { await page.evaluate(() => localStorage.clear()); await page.context().clearCookies() }
/** Types a code and presses Confirm; tries this and the next 30-second window, since the last one may already be used. */
async function enterCode(page: Page, secret: string, field: string) {
  for (const off of [0, 1]) {
    await page.getByLabel(field).fill(totp(secret, off))
    await page.getByRole("button", { name: "Confirm" }).click()
    try { await expect(page.getByText(/not right/i)).toBeVisible({ timeout: 3000 }) } catch { return }
  }
}

test.describe.configure({ mode: "serial" })
let secret = ""

test("platform: signed out, then mandatory MFA enrolment before any access", async ({ page }) => {
  await page.goto("/platform")
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await page.screenshot({ path: SHOT + "01-platform-signed-out.png" })

  await signIn(page, PLATFORM, "/platform")
  await expect(page.getByText("Set up two-step sign-in").first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Platform dashboard" })).toHaveCount(0) // nothing of the platform is shown before enrolment
  await page.screenshot({ path: SHOT + "02-platform-mfa-setup-required.png" })

  await page.getByRole("button", { name: /set up authenticator/i }).click()
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible()
  secret = (await page.locator("code").first().innerText()).trim()
  await page.screenshot({ path: SHOT + "03-platform-mfa-qr.png" })

  await page.getByLabel("Code from the app").fill("000000")
  await page.getByRole("button", { name: "Confirm" }).click()
  await expect(page.getByText(/not right/i)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Platform dashboard" })).toHaveCount(0) // a wrong code lets nothing through

  await page.getByLabel("Code from the app").fill(totp(secret))
  await page.getByRole("button", { name: "Confirm" }).click()
  await expect(page.getByRole("heading", { name: "Platform dashboard" })).toBeVisible()
  await page.screenshot({ path: SHOT + "04-platform-landing.png" })
})

test("platform: provisioning form, validation and result", async ({ page }) => {
  await signIn(page, PLATFORM, "/platform")
  // fresh password sign-in is a challenge, not access
  await expect(page.getByText("Confirm it is you")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Platform dashboard" })).toHaveCount(0)
  await page.screenshot({ path: SHOT + "05-platform-challenge.png" })
  await page.getByLabel("Code from your authenticator app").fill("111111")
  await page.getByRole("button", { name: "Confirm" }).click()
  await expect(page.getByText(/not right/i)).toBeVisible()
  await enterCode(page, secret, "Code from your authenticator app")
  await expect(page.getByRole("heading", { name: "Platform dashboard" })).toBeVisible()

  // institutions are managed on their own page; the form opens from "New institution"
  await page.getByRole("link", { name: "Institutions", exact: true }).first().click()
  await page.getByRole("button", { name: "New institution" }).click()
  await page.getByLabel("Institution name").fill(`Browser Test Institute ${stamp}`)
  await page.getByLabel("Administrator name").fill("Browser Admin")
  await page.getByLabel("Administrator email").fill(`browser-${stamp}@example.com`)
  await page.getByLabel(/Starting departments/).fill("CSE Computer Science")
  await page.getByRole("button", { name: "Create institution" }).click()
  await expect(page.getByText(/Institution created/)).toBeVisible()
  await expect(page.getByText(`Browser Test Institute ${stamp}`)).toBeVisible()
  await page.screenshot({ path: SHOT + "06-platform-provisioned.png" })

  // duplicate address -> error state
  await page.getByRole("button", { name: "New institution" }).click()
  await page.getByLabel("Institution name").fill(`Browser Test Institute ${stamp}`)
  await page.getByLabel("Administrator name").fill("Browser Admin")
  await page.getByLabel("Administrator email").fill(`browser2-${stamp}@example.com`)
  await page.getByRole("button", { name: "Create institution" }).click()
  await expect(page.getByText(/already exists/i)).toBeVisible()
  await page.screenshot({ path: SHOT + "07-platform-duplicate-error.png" })
})

test("college admin: refused at /platform; Universities and Faculty tabs; mentor workflow", async ({ page }) => {
  await signIn(page, ADMIN, "/platform")
  await expect(page.getByText("Platform administrators only")).toBeVisible() // a TPO admin is not a platform admin
  await page.screenshot({ path: SHOT + "08-tpo-at-platform.png" })

  await page.goto("/staff/settings#universities")
  await expect(page.getByRole("heading", { name: "Universities" })).toBeVisible()
  await page.screenshot({ path: SHOT + "09-universities-empty.png" })
  await page.getByRole("button", { name: /add university/i }).click()
  await page.getByLabel("Name").fill(`Browser University ${stamp}`)
  await page.getByLabel("Code").fill(`BU${stamp}`.slice(0, 12))
  await page.getByRole("button", { name: /^save$/i }).click()
  await expect(page.getByText(`Browser University ${stamp}`)).toBeVisible()
  await page.screenshot({ path: SHOT + "10-universities-added.png" })

  await page.goto("/staff/settings#faculty")
  await expect(page.getByText("Fiona Faculty")).toBeVisible()
  await page.screenshot({ path: SHOT + "11-faculty-list.png" })
  // allocate departments, programme and batch
  await page.getByRole("button", { name: "Edit Fiona Faculty" }).click()
  await page.getByLabel(/Computer Science/).first().check()
  await page.getByLabel("Bachelor of Engineering").check()
  await page.getByLabel("2021-2025").check()
  await page.screenshot({ path: SHOT + "12-faculty-allocation.png" })
  await page.getByRole("button", { name: /^save$/i }).click()
  await expect(page.getByText("Saved")).toBeVisible()

  // mentor workflow
  await page.getByRole("button", { name: "Mentees of Fiona Faculty" }).click()
  await expect(page.getByText("No mentees yet.")).toBeVisible()
  await page.screenshot({ path: SHOT + "13-mentees-empty.png" })
  await page.getByLabel("Find a student to assign").fill("Asha")
  await expect(page.getByText("Asha Mentee")).toBeVisible()
  await page.getByRole("button", { name: "Assign" }).click()
  await expect(page.getByText("Mentor assigned")).toBeVisible()
  await page.getByLabel("Find a student to assign").fill("zzzz-none")
  await expect(page.getByText("No student matches.")).toBeVisible()
  await page.getByRole("button", { name: "History for Asha Mentee" }).click()
  await expect(page.getByText(/no mentor → Fiona Faculty/)).toBeVisible()
  await page.screenshot({ path: SHOT + "14-mentee-history.png" })
  await page.getByRole("button", { name: "Unassign" }).click()
  await expect(page.getByText("Mentor removed")).toBeVisible()
  await expect(page.getByText("No mentees yet.")).toBeVisible()
  // assign again so the faculty page has a mentee to show
  await page.getByLabel("Find a student to assign").fill("Asha")
  await page.getByRole("button", { name: "Assign" }).click()
  await expect(page.getByText("Mentor assigned")).toBeVisible()
})

test("faculty: lands on the faculty page, sees only allocated students, no placement screens", async ({ page }) => {
  await signIn(page, FACULTY, "/staff")
  await expect(page).toHaveURL(/\/staff\/faculty/)
  await expect(page.getByText("Welcome, Fiona Faculty")).toBeVisible()
  await expect(page.getByText("Asha Mentee")).toBeVisible()
  await expect(page.getByRole("link", { name: "Drives" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0)
  await page.screenshot({ path: SHOT + "15-faculty-home.png" })
  await page.goto("/staff/drives")
  await expect(page.getByText(/do not have access|Could not|forbidden/i).first()).toBeVisible()
  await page.screenshot({ path: SHOT + "16-faculty-drives-refused.png" })
})

test("platform: removing the authenticator locks access until re-enrolment", async ({ page }) => {
  await signIn(page, PLATFORM, "/platform")
  await enterCode(page, secret, "Code from your authenticator app")
  await expect(page.getByRole("heading", { name: "Platform dashboard" })).toBeVisible()
  await page.getByRole("link", { name: "Administrator Account" }).click()   // two-step settings live on the account page
  await page.getByRole("button", { name: "Remove authenticator" }).click()
  for (const off of [1, 2]) {
    await page.getByLabel("Current code").fill(totp(secret, off))
    await page.getByRole("button", { name: "Confirm" }).click()
    try { await expect(page.getByText(/Set up two-step sign-in/).first()).toBeVisible({ timeout: 6000 }); break } catch { /* try the next window */ }
  }
  await expect(page.getByText("Set up two-step sign-in").first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Platform dashboard" })).toHaveCount(0)
  await page.screenshot({ path: SHOT + "17-platform-after-removal.png" })
})

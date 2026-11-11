import { expect, test, type Page } from "@playwright/test"
import { blockNonLocal, requireLocalBrowserEnv } from "./lib/local-only"

/**
 * One end-to-end browser test of the main staff flow.
 *
 *   signed out -> sign in -> create a department, batch and student -> add a company -> visit every main
 *   screen and check none shows an error -> sign out.
 *
 * It signs in with the local demo admin (SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD from the environment or `.env.local`, created by tests/e2e/stack/up.sh) and CREATES records (prefixed "PW ").
 * LOCAL ONLY, fail-closed: it refuses to run unless every database and Auth target resolves to localhost and the app under test (PW_BASE_URL, default the config's own server on :3115)
 * is on this machine; `.env.seed` and a bare `.env` are never read; and the browser is not allowed to reach any non-local host during the test (see tests/web/lib/local-only.ts).
 * Set PW_ALLOW=1 to run it. Set PW_SMOKE_ONLY=1 to run just the signed-out part, which writes nothing.
 */
const stamp = Date.now().toString(36).toUpperCase()
const dept = { name: `PW Department ${stamp}`, code: `PW${stamp}`.slice(0, 12) }
const batch = `PW ${stamp}`
const student = { enrollmentNo: `PW-${stamp}`, name: `PW Student ${stamp}`, email: `pw.${stamp.toLowerCase()}@example.com` }
const company = `PW Company ${stamp}`

const screens: [string, RegExp][] = [
  ["/staff", /Needs your attention|Students/],
  ["/staff/students", /Invite student/],
  ["/staff/verification", /Nothing waiting|Review/],
  ["/staff/companies", /Add company/],
  ["/staff/drives", /Create drive|No drives yet/],
  ["/staff/offers", /No offers yet|Package/],
  ["/staff/blocking", /Active blocks/],
  ["/staff/analytics", /Placement overview/],
  ["/staff/communications", /Announcements/],
  ["/staff/tickets", /No requests|Request/],
  ["/staff/reports", /Placement report/],
  ["/staff/approvals", /No requests|Request/],
  ["/staff/settings", /Departments/],
  ["/staff/audit", /Action/],
]

function seedLogin() {
  const email = process.env.SEED_ADMIN_EMAIL, password = process.env.SEED_ADMIN_PASSWORD
  if (!email || !password) throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are needed (they come from .env.local, written for the local stack)")
  return { email, password }
}

async function choose(page: Page, scope: ReturnType<Page["getByRole"]>, placeholder: string, option: string) {
  await scope.getByRole("combobox").filter({ hasText: placeholder }).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

test("placement officer: sign in, set up, add a student and company, visit the main screens, sign out", async ({ page, baseURL }) => {
  requireLocalBrowserEnv(baseURL)                       // fail closed before anything else happens
  const blocked = await blockNonLocal(page)             // and the browser may not leave this machine
  const problems: string[] = []
  page.on("pageerror", (e) => problems.push(`script error: ${e.message}`))

  await test.step("signed out: protected pages send you to sign in", async () => {
    await page.goto("/staff")
    await expect(page).toHaveURL(/\/login\?next=%2Fstaff/)
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
    await page.goto("/auth/accept-invite")
    await expect(page.getByText(/invalid or has expired/)).toBeVisible()
    await page.goto("/design")
    await expect(page.getByRole("heading", { name: "Design reference" })).toBeVisible()
  })
  if (process.env.PW_SMOKE_ONLY) return
  test.skip(!process.env.PW_ALLOW, "This test creates data in the LOCAL stack. Set PW_ALLOW=1 (the local Docker stack must be up).")

  await test.step("sign in as the admin", async () => {
    const { email, password } = seedLogin()
    await page.goto("/login")
    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/staff$/)
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible()
  })

  await test.step("settings: add a department and a batch", async () => {
    await page.goto("/staff/settings")
    await page.getByRole("button", { name: "Add department" }).click()
    let dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name").fill(dept.name)
    await dialog.getByLabel("Code").fill(dept.code)
    await dialog.getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("cell", { name: dept.name })).toBeVisible()

    await page.getByRole("tab", { name: "Batches" }).click()
    await page.getByRole("button", { name: "Add batch" }).click()
    dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name (for example 2026)").fill(batch)
    await dialog.getByLabel("Start year").fill("2022")
    await dialog.getByLabel("End year").fill("2026")
    await dialog.getByRole("button", { name: "Save" }).click()
    await expect(page.getByRole("cell", { name: batch })).toBeVisible()
  })

  await test.step("students: invite one and find it in the list", async () => {
    await page.goto("/staff/students")
    await page.getByRole("link", { name: "Invite student" }).click()
    await page.getByLabel("Student full name").fill(student.name)
    await page.getByLabel("Admission number").fill(student.enrollmentNo)
    await page.getByLabel("College email address").fill(student.email)
    await choose(page, page.locator("body"), "Choose a department", dept.name)
    await choose(page, page.locator("body"), "Choose a batch", batch)
    await page.getByRole("button", { name: "Send invitation" }).click()
    await expect(page.getByText(/Invitation sent to|The student was added but the email could not be sent/)).toBeVisible()
    await page.getByPlaceholder("Search name, admission no, email").fill(student.enrollmentNo)
    await expect(page.getByRole("link", { name: student.name })).toBeVisible()
    await expect(page.getByText(/Sent|Pending/).first()).toBeVisible()
    await page.getByRole("link", { name: student.name }).click()
    await expect(page.getByText(student.email).first()).toBeVisible()
  })

  await test.step("companies: add one", async () => {
    await page.goto("/staff/companies")
    await page.getByRole("button", { name: "Add company" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name").fill(company)
    await dialog.getByRole("button", { name: "Add company" }).click()
    await expect(page.getByRole("link", { name: company })).toBeVisible()
  })

  await test.step("every main screen loads without an error", async () => {
    for (const [path, expected] of screens) {
      await page.goto(path)
      await expect(page.getByText(expected).first(), `${path} should show its content`).toBeVisible()
      await expect(page.getByText(/Could not load/), `${path} should not show a load error`).toHaveCount(0)
    }
  })

  await test.step("sign out", async () => {
    await page.goto("/staff")
    await page.getByRole("button", { name: /@/ }).click()
    await page.getByRole("menuitem", { name: "Log out" }).click()
    await expect(page).toHaveURL(/\/login/)
  })

  expect(problems, "no script errors in the browser").toEqual([])
  expect(blocked(), "the browser never tried to reach a non-local host").toEqual([])
})

import { expect, test } from "@playwright/test"

/**
 * Browser test of the student side.
 *
 * The signed-out part needs nothing and writes nothing (it also runs with PW_SMOKE_ONLY=1).
 * The signed-in part needs a real student account that is already onboarded, given at run time:
 *
 *   PW_STUDENT_EMAIL=... PW_STUDENT_PASSWORD=... PW_ALLOW=1 npx playwright test student-flow
 *
 * It changes little: it opens every student screen, saves and un-saves one drive if there is one, and flips an email
 * preference and back. Credentials are read from the environment only and are never stored.
 */
const screens = [
  "/student", "/student/profile", "/student/overview", "/student/drives", "/student/applications", "/student/offers", "/student/calendar", "/student/blocks",
  "/student/assessments", "/student/personality", "/student/prep", "/student/learning", "/student/internships", "/student/events", "/student/job-alerts",
  "/student/showcase", "/student/notifications", "/student/help", "/student/support", "/student/status", "/student/privacy", "/student/resume",
]

test("student: signed-out checks, then every student screen", async ({ page }) => {
  const problems: string[] = []
  page.on("pageerror", (e) => problems.push(`script error: ${e.message}`))

  await test.step("signed out: student pages send you to sign in", async () => {
    await page.goto("/student")
    await expect(page).toHaveURL(/\/login\?next=%2Fstudent/)
  })

  await test.step("sign-in page offers a one-time code and can go back to a password", async () => {
    await page.goto("/login")
    await page.getByRole("button", { name: "Email me a one-time code instead" }).click()
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible()
    await expect(page.getByLabel("Password")).toHaveCount(0)
    await page.getByRole("button", { name: "Use my password instead" }).click()
    await expect(page.getByLabel("Password")).toBeVisible()
  })

  if (process.env.PW_SMOKE_ONLY) return
  const email = process.env.PW_STUDENT_EMAIL, password = process.env.PW_STUDENT_PASSWORD
  test.skip(!process.env.PW_ALLOW || !email || !password, "Set PW_ALLOW=1, PW_STUDENT_EMAIL and PW_STUDENT_PASSWORD to run the signed-in part.")

  await test.step("sign in as the student", async () => {
    await page.goto("/login")
    await page.getByLabel("Email").fill(email!)
    await page.getByLabel("Password").fill(password!)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/student$/)
  })

  await test.step("every student screen loads without an error", async () => {
    for (const path of screens) {
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(/Could not load|Something went wrong/), `${path} should not show an error`).toHaveCount(0)
      await expect(page.getByRole("main").or(page.locator("body")), `${path} should render`).not.toBeEmpty()
    }
  })

  await test.step("drives: save and un-save the first drive, if there is one", async () => {
    await page.goto("/student/drives")
    await page.waitForLoadState("networkidle")
    const save = page.getByRole("button", { name: "Save for later" }).first()
    if (await save.count()) {
      await save.click()
      await page.getByRole("tab", { name: "Saved" }).click()
      await expect(page.getByRole("button", { name: "Remove from saved" }).first()).toBeVisible()
      await page.getByRole("button", { name: "Remove from saved" }).first().click()
    }
  })

  await test.step("privacy: change an email preference and put it back", async () => {
    await page.goto("/student/privacy")
    const sw = page.getByRole("switch", { name: "Announcements and job alerts" })
    await expect(sw).toBeEnabled()
    const before = await sw.getAttribute("aria-checked")
    await sw.click()
    await expect(sw).not.toHaveAttribute("aria-checked", before ?? "")
    await sw.click()
    await expect(sw).toHaveAttribute("aria-checked", before ?? "true")
  })

  expect(problems, "no script errors in the browser").toEqual([])
})

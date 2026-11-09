import { expect, test, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"

// Local-only (refuses anything else): needs the isolated stack, `source tests/e2e/stack/env.sh`, and the app running against it with RATE_LIMIT_DISABLED=true.
const SHOT = "tests/web/m3-shots/"
const stamp = Date.now().toString(36)
const STUDENT = { email: `m3ui${stamp}@example.com`, password: `Stud-${stamp}-pw!1` }
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? "admin@e2e.test", password: process.env.SEED_ADMIN_PASSWORD ?? "" }
let studentId = ""

async function signIn(page: Page, u: { email: string; password: string }) {
  await page.goto("/login", { waitUntil: "networkidle" })   // in dev the form can be clicked before React has attached to it, and the click is lost
  await page.getByLabel("Email").fill(u.email)
  await page.getByLabel("Password").fill(u.password)
  await page.getByRole("button", { name: /^sign in$/i }).click()
}

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "") || !/localhost|127\.0\.0\.1/.test(process.env.DIRECT_URL ?? "")) throw new Error("Refusing: not the local stack")
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const c = new pg.Client({ connectionString: process.env.DIRECT_URL }); await c.connect()
  try {
    const col = (await c.query(`select id from "College" where slug='demo-college'`)).rows[0].id
    const { data, error } = await sb.auth.admin.createUser({ email: STUDENT.email, password: STUDENT.password, email_confirm: true })
    if (error) throw new Error(error.message)
    const q = async (sql: string, a: unknown[]) => (await c.query(sql, a)).rows[0].id
    const dept = await q(`select id from "Department" where code='CSE' and "collegeId"=$1`, [col])
    const prog = await q(`select id from "Program" where code='BE' and "collegeId"=$1`, [col])
    const batch = await q(`select id from "Batch" where name='2021-2025' and "collegeId"=$1`, [col])
    studentId = (await c.query(`insert into "Student"(id,"collegeId","enrollmentNo",name,email,"departmentId","programId","batchId","userId","inviteStatus","updatedAt") values (gen_random_uuid(),$1,$2,'M3 Ui Student',$3,$4,$5,$6,$7,'ACTIVATED',now()) returning id`, [col, `M3UI${stamp}`, STUDENT.email, dept, prog, batch, data.user.id])).rows[0].id
  } finally { await c.end() }
})

test("student: the academics page shows the record panels and saves a semester with its subjects", async ({ page }) => {
  await signIn(page, STUDENT)
  await page.waitForURL(/\/student/)
  await page.goto("/student/profile/ACADEMICS")
  await expect(page.getByRole("heading", { name: "Semester results" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Backlog history" })).toBeVisible()
  await expect(page.getByText("No semesters added yet.")).toBeVisible()
  await expect(page.getByText("No backlogs listed.")).toBeVisible()
  await page.screenshot({ path: SHOT + "01-academics-empty.png", fullPage: true })

  await page.getByRole("button", { name: "Add semester" }).click()
  const dlg = page.getByRole("dialog")
  await dlg.getByLabel(/^Semester/).fill("1")
  await dlg.getByLabel("SGPA (0 to 10)").fill("8.5")
  await dlg.getByRole("button", { name: "Add subject" }).click()
  await dlg.getByLabel("Subject", { exact: true }).fill("Mathematics")
  await dlg.getByLabel("Marks obtained").fill("120")
  await dlg.getByLabel("Maximum marks").fill("100")
  await dlg.getByRole("button", { name: "Save semester" }).click()
  await expect(page.getByText(/cannot exceed the maximum/i).first()).toBeVisible()   // refused on screen, nothing saved
  await dlg.getByLabel("Marks obtained").fill("80")
  await expect(dlg.getByText("Total 80%")).toBeVisible()                              // percentage is calculated, not typed
  await page.screenshot({ path: SHOT + "02-semester-dialog.png" })
  await dlg.getByRole("button", { name: "Save semester" }).click()
  await expect(page.getByText("Semester 1").first()).toBeVisible()
  await expect(page.getByText(/Mathematics: 80\/100/)).toBeVisible()
  await expect(page.getByText(/SGPA 8.5/)).toBeVisible()
})

test("student: a backlog keeps every attempt, and clearing it adds one rather than replacing", async ({ page }) => {
  await signIn(page, STUDENT)
  await page.waitForURL(/\/student/)
  await page.goto("/student/profile/ACADEMICS")
  await page.getByRole("button", { name: "Add backlog subject" }).click()
  let dlg = page.getByRole("dialog")
  await dlg.getByLabel(/^Subject/).fill("Data Structures")
  await dlg.getByLabel(/^Failed in semester/).fill("2")
  await dlg.getByLabel("Exam session").fill("Nov 2024")
  await dlg.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText("Data Structures").first()).toBeVisible()
  await expect(page.getByText(/Attempt 1 \(Nov 2024\): not cleared/)).toBeVisible()

  await page.getByRole("button", { name: "Add attempt" }).click()
  dlg = page.getByRole("dialog")
  await dlg.getByRole("combobox").first().click()
  await page.getByRole("option", { name: "Cleared", exact: true }).click()
  await dlg.getByLabel(/^Cleared in semester/).fill("1")                              // before it was failed: refused
  await dlg.getByRole("button", { name: "Add attempt" }).click()
  await expect(page.getByText(/semester 2 or later/i).first()).toBeVisible()
  await dlg.getByLabel(/^Cleared in semester/).fill("4")
  await dlg.getByRole("button", { name: "Add attempt" }).click()
  await expect(page.getByText(/Attempt 1 \(Nov 2024\): not cleared/)).toBeVisible()  // the failure is still there
  await expect(page.getByText(/Attempt 2.*cleared in semester 4/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Add attempt" })).toHaveCount(0)      // a cleared subject takes no more
  await page.screenshot({ path: SHOT + "03-backlog-history.png", fullPage: true })
})

test("student: submitting locks the records, and the layout holds on a phone", async ({ page }) => {
  await signIn(page, STUDENT)
  await page.waitForURL(/\/student/)
  await page.goto("/student/profile/ACADEMICS")
  await page.getByLabel("CGPA (out of 10)").fill("8")
  await page.getByLabel("10th percentage").fill("85")
  await page.getByLabel("12th percentage").fill("85")
  await page.getByLabel("Active backlogs").fill("0")
  await page.getByRole("button", { name: "Submit for review" }).click()
  await expect(page).toHaveURL(/\/student\/profile$/)
  await page.goto("/student/profile/ACADEMICS")
  await expect(page.getByText("Waiting for review")).toBeVisible()
  await expect(page.getByRole("button", { name: "Add semester" })).toHaveCount(0)    // locked while staff review
  await expect(page.getByRole("button", { name: "Add backlog subject" })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole("heading", { name: "Semester results" })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)                                              // no sideways scrolling
  await page.screenshot({ path: SHOT + "04-locked-mobile.png", fullPage: true })
})

test("student: the education page lists qualifications with their review state", async ({ page }) => {
  await signIn(page, STUDENT)
  await page.waitForURL(/\/student/)
  await page.goto("/student/profile/EDUCATION_HISTORY")
  await expect(page.getByRole("heading", { name: "Qualifications" })).toBeVisible()
  await expect(page.getByText("Nothing added yet.")).toBeVisible()
  await page.screenshot({ path: SHOT + "05-education.png" })
})

test("staff: the student's records show with their review state", async ({ page }) => {
  test.skip(!ADMIN.password, "SEED_ADMIN_PASSWORD not set")
  await signIn(page, ADMIN)
  await page.waitForURL(/\/staff/)
  await page.goto(`/staff/students/${studentId}`)
  await page.getByRole("tab", { name: /education/i }).click()
  await expect(page.getByText("No education records yet.")).toBeVisible()            // the qualification list finished loading (not stuck)
  await expect(page.getByRole("heading", { name: "Semester results" })).toBeVisible()
  await expect(page.getByText("Semester 1").first()).toBeVisible()
  await expect(page.getByText("Submitted").first()).toBeVisible()
  await expect(page.getByText("Data Structures").first()).toBeVisible()
  await expect(page.getByText(/cleared in semester 4/)).toBeVisible()
  await page.screenshot({ path: SHOT + "06-staff-view.png", fullPage: true })
})

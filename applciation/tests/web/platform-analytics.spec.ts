import { expect, test, type Page } from "@playwright/test"
import { createHmac, randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"

// Local-only. Needs the isolated stack, `source tests/e2e/stack/env.sh` and the production build (PW_BASE_URL).
const stamp = Date.now().toString().slice(-6)
const ADMIN = { email: `g3uiana${stamp}@example.com`, password: `G3-ui-ana-${stamp}-Pw!` }
const NAME = `AAA UI Analytics ${stamp}`
const base = process.env.PW_BASE_URL ?? "http://localhost:3113"
let totpSecret = ""
let pgc: pg.Client
let collegeId = ""

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
const q1 = async (sql: string, p: unknown[] = []) => (await pgc.query(sql, p)).rows[0]
const fmt = (n: number) => n.toLocaleString("en-US")
async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${next}`, { waitUntil: "networkidle" })
  await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: /^sign in$/i }).click()
}
/** The text of one summary card, looked up by its label inside a named section. */
const tableRows = (page: Page) => page.getByRole("region", { name: "Institution-wise statistics" }).locator("tbody tr")
const card = (page: Page, section: string, label: string) => page.getByRole("region", { name: section }).locator("[data-slot=card]").filter({ hasText: label }).first()

test.describe.configure({ mode: "serial" })
test.beforeAll(async () => {
  if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "") || !/localhost|127\.0\.0\.1/.test(process.env.DIRECT_URL ?? "")) throw new Error("Refusing: not the local stack")
  const r = spawnSync("npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", env: { ...process.env, PLATFORM_ADMIN_EMAIL: ADMIN.email, PLATFORM_ADMIN_NAME: "UI Analytics Admin", PLATFORM_ADMIN_PASSWORD: ADMIN.password } })
  if (r.status !== 0) throw new Error(r.stderr)
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const s = (await anon.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })).data.session!
  const enr = await api(s.access_token, "POST", "/api/platform/mfa/enroll"); totpSecret = enr.j.data.secret
  await api(s.access_token, "POST", "/api/platform/mfa/verify", { factorId: enr.j.data.factorId, code: totp(totpSecret) })
  pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect()
  // a known institution: 6 students (4 registered and active, 2 of them placed; 1 opted out; 1 archived), 3 staff, 2 recruiters, 2 drives, 3 applications, 2 offers
  collegeId = (await q1(`insert into "College" (id,name,slug,"updatedAt") values (gen_random_uuid(),$1,$2,now()) returning id`, [NAME, `ui-ana-${stamp}`])).id
  const dept = (await q1(`insert into "Department" (id,"collegeId",name,code,"updatedAt") values (gen_random_uuid(),$1,'D','D',now()) returning id`, [collegeId])).id
  const batch = (await q1(`insert into "Batch" (id,"collegeId",name,"startYear","endYear") values (gen_random_uuid(),$1,'B',2022,2026) returning id`, [collegeId])).id
  const comp = (await q1(`insert into "Company" (id,"collegeId",name,"updatedAt") values (gen_random_uuid(),$1,'Co',now()) returning id`, [collegeId])).id
  const st: string[] = []
  const specs = [[true, false, "REGISTERED", true], [true, false, "REGISTERED", true], [true, false, "REGISTERED", false], [true, false, "REGISTERED", false], [true, false, "OPTED_OUT", false], [true, true, "REGISTERED", true]] as const
  for (const [i, [active, arch, part, placed]] of specs.entries()) st.push((await q1(`insert into "Student" (id,"collegeId",name,email,"enrollmentNo","departmentId","batchId","isActive","isArchived","participationStatus","isPlaced","updatedAt") values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9::"ParticipationStatus",$10,now()) returning id`, [collegeId, `UI Student ${i}`, `ui${stamp}${i}@example.org`, `UI${stamp}${i}`, dept, batch, active, arch, part, placed])).id)
  for (let i = 0; i < 3; i++) await pgc.query(`insert into "User" (id,"collegeId",email,name,role,"extraRoles","updatedAt") values (gen_random_uuid(),$1,$2,'UI Staff','FACULTY','{}',now())`, [collegeId, `uistaff${stamp}${i}@example.org`])
  for (let i = 0; i < 2; i++) await pgc.query(`insert into "Recruiter" (id,"collegeId","companyId",email,name) values (gen_random_uuid(),$1,$2,$3,'UI Rec')`, [collegeId, comp, `uirec${stamp}${i}@example.org`])
  const dr: string[] = []
  for (const status of ["PUBLISHED", "CLOSED"]) dr.push((await q1(`insert into "Drive" (id,"collegeId","companyId",role,"jobType","applicationDeadline","driveDate",status,"createdById","updatedAt") values (gen_random_uuid(),$1,$2,'Eng','FULL_TIME',now(),now(),$3::"DriveStatus",gen_random_uuid(),now()) returning id`, [collegeId, comp, status])).id)
  for (const [d, s] of [[dr[0], st[0]], [dr[0], st[1]], [dr[1], st[0]]]) await pgc.query(`insert into "Application" (id,"collegeId","driveId","studentId","updatedAt") values (gen_random_uuid(),$1,$2,$3,now())`, [collegeId, d, s])
  for (const s of [st[0], st[1]]) await pgc.query(`insert into "Offer" (id,"collegeId","studentId","companyId",role,"packageLpa",status,"createdById","updatedAt") values (gen_random_uuid(),$1,$2,$3,'Eng',6,'ACCEPTED',gen_random_uuid(),now())`, [collegeId, s, comp])
})
test.afterAll(async () => { for (const t of ["Offer", "Application", "Drive", "Recruiter", "Company", "User", "Student"]) await pgc.query(`delete from "${t}" where "collegeId"=$1`, [collegeId]).catch(() => 0); await pgc.query(`delete from "College" where id=$1`, [collegeId]).catch(() => 0); await pgc.end() })

test("anonymous and a college administrator are refused and see no figures", async ({ page, context }) => {
  await page.goto("/platform/analytics", { waitUntil: "networkidle" })
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await expect(page.getByText("Registered institutions")).toHaveCount(0)
  await context.clearCookies()
  await signIn(page, process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!, "/platform/analytics")
  await page.waitForURL((u) => u.pathname === "/platform/analytics")   // signed in as a college Head TPO, sent on to the page
  await expect(page.getByText("Platform administrators only")).toBeVisible()
  await expect(page.getByText("Registered institutions")).toHaveCount(0)
})

test("platform administrator: dashboard figures equal the database, filters, empty/loading/error states", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" }); await page.evaluate(() => localStorage.clear())
  await signIn(page, ADMIN.email, ADMIN.password, "/platform/analytics")
  await page.waitForURL((u) => u.pathname === "/mfa")
  await page.goto("/platform/analytics", { waitUntil: "networkidle" })   // password-only session: refused until the second step
  await expect(page.getByText("Confirm your sign-in")).toBeVisible()
  await page.goto("/mfa?next=/platform/analytics", { waitUntil: "networkidle" })
  await page.getByLabel("Code from your authenticator app").fill(totp(totpSecret, 1))
  await page.getByRole("button", { name: "Confirm" }).click()
  await page.waitForURL((u) => u.pathname === "/platform/analytics")
  await expect(page.getByRole("heading", { name: "Platform analytics" })).toBeVisible()

  // --- every headline figure equals an independent database count
  const db = await q1(`select (select count(*) from "College")::int inst, (select count(*) from "College" where "isActive")::int act, (select count(*) from "College" where not "isActive")::int sus,
    (select count(*) from "Student")::int stu, (select count(*) from "User")::int staff, (select count(*) from "Recruiter")::int rec, (select count(*) from "PlatformAdmin")::int adm,
    (select count(*) from "Drive" where status<>'DRAFT')::int drives, (select count(*) from "Application")::int apps, (select count(*) from "Offer" where status<>'REVOKED')::int offers,
    (select count(*) from "Student" where "isActive" and not "isArchived" and "participationStatus"='REGISTERED' and "isPlaced")::int placed, (select count(*) from "Student" where "isActive" and not "isArchived" and "participationStatus"='REGISTERED')::int reg`)
  await expect(card(page, "Institutions", "Registered institutions")).toContainText(fmt(db.inst))
  await expect(card(page, "Institutions", "Active")).toContainText(fmt(db.act))
  await expect(card(page, "Institutions", "Suspended")).toContainText(fmt(db.sus))
  await expect(card(page, "People", "Students")).toContainText(fmt(db.stu))
  await expect(card(page, "People", "Staff")).toContainText(fmt(db.staff))
  await expect(card(page, "People", "Recruiters")).toContainText(fmt(db.rec))
  await expect(card(page, "People", "Platform administrators")).toContainText(fmt(db.adm))
  await expect(card(page, "Placement", "Placement drives")).toContainText(fmt(db.drives))
  await expect(card(page, "Placement", "Applications")).toContainText(fmt(db.apps))
  await expect(card(page, "Placement", "Offers made")).toContainText(fmt(db.offers))
  await expect(card(page, "Placement", "Placed students")).toContainText(`${fmt(db.placed)}`)
  await expect(card(page, "Placement", "Placement rate")).toContainText(db.reg ? `${Math.round((db.placed / db.reg) * 1000) / 10}%` : "—")
  await expect(card(page, "Placement", "Placement rate")).toContainText("registered for placement")   // the denominator is stated
  expect(await page.locator(".recharts-surface").count()).toBeGreaterThanOrEqual(3)   // three charts drawn

  // --- institution filter: the known institution
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: NAME }).click()
  await expect(card(page, "Institutions", "Registered institutions")).toContainText("1")
  await expect(card(page, "People", "Students")).toContainText("6")
  await expect(card(page, "People", "Students")).toContainText("5 active")                 // the archived one is not active
  await expect(card(page, "People", "Staff")).toContainText("3")
  await expect(card(page, "People", "Recruiters")).toContainText("2")
  await expect(card(page, "Placement", "Placement drives")).toContainText("2")
  await expect(card(page, "Placement", "Applications")).toContainText("3")
  await expect(card(page, "Placement", "Offers made")).toContainText("2")
  await expect(card(page, "Placement", "Placement rate")).toContainText("50%")             // 2 placed of 4 registered
  await expect(card(page, "Placement", "Placed students")).toContainText("of 4 registered for placement")
  await expect(tableRows(page).filter({ hasText: NAME })).toHaveCount(1)

  // --- status filter combined with the institution gives an empty dataset, with a clear message
  await page.getByRole("button", { name: "Suspended" }).click()
  await expect(page.getByText("No institutions match these filters.")).toBeVisible()
  await expect(card(page, "Placement", "Placement rate")).toContainText("—")               // no population, so no percentage
  await page.getByRole("button", { name: "Clear" }).click()
  await expect(card(page, "Institutions", "Registered institutions")).toContainText(fmt(db.inst))

  // --- date range: a range with no activity zeroes the flows but not the snapshots
  await page.getByLabel("From date").fill("2031-01-01"); await page.getByLabel("To date").fill("2031-12-31")
  await expect(card(page, "Placement", "Applications")).toContainText("0")
  await expect(card(page, "People", "Students")).toContainText(fmt(db.stu))
  // --- invalid range: shown at once, no request sent
  await page.getByLabel("From date").fill("2032-01-01")
  await expect(page.getByText("The start date must not be after the end date.")).toBeVisible()
  await page.getByRole("button", { name: "Clear" }).click()

  // --- table: search, sort, paging
  await page.getByLabel("Search institutions").fill(`AAA UI Analytics ${stamp}`)
  await expect(tableRows(page).filter({ hasText: NAME })).toHaveCount(1)
  await page.getByLabel("Search institutions").fill(`zzz-no-such-${stamp}`)
  await expect(page.getByText("No institutions match.")).toBeVisible()
  await page.getByLabel("Search institutions").fill("")
  const tableSection = page.getByRole("region", { name: "Institution-wise statistics" })
  await tableSection.getByRole("button", { name: /^Institution$/ }).click()
  await expect(tableSection.getByRole("button", { name: /Institution ▲/ })).toBeVisible()
  await expect(tableRows(page).first()).toContainText("AAA UI Analytics")        // ascending by name: our fixture sorts first
  await page.getByRole("button", { name: "Next" }).click()
  await expect(page.getByText(/page 2 of/)).toBeVisible()
  await page.getByRole("button", { name: "Previous" }).click()

  // --- refresh indicator, then first-load skeleton and error state (the API is slowed and then made to fail)
  await page.route("**/api/platform/analytics?*", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue() })
  await page.getByRole("button", { name: "Active", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Updating")                           // old figures stay, with a refresh hint
  await expect(page.getByRole("status")).toHaveCount(0)
  await page.unroute("**/api/platform/analytics?*")
  await page.route("**/api/platform/analytics?*", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "Something went wrong" } }) }) })
  await page.reload()
  await expect(page.locator("[data-slot=skeleton]").first()).toBeVisible()                  // first load: skeleton cards
  await expect(page.getByText("Could not load analytics")).toBeVisible()                    // error, with a plain message
  await expect(page.getByText("Something went wrong")).toBeVisible()
  await expect(page.getByText("Registered institutions")).toHaveCount(0)                    // no stale or invented figures on error
})

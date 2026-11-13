import { expect, test, type Page } from "@playwright/test"
import { createHmac } from "node:crypto"
import { spawnSync } from "node:child_process"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"

// Local-only. Needs the isolated stack, `source tests/e2e/stack/env.sh`, and a PRODUCTION build running on PW_BASE_URL.
// The server under test must have GITHUB_TOKEN=ghp_UI_SENTINEL_0123456789 in its environment (the page must never show it).
const stamp = Date.now().toString().slice(-6)
const ADMIN = { email: `g4uigov${stamp}@example.com`, password: `G4-ui-gov-${stamp}-Pw!` }
const base = process.env.PW_BASE_URL ?? "http://localhost:3122"
const SENTINEL = "ghp_UI_SENTINEL_0123456789"
let saved: string[] = []
let totpSecret = ""; let pgc: pg.Client; let token = ""; let cid = ""; let adminId = ""
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

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
const staffEmail = (k: string) => `g4uigov${k}${stamp}@example.com`
const mkStaff = async (email: string, name: string, role: string) => { const u = await sb.auth.admin.createUser({ email, password: ADMIN.password, email_confirm: true }); await pgc.query(`insert into "User"(id,"collegeId",email,name,role,"updatedAt") values ($1,$2,$3,$4,$5::"Role",now())`, [u.data.user!.id, cid, email, name, role]); return u.data.user!.id }

test.describe.configure({ mode: "serial" })
test.beforeAll(async () => {
  if (!/localhost|127\.0\.0\.1/.test(process.env.SUPABASE_URL ?? "") || !/localhost|127\.0\.0\.1/.test(process.env.DIRECT_URL ?? "")) throw new Error("Refusing: not the local stack")
  const r = spawnSync("npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: ADMIN.email, PLATFORM_ADMIN_NAME: "UI Gov Admin", PLATFORM_ADMIN_PASSWORD: ADMIN.password } })
  if (r.status !== 0) throw new Error(r.stderr)
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const s = (await anon.auth.signInWithPassword({ email: ADMIN.email, password: ADMIN.password })).data.session!
  const enr = await api(s.access_token, "POST", "/api/platform/mfa/enroll"); totpSecret = enr.j.data.secret
  token = (await api(s.access_token, "POST", "/api/platform/mfa/verify", { factorId: enr.j.data.factorId, code: totp(totpSecret) })).j.data.access_token
  pgc = new pg.Client({ connectionString: process.env.DIRECT_URL }); await pgc.connect()
  adminId = (await pgc.query(`select id from "PlatformAdmin" where email=$1`, [ADMIN.email])).rows[0].id
  // leftover synthetic administrators from other suites would hit the 50-administrator limit: switch them off for this run and restore them afterwards
  saved = (await pgc.query(`select id from "PlatformAdmin" where "isActive" and id <> $1`, [adminId])).rows.map((r) => r.id)
  await pgc.query(`update "PlatformAdmin" set "isActive"=false where "isActive" and id <> $1`, [adminId])
  await pgc.query(`delete from "PlatformPolicy"`); await pgc.query(`delete from "PlatformAuditLog" where action like 'policy.%' or action like 'retention.%'`)
  const p = await api(token, "POST", "/api/platform/institutions", { name: `G4 UI Gov ${stamp}`, slug: `g4-ui-gov-${stamp}`, admin: { name: "UI Gov Head", email: staffEmail("head") }, departments: [{ code: "CSE", name: "Computer Science" }] })
  if (p.s !== 200) throw new Error("provision " + JSON.stringify(p.j))
  cid = (await pgc.query(`select id from "College" where slug=$1`, [`g4-ui-gov-${stamp}`])).rows[0].id
  await mkStaff(staffEmail("fac"), "UI Faculty Person", "FACULTY"); await mkStaff(staffEmail("fac2"), "UI Second Faculty", "FACULTY")
})
test.afterAll(async () => {
  await pgc.query(`delete from "PlatformPolicy"`); await pgc.query(`delete from "PlatformAuditLog" where action like 'policy.%' or action like 'retention.%'`)
  await pgc.query(`delete from "JobRun" where job='g4uigov'`); await pgc.query(`delete from "MonitorEvent" where service='g4uigov'`)
  await pgc.query(`delete from "PlatformAdmin" where email like 'g4uigovnew%'`)
  if (saved.length) await pgc.query(`update "PlatformAdmin" set "isActive"=true where id = any($1)`, [saved])
  await pgc.query(`delete from "AuditLog" where "collegeId"=$1`, [cid]); await pgc.query(`update "College" set "isActive"=false where id=$1`, [cid]); await pgc.end()
})

test("anonymous visitors see no data on any governance screen", async ({ page }) => {
  for (const path of ["/platform/access", "/platform/system", "/platform/integrations", "/platform/policy", `/platform/institutions/${cid}/staff`]) {
    await page.goto(path, { waitUntil: "networkidle" })
    await expect(page.getByText("Platform administrators only")).toBeVisible()
    await expect(page.getByText(/Computer Science|Role management|GITHUB|ghp_/)).toHaveCount(0)
  }
})

test("system configuration is read-only and shows sources but no secret; integrations show states", async ({ page }) => {
  await signInMfa(page)
  await page.getByRole("link", { name: "System", exact: true }).or(page.getByRole("button", { name: "System", exact: true })).first().click()
  await expect(page).toHaveURL(/\/platform\/system/)
  await expect(page.getByRole("heading", { name: "System configuration" })).toBeVisible()
  await expect(page.getByText("Read-only.")).toBeVisible()
  await expect(page.getByTestId("cfg-githubToken")).toContainText("yes")
  await expect(page.getByTestId("cfg-channelsStatus")).toContainText("on hold")
  await expect(page.getByTestId("cfg-platformMfa")).toContainText("required")
  await expect(page.getByTestId("cfg-retention.jobRun")).toContainText("90 days")
  await expect(page.getByTestId("cfg-retention.jobRun")).toContainText("default")
  const text = await page.locator("body").innerText()
  expect(text).not.toContain(SENTINEL); expect(text).not.toMatch(/postgres(ql)?:\/\//i); expect(text).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY!)
  await expect(page.getByRole("button", { name: /save|edit/i })).toHaveCount(0)
  await expect(page.locator("input:visible")).toHaveCount(0)

  await page.goto("/platform/integrations", { waitUntil: "networkidle" })
  await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible()
  for (const k of ["smtp", "sms", "whatsapp", "calendar", "groq", "anthropic", "github", "storage"]) await expect(page.getByTestId(`int-${k}`)).toBeVisible()
  await expect(page.getByTestId("int-sms-state")).toContainText("Disabled (on hold)")
  await expect(page.getByTestId("int-whatsapp-state")).toContainText("Disabled (on hold)")
  await expect(page.getByTestId("int-github-state")).toContainText("Configured")
  await expect(page.getByTestId("int-calendar-state")).toContainText("Configured")
  await expect(page.getByTestId("int-groq-state")).toHaveText(/Missing|Healthy|Unhealthy|Unavailable|Configured|Disabled/)
  expect(await page.locator("body").innerText()).not.toContain(SENTINEL)
  await page.getByRole("button", { name: "Check again" }).click()
  await expect(page.getByTestId("int-summary")).toContainText("checked")
  await expect(page.locator("input:visible")).toHaveCount(0)
})

test("access: read-only role matrix, platform administrators (no creation form, refused self-removal, deactivate)", async ({ page }) => {
  await signInMfa(page); await page.goto("/platform/access", { waitUntil: "networkidle" })
  await expect(page.getByRole("heading", { name: "Access" })).toBeVisible()
  await page.getByText("Technical authorization matrix").click()   // the route-level matrix is in a collapsed technical section
  await expect(page.getByTestId("per-role")).toContainText("Principal")
  await expect(page.getByText(/Roles are fixed and permissions cannot be edited/)).toBeVisible()
  const total = async () => (await page.getByText(/\d+ endpoints · page 1 of/).innerText())
  const all = await total()
  await page.getByLabel("Search paths").fill("settings/staff")
  await expect(page.getByText(/ endpoints · page 1 of 1/)).toBeVisible()
  await expect(page.locator("tbody tr").filter({ hasText: "/api/settings/staff" }).first()).toContainText("Tpo admin")
  await page.getByLabel("Search paths").fill("")
  await expect.poll(total).toBe(all)
  // platform administrators
  await expect(page.getByTestId(`admin-${ADMIN.email}`)).toBeVisible()
  const newEmail = `g4uigovnew${stamp}@example.com`
  // DEC-01: there is no way to create a platform administrator on this screen
  await expect(page.getByLabel("New administrator e-mail")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Invite administrator" })).toHaveCount(0)
  await expect(page.getByText(/created by the platform team with a script/)).toBeVisible()
  const made = spawnSync("npx", ["tsx", "scripts/create-platform-admin.ts"], { encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, PLATFORM_ADMIN_EMAIL: newEmail, PLATFORM_ADMIN_NAME: "UI Script Admin", PLATFORM_ADMIN_PASSWORD: ADMIN.password } })
  expect(made.status).toBe(0)
  await page.reload({ waitUntil: "networkidle" })
  await expect(page.getByTestId(`admin-${newEmail}`)).toBeVisible()
  expect((await pgc.query(`select "isActive" from "PlatformAdmin" where email=$1`, [newEmail])).rows[0].isActive).toBe(true)
  await page.getByRole("button", { name: `Remove ${ADMIN.email}` }).click()
  await expect(page.getByText(/cannot remove yourself/i).first()).toBeVisible()
  expect((await pgc.query(`select "isActive" from "PlatformAdmin" where id=$1`, [adminId])).rows[0].isActive).toBe(true)
  await page.getByRole("button", { name: `Remove ${newEmail}` }).click()
  await expect(page.getByTestId(`admin-${newEmail}`)).toContainText("Removed")
  expect((await pgc.query(`select "isActive" from "PlatformAdmin" where email=$1`, [newEmail])).rows[0].isActive).toBe(false)
})

test("staff roles: assign an existing role, coordinator needs a department, no-op, institution isolation", async ({ page }) => {
  await signInMfa(page); await page.goto(`/platform/institutions/${cid}/staff`, { waitUntil: "networkidle" })
  await expect(page.getByRole("heading", { name: "Staff roles" })).toBeVisible()
  const fac = staffEmail("fac")
  await expect(page.getByTestId(`staff-${fac}`)).toBeVisible()
  await page.getByRole("checkbox", { name: `${fac} Placement officer` }).check()
  await page.getByRole("button", { name: `Save roles for ${fac}` }).click()
  await expect(page.getByText("Roles saved").first()).toBeVisible()
  expect((await pgc.query(`select role, "extraRoles"::text[] as e from "User" where email=$1`, [fac])).rows[0]).toMatchObject({ role: "FACULTY", e: ["PLACEMENT_OFFICER"] })
  // coordinator without a department is refused by the API
  const fac2 = staffEmail("fac2")
  await page.getByRole("checkbox", { name: `${fac2} Department coordinator` }).check()
  await page.getByRole("button", { name: `Save roles for ${fac2}` }).click()
  await expect(page.getByText(/department is required/i).first()).toBeVisible()
  expect((await pgc.query(`select role from "User" where email=$1`, [fac2])).rows[0].role).toBe("FACULTY")
  // search narrows the list; another institution's staff never appear
  await page.getByLabel("Search staff").fill("Second")
  await expect(page.getByTestId(`staff-${fac2}`)).toBeVisible(); await expect(page.getByTestId(`staff-${fac}`)).toHaveCount(0)
  expect(await page.locator("body").innerText()).not.toContain(process.env.SEED_ADMIN_EMAIL!)
  const au = (await pgc.query(`select before, after from "AuditLog" where "collegeId"=$1 and action='staff.roles.platform_update'`, [cid])).rows
  expect(au).toHaveLength(1); expect(au[0].after.roles).toEqual(["FACULTY", "PLACEMENT_OFFICER"])
})

test("policy: MFA minimum, retention bounds, confirmation before deletion, bounded cleanup", async ({ page }) => {
  await signInMfa(page); await page.goto("/platform/policy", { waitUntil: "networkidle" })
  await expect(page.getByRole("heading", { name: "Security and retention policy" })).toBeVisible()
  await expect(page.getByTestId("mfa-state")).toHaveText("Not required")
  await page.getByRole("button", { name: "Require for all institutions" }).click()
  await expect(page.getByTestId("mfa-state")).toHaveText("Required")
  expect((await pgc.query(`select "requireAdminMfa" r from "PlatformPolicy"`)).rows[0].r).toBe(true)
  await page.getByRole("button", { name: "Switch minimum off" }).click()
  await expect(page.getByTestId("mfa-state")).toHaveText("Not required")
  await expect(page.getByText(/not legal retention requirements|no legal retention requirement has been assessed/i).first()).toBeVisible()
  await expect(page.getByTestId("ret-jobRun")).toContainText("Allowed 30–365 days · default 90")
  // out of range is refused by the API and shown
  const job = page.getByLabel("Scheduled job history days")
  await job.fill("20"); await page.getByRole("button", { name: "Save retention" }).click()
  await expect(page.getByText(/at least 30/i).first()).toBeVisible()
  expect((await pgc.query(`select count(*)::int n from "PlatformPolicy" where "retentionJobRunDays" is not null`)).rows[0].n).toBe(0)
  // lengthening needs no confirmation
  await job.fill("365"); await page.getByRole("button", { name: "Save retention" }).click()
  await expect(page.getByTestId("ret-jobRun")).toContainText("platform setting")
  // seed expired records, then shorten: confirmation panel with the exact count
  await pgc.query(`insert into "JobRun"(id, job, "slotAt") select gen_random_uuid(), 'g4uigov', now() - interval '200 days' - (g || ' minutes')::interval from generate_series(1, 12) g`)
  await pgc.query(`insert into "JobRun"(id, job, "slotAt") values (gen_random_uuid(), 'g4uigov', now() - interval '2 days')`)
  const expired = (await pgc.query(`select count(*)::int n from "JobRun" where "slotAt" < now() - interval '30 days'`)).rows[0].n
  await job.fill("30"); await page.getByRole("button", { name: "Save retention" }).click()
  await expect(page.getByTestId("confirm")).toContainText(`${expired} jobRun record(s)`)
  expect((await pgc.query(`select "retentionJobRunDays" d from "PlatformPolicy"`)).rows[0].d).toBe(365)
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page.getByTestId("confirm")).toHaveCount(0); await expect(job).toHaveValue("365")
  await job.fill("30"); await page.getByRole("button", { name: "Save retention" }).click()
  await page.getByRole("button", { name: "Confirm and save" }).click()
  await expect(page.getByTestId("confirm")).toHaveCount(0)
  await expect.poll(async () => (await pgc.query(`select "retentionJobRunDays" d from "PlatformPolicy"`)).rows[0].d).toBe(30)
  expect((await pgc.query(`select count(*)::int n from "JobRun" where job='g4uigov'`)).rows[0].n).toBe(13) // saving deleted nothing
  await page.getByRole("button", { name: "Run cleanup now" }).click()
  await expect(page.getByTestId("ran")).toContainText("Removed")
  expect((await pgc.query(`select count(*)::int n from "JobRun" where job='g4uigov'`)).rows[0].n).toBe(1) // only the 2-day-old record is inside 30 days
  const a = (await pgc.query(`select action from "PlatformAuditLog" where action like 'policy.%' or action like 'retention.%' order by "createdAt"`)).rows.map((r) => r.action)
  expect(a).toEqual(["policy.mfa.update", "policy.mfa.update", "policy.retention.update", "policy.retention.update", "retention.cleanup"])
})

test("phone-width layout has no horizontal scroll on the new screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await signInMfa(page)
  for (const path of ["/platform/policy", "/platform/access", "/platform/system", "/platform/integrations", `/platform/institutions/${cid}/staff`]) {
    await page.goto(path, { waitUntil: "networkidle" })
    await expect(page.locator("h1")).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true)
  }
})

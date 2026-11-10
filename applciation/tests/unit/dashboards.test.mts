import assert from "node:assert/strict"
import { visibleNav } from "../../lib/web/nav"
import { isPrincipalOnly, isFacultyOnly } from "../../lib/auth/session"

const hrefs = (roles: string[], modules = ["ONBOARDING", "DRIVES", "ANALYTICS", "ASSESSMENTS", "LEARNING"]) => visibleNav("staff", modules, roles).flatMap((s) => s.items.map((i) => i.href))

// a principal sees only the read-only institutional pages
const p = hrefs(["PRINCIPAL"])
assert.deepEqual(p.sort(), ["/staff", "/staff/analytics", "/staff/institution", "/staff/reports"].sort())
for (const forbidden of ["/staff/students", "/staff/drives", "/staff/settings", "/staff/offers", "/staff/communications", "/staff/assessments"]) assert.ok(!p.includes(forbidden), forbidden)
// the institution page is not offered to placement staff, and they keep everything else
const t = hrefs(["TPO_ADMIN"])
assert.ok(!t.includes("/staff/institution") && t.includes("/staff/students") && t.includes("/staff/reports") && t.includes("/staff/analytics"))
// a person who is a principal and also a placement officer gets both
const both = hrefs(["PRINCIPAL", "PLACEMENT_OFFICER"]); assert.ok(both.includes("/staff/institution") && both.includes("/staff/students"))
// faculty are unchanged
assert.deepEqual(hrefs(["FACULTY"]).includes("/staff/institution"), false)
// the role guards
assert.equal(isPrincipalOnly({ roles: ["PRINCIPAL"] }), true); assert.equal(isPrincipalOnly({ roles: ["PRINCIPAL", "TPO_ADMIN"] }), false); assert.equal(isPrincipalOnly({ roles: [] }), false); assert.equal(isPrincipalOnly({ roles: ["FACULTY"] }), false)
assert.equal(isFacultyOnly({ roles: ["PRINCIPAL"] }), false)
console.log("dashboards ok")

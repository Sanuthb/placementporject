import assert from "node:assert/strict"
import { pipelineCounts, placementStatus, type Facts } from "../../lib/placementStatus"

const base: Facts = { drive: { publishedAt: "2026-01-01T00:00:00Z", status: "PUBLISHED" }, application: null, events: [], prep: null, tests: [], interviews: [], slots: [], results: [], offer: null }
const app = { appliedAt: "2026-01-05T00:00:00Z", status: "APPLIED", clearedAllRounds: false, appliedBy: null }
const reached = (s: ReturnType<typeof placementStatus>) => s.milestones.filter((m) => m.reached).map((m) => m.key)

// not applied: only the job is published, and the next step is to apply
let s = placementStatus(base)
assert.equal(s.current, "JOB_PUBLISHED"); assert.deepEqual(reached(s), ["JOB_PUBLISHED"]); assert.equal(s.next, "Application received")
assert.equal(placementStatus({ ...base, drive: { publishedAt: null, status: "DRAFT" } }).current, "NOT_STARTED")

// applied: eligibility is checked with the application, at the same time
s = placementStatus({ ...base, application: app })
assert.equal(s.current, "ELIGIBILITY_CHECKED"); assert.deepEqual(reached(s), ["JOB_PUBLISHED", "APPLICATION_RECEIVED", "ELIGIBILITY_CHECKED"])
assert.equal(s.milestones[2].at, s.milestones[1].at); assert.equal(s.next, "Shortlisted")

// shortlisted by a person: the step carries who and when
const ev = { at: "2026-01-06T00:00:00Z", status: "SHORTLISTED", roundResult: null, roundName: null, by: "Asha (TPO)", note: "Good fit" }
s = placementStatus({ ...base, application: app, events: [ev] })
assert.equal(s.current, "SHORTLISTED"); assert.equal(s.milestones.find((m) => m.key === "SHORTLISTED")!.by, "Asha (TPO)")
assert.ok(s.history.some((h) => h.label === "Shortlisted" && h.by === "Asha (TPO)" && h.note === "Good fit"))

// preparation before applying counts, and a later step wins over an earlier one
s = placementStatus({ ...base, prep: { at: "2025-12-20T00:00:00Z", by: "Ravi" }, tests: [{ at: "2025-12-28T00:00:00Z", title: "Quant" }], interviews: [{ at: "2025-12-29T00:00:00Z", title: "HR practice" }] })
assert.equal(s.current, "MOCK_INTERVIEW_COMPLETED"); assert.deepEqual(reached(s), ["JOB_PUBLISHED", "PREPARATION_ASSIGNED", "MOCK_TEST_COMPLETED", "MOCK_INTERVIEW_COMPLETED"])
assert.equal(s.history[0].label, "Preparation assigned", "history is in time order")

// interview invited then attended (an aptitude round does not count as an interview)
const slot = { createdAt: "2026-01-10T00:00:00Z", startsAt: "2026-01-15T10:00:00Z", status: "SCHEDULED", roundName: "Technical", by: "Meena" }
s = placementStatus({ ...base, application: app, slots: [slot], results: [{ at: "2026-01-12T00:00:00Z", status: "CLEARED", roundType: "APTITUDE", roundName: "Aptitude", by: "Meena" }] })
assert.equal(s.current, "INVITED_TO_INTERVIEW")
s = placementStatus({ ...base, application: app, slots: [slot], results: [{ at: "2026-01-15T11:00:00Z", status: "CLEARED", roundType: "TECHNICAL", roundName: "Technical", by: "Meena" }] })
assert.equal(s.current, "INTERVIEW_ATTENDED")
assert.equal(placementStatus({ ...base, application: app, slots: [{ ...slot, status: "CANCELLED" }] }).milestones.find((m) => m.key === "INVITED_TO_INTERVIEW")!.reached, false, "a cancelled slot is not an invitation")

// rejected ends the road: no next step, and later steps are not claimed
s = placementStatus({ ...base, application: { ...app, status: "REJECTED" }, results: [{ at: "2026-01-16T00:00:00Z", status: "REJECTED", roundType: "HR", roundName: "HR", by: "Meena" }] })
assert.equal(s.current, "REJECTED"); assert.equal(s.next, null); assert.equal(s.milestones.find((m) => m.key === "REJECTED")!.reached, true)
// withdrawn
s = placementStatus({ ...base, application: { ...app, status: "WITHDRAWN" } })
assert.equal(s.current, "WITHDRAWN"); assert.equal(s.next, null)

// selected, offer, acceptance, joining
const offer = { offeredAt: "2026-02-01T00:00:00Z", offeredBy: "Asha", status: "OFFERED", respondedAt: null, joiningStatus: "PENDING", joinedAt: null }
s = placementStatus({ ...base, application: { ...app, clearedAllRounds: true }, offer })
assert.equal(s.current, "OFFER_RELEASED"); assert.equal(s.next, "Offer accepted")
s = placementStatus({ ...base, application: { ...app, clearedAllRounds: true }, offer: { ...offer, status: "ACCEPTED", respondedAt: "2026-02-03T00:00:00Z" } })
assert.equal(s.current, "OFFER_ACCEPTED")
s = placementStatus({ ...base, application: { ...app, clearedAllRounds: true }, offer: { ...offer, status: "ACCEPTED", respondedAt: "2026-02-03T00:00:00Z", joiningStatus: "JOINED", joinedAt: "2026-07-01T00:00:00Z" } })
assert.equal(s.current, "JOINED"); assert.equal(s.next, null)
assert.equal(placementStatus({ ...base, application: { ...app, clearedAllRounds: true } }).current, "SELECTED")
// a revoked offer is not counted as released
s = placementStatus({ ...base, application: { ...app, clearedAllRounds: true }, offer: { ...offer, status: "REVOKED" } })
assert.equal(s.milestones.find((m) => m.key === "OFFER_RELEASED")!.reached, false); assert.equal(s.current, "SELECTED")
// a rejection in a round does not hide an offer that was made anyway (the record wins)
s = placementStatus({ ...base, application: app, results: [{ at: "2026-01-16T00:00:00Z", status: "REJECTED", roundType: "HR", roundName: "HR", by: null }], offer })
assert.equal(s.current, "OFFER_RELEASED")

// pipeline counts: passed-step totals and current positions
const c = pipelineCounts([placementStatus({ ...base, application: app }), placementStatus({ ...base, application: app, events: [ev] }), placementStatus(base)])
assert.equal(c.total, 3); assert.equal(c.reachedCount.APPLICATION_RECEIVED, 2); assert.equal(c.reachedCount.SHORTLISTED, 1); assert.deepEqual(c.currentCount, { ELIGIBILITY_CHECKED: 1, SHORTLISTED: 1, JOB_PUBLISHED: 1 })
console.log("placementstatus ok")

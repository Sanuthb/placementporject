import assert from "node:assert/strict"
import { CATEGORIES, buildIcs, categoryOf, channelsFor, checkChannel, fold, inQuietHours, isMandatory, normalisePhone, planReminders, textMessage, type ReminderFacts } from "../../lib/notifyRules"

// categories: every known notification type lands somewhere sensible, longest prefix wins
const cases: Record<string, string> = { "offer.received": "OFFERS", "campaign.invited": "CAMPAIGNS", "campaign.reminder": "REMINDERS", "round.reminder": "REMINDERS", "assessment.marked": "TESTS", "assessment.reminder": "REMINDERS", "interview.report": "INTERVIEWS", "discussion.assigned": "INTERVIEWS", "course.deadline": "COURSES", "course.completed": "COURSES", "ticket.reply": "SUPPORT", "block.created": "ACCOUNT", "onboarding.submitted": "ACCOUNT", "drive.reminder": "REMINDERS", "something.new": "PROFILE", "preparation.reminder": "REMINDERS", "announcement": "ANNOUNCEMENTS" }
for (const [t, c] of Object.entries(cases)) assert.equal(categoryOf(t), c, t)
assert.ok(isMandatory("OFFERS") && isMandatory("ACCOUNT") && !isMandatory("TESTS")); assert.equal(CATEGORIES.length, 12)

// channels: app on by default, everything else opt-in; mandatory stays on in the app
assert.deepEqual(channelsFor("TESTS", []), { IN_APP: true, EMAIL: false, SMS: false, WHATSAPP: false })
assert.equal(channelsFor("TESTS", [{ category: "TESTS", channel: "IN_APP", enabled: false }]).IN_APP, false)
assert.equal(channelsFor("OFFERS", [{ category: "OFFERS", channel: "IN_APP", enabled: false }]).IN_APP, true, "an offer message cannot be switched off in the app")
assert.equal(channelsFor("TESTS", [{ category: "TESTS", channel: "SMS", enabled: true }]).SMS, true)

// phone numbers
assert.equal(normalisePhone("98765 43210"), "+919876543210"); assert.equal(normalisePhone("+91-98765-43210"), "+919876543210"); assert.equal(normalisePhone("09876543210"), "+919876543210")
assert.equal(normalisePhone("919876543210"), "+919876543210"); assert.equal(normalisePhone("+14155550123"), "+14155550123"); assert.equal(normalisePhone("0014155550123"), "+14155550123")
for (const bad of ["12345", "abc", "", null, undefined, "+1234"]) assert.equal(normalisePhone(bad as never), null, String(bad))

// quiet hours (India time): 9 pm to 8 am, offers exempt
const utc = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 10, h, m))
assert.equal(inQuietHours(utc(2, 29), "TESTS"), true, "07:59 IST"); assert.equal(inQuietHours(utc(2, 30), "TESTS"), false, "08:00 IST")
assert.equal(inQuietHours(utc(15, 29), "TESTS"), false, "20:59 IST"); assert.equal(inQuietHours(utc(15, 30), "TESTS"), true, "21:00 IST"); assert.equal(inQuietHours(utc(18, 0), "OFFERS"), false)

// text message
assert.equal(textMessage({ title: "Round 2   starts", body: "Tomorrow 10 am" }), "Placement Cell: Round 2 starts. Tomorrow 10 am")
assert.ok(textMessage({ title: "x".repeat(500) }).length <= 300 && textMessage({ title: "x".repeat(500) }).endsWith("…")); assert.equal(textMessage({ title: "Hi" }, "College"), "College: Hi")

// channel check gives a reason for every refusal
const base = { channel: "SMS" as const, category: "TESTS" as const, prefs: [{ category: "TESTS", channel: "SMS", enabled: true }], collegeEnabled: true, providerConfigured: true, phone: "+919876543210", now: utc(8) }
assert.equal(checkChannel(base).send, true)
assert.match(checkChannel({ ...base, prefs: [] }).reason!, /not turned this on/); assert.match(checkChannel({ ...base, collegeEnabled: false }).reason!, /college/); assert.match(checkChannel({ ...base, providerConfigured: false }).reason!, /configured/)
assert.match(checkChannel({ ...base, phone: null }).reason!, /phone/); assert.match(checkChannel({ ...base, now: utc(18) }).reason!, /Quiet/)
assert.equal(checkChannel({ ...base, channel: "EMAIL", prefs: [{ category: "TESTS", channel: "EMAIL", enabled: true }], email: "a@b.c", now: utc(18) }).send, true, "email is not held for quiet hours")

// reminders
const now = new Date("2026-02-01T10:00:00Z"), h = (n: number) => new Date(now.getTime() + n * 3_600_000)
const facts: ReminderFacts = { now,
  tests: [{ studentId: "s1", scheduleId: "t1", title: "Quant", startsAt: h(5), endsAt: h(30), taken: false }, { studentId: "s1", scheduleId: "t2", title: "Verbal", startsAt: h(-5), endsAt: h(10), taken: false }, { studentId: "s1", scheduleId: "t3", title: "Done", startsAt: h(-5), endsAt: h(10), taken: true }, { studentId: "s1", scheduleId: "t4", title: "Far", startsAt: h(60), endsAt: h(90), taken: false }, { studentId: "s1", scheduleId: "t5", title: "Over", startsAt: h(-50), endsAt: h(-1), taken: false }],
  assignments: [{ studentId: "s1", lessonId: "l1", courseTitle: "Java", title: "Lab 1", dueAt: h(40), submitted: false }, { studentId: "s1", lessonId: "l2", courseTitle: "Java", title: "Lab 2", dueAt: h(40), submitted: true }, { studentId: "s1", lessonId: "l3", courseTitle: "Java", title: "Lab 3", dueAt: h(60), submitted: false }],
  planItems: [{ studentId: "s1", itemId: "p1", title: "Read notes", dueAt: h(20), done: false, campaign: "SDE prep" }, { studentId: "s1", itemId: "p2", title: "Old", dueAt: h(-30), done: false, campaign: "SDE prep" }, { studentId: "s1", itemId: "p3", title: "Done", dueAt: h(5), done: true, campaign: "SDE prep" }],
  assigned: [{ studentId: "s1", kind: "interview", assignmentId: "a1", title: "HR round", dueAt: h(30), done: false }, { studentId: "s1", kind: "discussion", assignmentId: "a2", title: "GD", dueAt: h(30), done: true }] }
const rem = planReminders(facts)
assert.deepEqual(rem.map((r) => r.link).sort(), ["/student/assessments/t1#opens", "/student/assessments/t2#closes", "/student/campaigns#item-p1", "/student/courses#lesson-l1", "/student/prep#interview-a1"].sort())
assert.deepEqual(planReminders({ ...facts, tests: [...facts.tests, ...facts.tests] }).length, rem.length, "duplicates collapse to one reminder per person per item")
assert.deepEqual(planReminders({ now, tests: [], assignments: [], planItems: [], assigned: [] }), [])

// calendar file
const ics = buildIcs([{ uid: "a1", title: "Round 1, Technical; HR", start: new Date("2026-02-03T04:30:00Z"), end: new Date("2026-02-03T05:30:00Z"), place: "Room 4", description: "Line one\nLine two" }, { uid: "a2", title: "Deadline", start: new Date("2026-02-05T00:00:00Z"), allDay: true }], now)
assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n")); assert.ok(ics.includes("DTSTART:20260203T043000Z") && ics.includes("SUMMARY:Round 1\\, Technical\; HR") && ics.includes("DESCRIPTION:Line one\\nLine two"))
assert.ok(ics.includes("DTSTART;VALUE=DATE:20260205") && ics.includes("DTEND;VALUE=DATE:20260206") && ics.includes("TRIGGER:-PT30M"))
assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 1, "all-day events have no alarm")
for (const l of ics.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75, l)
assert.ok(fold("a".repeat(200)).split("\r\n").every((l, i) => Buffer.byteLength(l) <= (i ? 75 : 75)) && fold("a".repeat(200)).replace(/\r\n /g, "") === "a".repeat(200))
console.log("notifyrules ok")

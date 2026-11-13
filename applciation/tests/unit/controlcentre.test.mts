// Unit tests: Super Admin Control Centre rules (incidents, announcements, module switch, security reviews, support priority and reopen). Pure logic: no database.
import { canUpdate, createInput as incidentInput, durationMinutes, incidentQuery, updateInput as incidentUpdate } from "../../lib/platformIncidents";
import { announcementInput, announcementStatus, audienceMatches } from "../../lib/platformAnnouncements";
import { MODULE_INFO, MODULE_KEYS, isModuleKey, switchInput } from "../../lib/platformModules";
import { reviewInput } from "../../lib/platformSecurity";
import { priorityInput, reopenInput } from "../../lib/platformSupport";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const ok = (s: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => s.safeParse(v).success;
const U1 = "6f1b7a52-3b1c-4d3e-9a3f-1c2d3e4f5a6b";
const U2 = "7a2c8b63-4c2d-4e4f-8b4a-2d3e4f5a6b7c";
const at = (iso: string) => new Date(iso);

// ---- incidents
t("an incident needs a title, a severity and a first message", ok(incidentInput, { title: "Database slow", severity: "MAJOR", message: "Investigating slow queries" }) && !ok(incidentInput, { title: "x", severity: "MAJOR", message: "Looking" }) && !ok(incidentInput, { title: "Database slow", severity: "HUGE", message: "Looking" }) && !ok(incidentInput, { title: "Database slow", severity: "MAJOR" }));
t("unknown fields are refused on every incident input", !ok(incidentInput, { title: "Database slow", severity: "MAJOR", message: "Looking", status: "RESOLVED" }) && !ok(incidentUpdate, { status: "MONITORING", message: "Watching", extra: 1 }));
t("an update names a known status and says something", ok(incidentUpdate, { status: "MONITORING", message: "Fix applied" }) && !ok(incidentUpdate, { status: "FIXED", message: "Fix applied" }) && !ok(incidentUpdate, { status: "MONITORING", message: " " }));
t("only an unresolved incident can be updated", canUpdate("INVESTIGATING") && canUpdate("IDENTIFIED") && canUpdate("MONITORING") && !canUpdate("RESOLVED"));
t("duration is whole minutes, open incidents run to now, and it is never negative", durationMinutes(at("2026-06-01T10:00:00Z"), at("2026-06-01T11:30:00Z"), at("2026-06-02T00:00:00Z")) === 90 && durationMinutes(at("2026-06-01T10:00:00Z"), null, at("2026-06-01T10:45:00Z")) === 45 && durationMinutes(at("2026-06-01T10:00:00Z"), null, at("2026-06-01T09:00:00Z")) === 0);
t("the incident list accepts ACTIVE and the real statuses only", ok(incidentQuery, { status: "ACTIVE" }) && ok(incidentQuery, { status: "RESOLVED" }) && !ok(incidentQuery, { status: "OPEN" }) && !ok(incidentQuery, { pageSize: 500 }));

// ---- announcements
const base = { kind: "MAINTENANCE", title: "Planned maintenance", body: "The platform will be unavailable for ten minutes.", startsAt: "2026-06-10T10:00:00Z" };
t("an announcement to all institutions needs no list", ok(announcementInput, { ...base, allInstitutions: true }) && ok(announcementInput, base));
t("a targeted announcement must name at least one institution", !ok(announcementInput, { ...base, allInstitutions: false, institutionIds: [] }) && ok(announcementInput, { ...base, allInstitutions: false, institutionIds: [U1] }));
t("institution ids must be real ids and are capped", !ok(announcementInput, { ...base, allInstitutions: false, institutionIds: ["abc"] }) && !ok(announcementInput, { ...base, allInstitutions: false, institutionIds: Array.from({ length: 201 }, () => U1) }));
t("the end must be after the start", ok(announcementInput, { ...base, endsAt: "2026-06-10T11:00:00Z" }) && !ok(announcementInput, { ...base, endsAt: "2026-06-10T09:00:00Z" }) && !ok(announcementInput, { ...base, endsAt: "2026-06-10T10:00:00Z" }));
t("only the three real kinds are accepted, and nothing like SMS or WhatsApp", ok(announcementInput, { ...base, kind: "OUTAGE" }) && ok(announcementInput, { ...base, kind: "FEATURE" }) && !ok(announcementInput, { ...base, kind: "SMS" }) && !ok(announcementInput, { ...base, channel: "WHATSAPP" }));
const NOW = at("2026-06-10T12:00:00Z");
const a = (p: Partial<{ publishedAt: Date | null; cancelledAt: Date | null; startsAt: Date; endsAt: Date | null }>) => ({ publishedAt: at("2026-06-01T00:00:00Z"), cancelledAt: null, startsAt: at("2026-06-10T10:00:00Z"), endsAt: null, ...p });
t("a draft is never live, even if its time has come", announcementStatus(a({ publishedAt: null }), NOW) === "draft");
t("a published announcement before its start is scheduled", announcementStatus(a({ startsAt: at("2026-06-11T00:00:00Z") }), NOW) === "scheduled");
t("a published announcement inside its window is live, with or without an end", announcementStatus(a({}), NOW) === "live" && announcementStatus(a({ endsAt: at("2026-06-10T13:00:00Z") }), NOW) === "live");
t("after its end it is ended", announcementStatus(a({ endsAt: at("2026-06-10T11:00:00Z") }), NOW) === "ended");
t("cancelled wins over every other state", announcementStatus(a({ cancelledAt: at("2026-06-10T11:00:00Z") }), NOW) === "cancelled" && announcementStatus(a({ publishedAt: null, cancelledAt: at("2026-06-10T11:00:00Z") }), NOW) === "cancelled");
t("an announcement to all reaches every institution", audienceMatches({ allInstitutions: true, targetIds: [] }, U1) && audienceMatches({ allInstitutions: true, targetIds: [U2] }, U1));
t("a targeted announcement reaches only the institutions it names", audienceMatches({ allInstitutions: false, targetIds: [U1] }, U1) && !audienceMatches({ allInstitutions: false, targetIds: [U1] }, U2) && !audienceMatches({ allInstitutions: false, targetIds: [] }, U1));

// ---- module switch
t("every module in the schema has a label and a description for the administrator", MODULE_KEYS.length > 0 && MODULE_KEYS.length === Object.keys(MODULE_INFO).length && MODULE_KEYS.every((k) => !!MODULE_INFO[k]?.label && !!MODULE_INFO[k]?.description));
t("module names are checked against the real list", isModuleKey("DRIVES") && !isModuleKey("drives") && !isModuleKey("ALUMNI") && !isModuleKey(""));
t("switching a module back on needs no reason", ok(switchInput, { enabled: true }));
t("switching a module off needs a reason", !ok(switchInput, { enabled: false }) && !ok(switchInput, { enabled: false, reason: "  " }) && ok(switchInput, { enabled: false, reason: "Security issue in the module" }));
t("the module switch accepts nothing else, so it cannot grant anything", !ok(switchInput, { enabled: true, institutions: [U1] }) && !ok(switchInput, { enabled: true, grant: "x" }));

// ---- security reviews
t("marking an event under review needs no note", ok(reviewInput, { source: "PLATFORM", eventId: U1, status: "UNDER_REVIEW" }));
t("resolving or closing an event needs a note", !ok(reviewInput, { source: "PLATFORM", eventId: U1, status: "RESOLVED" }) && !ok(reviewInput, { source: "INSTITUTION", eventId: U1, status: "NO_ACTION", note: "ok" }) && ok(reviewInput, { source: "INSTITUTION", eventId: U1, status: "NO_ACTION", note: "Expected maintenance change" }));
t("a review names a real event id and one of the two trails, and no statuses that call something an attack", !ok(reviewInput, { source: "PLATFORM", eventId: "nope", status: "UNDER_REVIEW" }) && !ok(reviewInput, { source: "OTHER", eventId: U1, status: "UNDER_REVIEW" }) && !ok(reviewInput, { source: "PLATFORM", eventId: U1, status: "ATTACK", note: "x" }));

// ---- support priority and reopen
t("priority is one of four levels", ok(priorityInput, { priority: "URGENT" }) && ok(priorityInput, { priority: "LOW" }) && !ok(priorityInput, { priority: "CRITICAL" }) && !ok(priorityInput, {}));
t("reopening needs a reason", ok(reopenInput, { reason: "The problem came back" }) && !ok(reopenInput, { reason: "" }) && !ok(reopenInput, { reason: "no" }) && !ok(reopenInput, {}));

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

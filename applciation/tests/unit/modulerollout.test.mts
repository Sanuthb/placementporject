// Unit tests: module scheduling and gradual rollout, refused-request recording, switch input, session marker. Pure logic: no database.
import { bucketOf, countIncluded, platformAvailability, settingStatus, unavailableMessage } from "../../lib/moduleRollout";
import { denialKind, resetThrottle, routePattern, shouldRecord } from "../../lib/platformDenials";
import { MODULE_DEPENDS_ON, MODULE_KEYS, dependentsOf, switchInput } from "../../lib/platformModules";
import { sessionIdOf } from "../../lib/platformAccount";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const ok = (v: unknown) => switchInput.safeParse(v).success;
const NOW = new Date("2026-06-10T12:00:00Z");
const ids = Array.from({ length: 1000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const on = { globallyEnabled: true, availableFrom: null, rolloutPercent: 100 };

// ---- buckets
t("a bucket is always 0 to 99 and never changes for the same module and institution", ids.every((id) => { const b = bucketOf(id, "DRIVES"); return Number.isInteger(b) && b >= 0 && b <= 99 && b === bucketOf(id, "DRIVES"); }));
t("different modules place the same institution differently, so one institution is not always first", ids.filter((id) => bucketOf(id, "DRIVES") !== bucketOf(id, "ANALYTICS")).length > 800);
const near = (p: number) => Math.abs(countIncluded(ids, "DRIVES", p) - p * 10) <= 60;
t("a rollout reaches roughly its share of institutions (within six points on 1000)", [10, 25, 50, 75, 90].every(near), [10, 25, 50, 75, 90].map((p) => countIncluded(ids, "DRIVES", p)).join());
t("raising the percentage only ever adds institutions: nobody already in drops out", (() => { const inAt = (p: number) => new Set(ids.filter((id) => bucketOf(id, "DRIVES") < p)); const a = inAt(30), b = inAt(60); return [...a].every((x) => b.has(x)); })());
t("0 percent reaches nobody and 100 percent reaches everybody", countIncluded(ids, "DRIVES", 0) === 0 && countIncluded(ids, "DRIVES", 100) === ids.length && countIncluded(ids, "DRIVES", 250) === ids.length);

// ---- availability
t("with no platform setting a module is available (the platform adds nothing)", platformAvailability(null, ids[0], "DRIVES", NOW).available && platformAvailability(undefined, ids[0], "DRIVES", NOW).available);
t("switched off means off for everyone, whatever the schedule or rollout", ids.slice(0, 50).every((id) => { const r = platformAvailability({ globallyEnabled: false, availableFrom: null, rolloutPercent: 100 }, id, "DRIVES", NOW); return !r.available && r.reason === "off"; }));
t("before the launch time nobody has it; at and after it the schedule no longer blocks", (() => { const s = { ...on, availableFrom: new Date("2026-06-11T00:00:00Z") }; const before = platformAvailability(s, ids[0], "DRIVES", NOW); const at = platformAvailability(s, ids[0], "DRIVES", new Date("2026-06-11T00:00:00Z")); return !before.available && before.reason === "not_yet" && at.available; })());
t("in a rollout only the chosen share has it, and the others are told it is a rollout", (() => { const s = { ...on, rolloutPercent: 40 }; const got = ids.filter((id) => platformAvailability(s, id, "DRIVES", NOW).available).length; const refused = ids.filter((id) => { const r = platformAvailability(s, id, "DRIVES", NOW); return !r.available && r.reason === "rollout"; }).length; return got + refused === ids.length && got === countIncluded(ids, "DRIVES", 40); })());
t("a scheduled launch wins over a rollout while it has not arrived", (() => { const r = platformAvailability({ ...on, availableFrom: new Date("2026-07-01T00:00:00Z"), rolloutPercent: 50 }, ids[0], "DRIVES", NOW); return !r.available && r.reason === "not_yet"; })());
t("nonsense percentages cannot lock everyone out or in by accident", platformAvailability({ ...on, rolloutPercent: Number.NaN }, ids[0], "DRIVES", NOW).available && platformAvailability({ ...on, rolloutPercent: 400 }, ids[0], "DRIVES", NOW).available && !platformAvailability({ ...on, rolloutPercent: -5 }, ids[0], "DRIVES", NOW).available);
t("status for the administrator: off, scheduled, rollout, on", settingStatus({ ...on, globallyEnabled: false }, NOW) === "off" && settingStatus({ ...on, availableFrom: new Date("2026-07-01T00:00:00Z") }, NOW) === "scheduled" && settingStatus({ ...on, rolloutPercent: 30 }, NOW) === "rollout" && settingStatus(on, NOW) === "on" && settingStatus(null, NOW) === "on");
t("each refusal has its own plain message", /switched off/.test(unavailableMessage("DRIVES", "off")) && /not available yet/.test(unavailableMessage("DRIVES", "not_yet")) && /not yet available to this college/.test(unavailableMessage("DRIVES", "rollout")));

// ---- switch input and dependencies
t("the old switch input still works", ok({ enabled: true }) && ok({ enabled: false, reason: "Fixing a defect" }) && !ok({ enabled: false }));
t("a launch time and a rollout percentage are accepted, and a percentage outside 0 to 100 or with decimals is not", ok({ enabled: true, availableFrom: "2026-07-01T09:00:00Z", rolloutPercent: 25 }) && ok({ enabled: true, availableFrom: null, rolloutPercent: 0 }) && !ok({ enabled: true, rolloutPercent: 101 }) && !ok({ enabled: true, rolloutPercent: -1 }) && !ok({ enabled: true, rolloutPercent: 12.5 }) && !ok({ enabled: true, availableFrom: "not a date" }));
t("the switch still accepts nothing that could grant access", !ok({ enabled: true, institutions: ["x"] }) && !ok({ enabled: true, grant: true }));
t("dependencies are advice only and every key in them is a real module", Object.entries(MODULE_DEPENDS_ON).every(([k, v]) => MODULE_KEYS.includes(k as never) && (v ?? []).every((d) => MODULE_KEYS.includes(d))) && dependentsOf("DRIVES" as never).length >= 1);

// ---- refused-request recording
t("route patterns hide ids so counts group together", routePattern("get", "/api/drives/6f1b7a52-3b1c-4d3e-9a3f-1c2d3e4f5a6b/rounds/12") === "GET /api/drives/:id/rounds/:n" && routePattern("POST", "/api/settings/staff") === "POST /api/settings/staff");
t("a very long path is cut, so a row can never be huge", routePattern("GET", "/api/" + "x".repeat(500)).length <= 160);
t("a module refusal is told apart from a role refusal", denialKind("The DRIVES module is temporarily switched off by the platform") === "MODULE" && denialKind("You do not have access to this resource") === "ROLE");
t("the same refusal is written at most once a minute, a different one is written at once", (() => { resetThrottle(); const a = shouldRecord("k1", 1000), b = shouldRecord("k1", 30_000), c = shouldRecord("k2", 30_000), d = shouldRecord("k1", 62_000); return a && !b && c && d; })());
t("the throttle map is bounded: a flood of different refusals stops being recorded instead of growing", (() => { resetThrottle(); let accepted = 0; for (let i = 0; i < 5000; i++) if (shouldRecord("flood-" + i, 5000)) accepted++; return accepted <= 2000; })());

// ---- the session marker
const jwt = (payload: object) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;
t("the session id is read from a token, and a malformed token gives nothing instead of an error", sessionIdOf(jwt({ session_id: "abc" })) === "abc" && sessionIdOf(jwt({})) === null && sessionIdOf("garbage") === null && sessionIdOf("") === null);

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

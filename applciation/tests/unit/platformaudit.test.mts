// Unit tests: platform audit viewer query contract, outcome rule and credential masking. No database needed.
import { auditQuery as q, outcomeOf, redact, SORTS } from "../../lib/platformAuditView";
let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const U = "3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f";

t("defaults", (() => { const v = q.parse({}); return v.sort === "createdAt" && v.order === "desc" && v.page === 1 && v.pageSize === 25; })());
t("every sort key accepted", SORTS.every((s) => q.safeParse({ sort: s }).success));
for (const bad of [{ sort: "ip" }, { sort: "action;drop" }, { order: "up" }, { source: "COLLEGE" }, { outcome: "ok" }, { admin: "not-a-uuid" }, { institution: "1" }, { action: "has space" }, { action: "a;b" }, { action: "x'--" }, { action: "" }, { from: "yesterday" }, { to: "31-31-2026" }, { page: "0" }, { page: "-2" }, { page: "x" }, { pageSize: "0" }, { pageSize: "101" }, { q: "x".repeat(101) }, { from: "2026-02-01", to: "2026-01-01" }])
  t(`refuses ${JSON.stringify(bad)}`, !q.safeParse(bad).success);
t("accepts a real event type", q.safeParse({ action: "platform.mfa.challenge_failed" }).success);
t("accepts uuid filters", q.safeParse({ admin: U, institution: U }).success);
t("date-only 'to' covers the whole day", (() => { const v = q.parse({ to: "2026-03-05" }); return v.to!.toISOString() === "2026-03-05T23:59:59.999Z"; })());
t("date-only 'from' starts at midnight UTC", q.parse({ from: "2026-03-05" }).from!.toISOString() === "2026-03-05T00:00:00.000Z");
t("same-day range is allowed", q.safeParse({ from: "2026-03-05", to: "2026-03-05" }).success);
t("ISO timestamps accepted", q.safeParse({ from: "2026-03-05T10:00:00Z" }).success);

t("failed actions are failures", outcomeOf("platform.mfa.challenge_failed") === "failure" && outcomeOf("platform.mfa.enroll_failed") === "failure" && outcomeOf("platform.mfa.remove_failed") === "failure");
t("other actions are successes", outcomeOf("institution.provision") === "success" && outcomeOf("platform.mfa.enrolled") === "success" && outcomeOf("platform.admin.created") === "success");
t("'failed' in the middle is not a failure", outcomeOf("platform.failed_over.ok") === "success");

const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz0123456789";
const r = redact({ password: "hunter2", Password: "x", apiKey: "k", api_key: "k", secret: "s", token: "t", accessToken: "t", refresh_token: "t", authorization: "Bearer abc", cookie: "c", session: "s", otp: "123456", code: "123456", passwordHash: "h", privateKey: "p",
  nested: { deep: { token: "t", fine: "visible" } }, list: [{ secret: "s", name: "ok" }], jwtLike: jwt, skKey: "sk-abcdefghijklmnopqrstuvwxyz123456", bearer: "Bearer abcdefghijklmnop", longBlob: "A".repeat(60), name: "Anna College", count: 5, flag: true, none: null }) as Record<string, unknown>;
const s = JSON.stringify(r);
for (const k of ["password", "Password", "apiKey", "api_key", "secret", "token", "accessToken", "refresh_token", "authorization", "cookie", "session", "otp", "code", "passwordHash", "privateKey"]) t(`hides key ${k}`, r[k] === "[hidden]");
t("hides nested and listed secrets", s.includes('"fine":"visible"') && !s.includes('"token":"t"') && !s.includes('"secret":"s"'));
t("hides a JWT-shaped value under an innocent key", r.jwtLike === "[hidden]");
t("hides an sk- style key value", r.skKey === "[hidden]");
t("hides a long opaque blob", r.longBlob === "[hidden]");
t("keeps ordinary values", r.name === "Anna College" && r.count === 5 && r.flag === true && r.none === null);
t("does not mutate its input", (() => { const o = { password: "p" }; redact(o); return o.password === "p"; })());
t("very deep structure is cut off safely", (() => { let o: unknown = "end"; for (let i = 0; i < 20; i++) o = { a: o }; return JSON.stringify(redact(o)).includes("too deep"); })());
t("long text is truncated", (redact("x ".repeat(400)) as string).length <= 501);
t("non-objects pass through", redact(null) === null && redact(3) === 3);
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

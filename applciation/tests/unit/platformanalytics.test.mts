// Unit tests: analytics query contract, rate rule and bucket helpers. No database needed.
import { analyticsQuery as q, institutionTableQuery as tq, TABLE_SORTS, rate, bucketFor, bucketKeys } from "../../lib/platformAnalytics";
let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const U = "3f0d2a7e-5b1c-4f8e-9a6d-0c1b2a3d4e5f";

t("filters default to everything", (() => { const v = q.parse({}); return v.status === "all" && !v.from && !v.to && !v.institution; })());
t("accepts institution, status and dates", q.safeParse({ institution: U, status: "suspended", from: "2026-01-01", to: "2026-02-01" }).success);
for (const bad of [{ status: "deleted" }, { status: "ACTIVE" }, { institution: "x" }, { institution: "1; drop" }, { from: "yesterday" }, { to: "2026-13-45" }, { from: "2026-03-01", to: "2026-02-01" }])
  t(`refuses ${JSON.stringify(bad)}`, !q.safeParse(bad).success);
t("date-only 'to' covers the whole UTC day", q.parse({ to: "2026-03-05" }).to!.toISOString() === "2026-03-05T23:59:59.999Z");
t("date-only 'from' starts at UTC midnight", q.parse({ from: "2026-03-05" }).from!.toISOString() === "2026-03-05T00:00:00.000Z");
t("single-day range allowed", q.safeParse({ from: "2026-03-05", to: "2026-03-05" }).success);

t("table defaults", (() => { const v = tq.parse({}); return v.sort === "students" && v.order === "desc" && v.page === 1 && v.pageSize === 10; })());
t("every sort key accepted", TABLE_SORTS.every((s) => tq.safeParse({ sort: s }).success));
for (const bad of [{ sort: "id" }, { sort: "name;drop" }, { sort: "isActive" }, { order: "up" }, { page: "0" }, { page: "x" }, { pageSize: "0" }, { pageSize: "101" }, { q: "x".repeat(101) }, { status: "x" }, { from: "2026-03-01", to: "2026-02-01" }])
  t(`table refuses ${JSON.stringify(bad)}`, !tq.safeParse(bad).success);

t("rate: normal", rate(1, 4) === 25);
t("rate: one decimal", rate(1, 3) === 33.3 && rate(2, 3) === 66.7);
t("rate: nobody registered is null, never 0%", rate(0, 0) === null && rate(5, 0) === null);
t("rate: zero placed of some is 0", rate(0, 10) === 0);
t("rate: everyone placed is 100", rate(7, 7) === 100);

t("bucket: up to 92 days is daily", bucketFor(new Date("2026-01-01"), new Date("2026-04-02")) === "day");
t("bucket: over 92 days is monthly", bucketFor(new Date("2026-01-01"), new Date("2026-06-01")) === "month");
t("bucket: no range is monthly", bucketFor() === "month");
const days = bucketKeys(new Date("2026-02-27T10:00:00Z"), new Date("2026-03-02T01:00:00Z"), "day");
t("daily keys cover every UTC day including a month end", JSON.stringify(days) === JSON.stringify(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]), JSON.stringify(days));
const months = bucketKeys(new Date("2025-11-15T00:00:00Z"), new Date("2026-02-01T00:00:00Z"), "month");
t("monthly keys cross a year boundary", JSON.stringify(months) === JSON.stringify(["2025-11", "2025-12", "2026-01", "2026-02"]), JSON.stringify(months));
t("leap day is a bucket", bucketKeys(new Date("2028-02-28T00:00:00Z"), new Date("2028-03-01T00:00:00Z"), "day").includes("2028-02-29"));
t("a late-evening UTC instant stays on its UTC day", bucketKeys(new Date("2026-03-05T23:59:59.999Z"), new Date("2026-03-05T23:59:59.999Z"), "day")[0] === "2026-03-05");
t("keys are capped", bucketKeys(new Date("2000-01-01"), new Date("2026-01-01"), "day").length <= 400);
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

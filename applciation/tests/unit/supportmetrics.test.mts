// Unit tests: support resolution-time summary (pure: no database).
import { summariseResolution } from "../../lib/platformSupport";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };
const d = (iso: string) => new Date(iso);
const row = (a: string, b: string | null) => ({ createdAt: d(a), resolvedAt: b ? d(b) : null });

const none = summariseResolution([]);
t("no resolved requests gives no median and no average, not zero", none.resolved === 0 && none.medianHours === null && none.averageHours === null);
const one = summariseResolution([row("2026-06-01T00:00:00Z", "2026-06-01T06:00:00Z")]);
t("one request resolved in six hours", one.resolved === 1 && one.medianHours === 6 && one.averageHours === 6);
const odd = summariseResolution([row("2026-06-01T00:00:00Z", "2026-06-01T01:00:00Z"), row("2026-06-01T00:00:00Z", "2026-06-01T03:00:00Z"), row("2026-06-01T00:00:00Z", "2026-06-02T00:00:00Z")]);
t("median of three (1h, 3h, 24h) is 3h and the average is 9.3h", odd.medianHours === 3 && odd.averageHours === 9.3, JSON.stringify(odd));
const even = summariseResolution([row("2026-06-01T00:00:00Z", "2026-06-01T02:00:00Z"), row("2026-06-01T00:00:00Z", "2026-06-01T04:00:00Z")]);
t("median of two is their midpoint", even.medianHours === 3);
const bad = summariseResolution([row("2026-06-01T00:00:00Z", null), row("2026-06-02T00:00:00Z", "2026-06-01T00:00:00Z"), row("2026-06-01T00:00:00Z", "2026-06-01T02:00:00Z")]);
t("rows without a resolution time, or resolved before they were opened, are ignored", bad.resolved === 1 && bad.medianHours === 2);
t("input order does not matter", summariseResolution([row("2026-06-01T00:00:00Z", "2026-06-02T00:00:00Z"), row("2026-06-01T00:00:00Z", "2026-06-01T01:00:00Z"), row("2026-06-01T00:00:00Z", "2026-06-01T03:00:00Z")]).medianHours === 3);

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

// Integration tests for AI usage tracking and daily limits (Phase 4.4.5) against the ISOLATED LOCAL Docker PostgreSQL only.   npm run test:ai-usage:db
// Real database, real constraints, real concurrency. No provider is contacted: the "provider call" is a function the test supplies. Every institution id is a random UUID.
import { inspect, } from "node:util";
import { randomUUID } from "node:crypto";
import { loadEnvFiles } from "../../scripts/lib/envFiles";
import { assertLocalTargets } from "../../lib/localOnly";

loadEnvFiles();
assertLocalTargets(process.env, { strict: true, what: "run the AI usage database tests" });
process.env.REQUIRE_LOCAL_DB = "true";

const printed: string[] = [];
for (const m of ["log", "warn", "error"] as const) { const o = console[m].bind(console); console[m] = (...a: unknown[]) => { const l = a.map((x) => (typeof x === "string" ? x : inspect(x))).join(" "); printed.push(l); o(l); }; }
let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };

const { db } = await import("../../lib/db");
const L = await import("../../lib/ai/limits");
const U = await import("../../lib/ai/usage");
const G = await import("../../lib/ai/gate");
const C = await import("../../lib/ai/context");
const { ApiError } = await import("../../lib/api/errors");

const clean = async () => { await db.$executeRaw`DELETE FROM "AiLimit"`; await db.$executeRaw`DELETE FROM "AiQuotaCounter"`; await db.$executeRaw`DELETE FROM "AiUsageDaily"`; L.invalidateLimits(); };
const used = async (scope: string) => (await db.aiQuotaCounter.findFirst({ where: { scope, day: new Date(`${L.dayOf()}T00:00:00Z`) } }))?.used ?? 0;
type LimitKind = "COLLEGE_DEFAULT" | "COLLEGE" | "PROVIDER" | "PURPOSE";
const setLim = (kind: LimitKind, key: string, n: number | null) => L.setLimitAudited({ kind, key, dailyCalls: n, adminId: null }, () => []);
const A = randomUUID(), B = randomUUID(), D = randomUUID();
const res = (college: string, purpose = "TEXT", provider = "GROQ") => L.reserve({ collegeKey: college, provider, purpose });

await clean();

// ---- no built-in limits
{
  const r = await Promise.all(Array.from({ length: 20 }, () => res(A)));
  t("with no limits set, every call is allowed (the platform ships with no built-in limit)", r.every((x) => x.ok));
  t("every call is still counted, per institution, provider and purpose", (await used(`college:${A}`)) === 20 && (await used("provider:GROQ")) === 20 && (await used("purpose:TEXT")) === 20);
}

// ---- a provider limit under heavy concurrency
await clean();
{
  await setLim("PROVIDER", "GROQ", 25);
  const r = await Promise.all(Array.from({ length: 80 }, (_, i) => res(i % 2 ? A : B)));
  const ok = r.filter((x) => x.ok).length;
  t("80 simultaneous calls against a provider limit of 25: exactly 25 are allowed, the other 55 refused", ok === 25, `allowed ${ok}`);
  t("the provider counter is exactly the limit, never above it", (await used("provider:GROQ")) === 25);
  t("refused calls charged nothing: the institution counters add up to the 25 allowed", (await used(`college:${A}`)) + (await used(`college:${B}`)) === 25 && (await used("purpose:TEXT")) === 25);
  t("a refusal says which kind of limit was reached", r.filter((x) => !x.ok).every((x) => !x.ok && x.scope === "provider" && x.limit === 25));
}

// ---- institution limits: own limit, default, isolation
await clean();
{
  await setLim("COLLEGE", A, 3);
  await setLim("COLLEGE_DEFAULT", "*", 5);
  const a = await Promise.all(Array.from({ length: 10 }, () => res(A)));
  const b = await Promise.all(Array.from({ length: 10 }, () => res(B)));
  t("an institution with its own limit gets exactly that many calls (3)", a.filter((x) => x.ok).length === 3);
  t("every other institution gets the default (5), and is not affected by the first one using its allowance", b.filter((x) => x.ok).length === 5);
  t("a refused institution call reports the institution scope", a.filter((x) => !x.ok).every((x) => !x.ok && x.scope === "college"));
  await setLim("COLLEGE", A, null);
  const a2 = [await res(A), await res(A), await res(A)];
  t("removing an institution's own limit makes the default (5) apply to it: it had used 3, so 2 more are allowed and the next is refused", a2.map((x) => x.ok).join() === "true,true,false");
  await setLim("COLLEGE_DEFAULT", "*", null);
  t("removing the default leaves that institution with no limit again", (await res(A)).ok);
}

// ---- nothing is charged when any scope is full
await clean();
{
  await setLim("PURPOSE", "TEXT", 2);
  await setLim("COLLEGE", A, 100);
  for (let i = 0; i < 2; i++) await res(A);
  const before = [await used(`college:${A}`), await used("provider:GROQ"), await used("purpose:TEXT")];
  const r = await res(A);
  const after = [await used(`college:${A}`), await used("provider:GROQ"), await used("purpose:TEXT")];
  t("a purpose limit refuses with the purpose scope", !r.ok && r.scope === "purpose");
  t("a refused call is rolled back in every scope (institution and provider counters did not move)", JSON.stringify(before) === JSON.stringify(after), `${before} -> ${after}`);
  t("a different purpose is not affected by the full one", (await res(A, "INTERVIEW", "ANTHROPIC")).ok);
}

// ---- zero blocks, limits are bounded and validated
await clean();
{
  await setLim("PROVIDER", "ANTHROPIC", 0);
  const r = await res(A, "INTERVIEW", "ANTHROPIC");
  t("a limit of 0 blocks every call in that scope", !r.ok && r.limit === 0);
  t("a limit of 0 charges nothing", (await used("provider:ANTHROPIC")) === 0);
  const bad = async (f: () => Promise<unknown>) => { try { await f(); return false; } catch (e) { return e instanceof RangeError; } };
  t("a negative limit is rejected", await bad(() => setLim("PROVIDER", "GROQ", -1)));
  t("a fractional limit is rejected", await bad(() => setLim("PROVIDER", "GROQ", 1.5)));
  t("a limit above the 10,000,000 ceiling is rejected", await bad(() => setLim("PROVIDER", "GROQ", 10_000_001)));
  t("a provider that does not exist is rejected", await bad(() => setLim("PROVIDER", "OPENAI", 5)));
  t("an institution key that is not a UUID is rejected", await bad(() => setLim("COLLEGE", "not-a-uuid", 5)));
  t("the default limit only accepts the key *", await bad(() => setLim("COLLEGE_DEFAULT", A, 5)));
}

// ---- the limit change and its audit are one transaction
await clean();
{
  let threw = false;
  try { await L.setLimitAudited({ kind: "PROVIDER", key: "GROQ", dailyCalls: 7, adminId: null }, () => { throw new Error("audit failed"); }); } catch { threw = true; }
  t("when the audit record cannot be written, the limit change is rolled back too", threw && (await db.aiLimit.count()) === 0);
  const audits: unknown[] = [];
  await L.setLimitAudited({ kind: "PROVIDER", key: "GROQ", dailyCalls: 7, adminId: null }, (b, a) => { audits.push([b, a]); return [{ action: "ai.limit.set", detail: { before: b, after: a } }]; });
  const row = await db.platformAuditLog.findFirst({ where: { action: "ai.limit.set" }, orderBy: { createdAt: "desc" } });
  t("a successful change writes its audit row in the same transaction, with before and after", !!row && JSON.stringify(audits[0]) === "[null,7]");
}

// ---- storage failure never blocks a call
await clean();
{
  await db.$executeRaw`ALTER TABLE "AiQuotaCounter" RENAME TO "AiQuotaCounter_off"`;
  try {
    const r = await res(A);
    t("if the counter table cannot be used the call is allowed (a statistics problem never breaks AI)", r.ok);
  } finally { await db.$executeRaw`ALTER TABLE "AiQuotaCounter_off" RENAME TO "AiQuotaCounter"`; }
  t("and the failure was logged without any value", printed.some((l) => l.includes("AI limit check unavailable")) && !printed.some((l) => l.includes(A)));
}

// ---- day rollover
await clean();
{
  await setLim("PROVIDER", "GROQ", 2);
  const today = new Date(), tomorrow = new Date(today.getTime() + 86_400_000);
  const r1 = [await L.reserve({ collegeKey: A, provider: "GROQ", purpose: "TEXT" }, today), await L.reserve({ collegeKey: A, provider: "GROQ", purpose: "TEXT" }, today), await L.reserve({ collegeKey: A, provider: "GROQ", purpose: "TEXT" }, today)];
  const r2 = await L.reserve({ collegeKey: A, provider: "GROQ", purpose: "TEXT" }, tomorrow);
  t("limits are per UTC day: the third call today is refused", r1.map((x) => x.ok).join() === "true,true,false");
  t("the next UTC day starts a fresh count", r2.ok);
}

// ---- usage recording through the gate
await clean();
{
  const meta = { purpose: "TEXT" as const, provider: "GROQ" as const, model: "test-model", feature: "unit_test" };
  const rows = () => db.aiUsageDaily.findMany({ where: { collegeKey: A } });
  await C.runWithAiContext(A, () => G.withAiCall(meta, async () => "fine"));
  await C.runWithAiContext(A, () => G.withAiCall(meta, async () => "fine"));
  await C.runWithAiContext(A, () => G.withAiCall(meta, async () => { throw new ApiError(502, "AI_FAILED", "boom"); }).catch(() => undefined));
  await C.runWithAiContext(A, () => G.withAiCall(meta, async (note) => { note("timeout"); throw new ApiError(502, "AI_FAILED", "slow"); }).catch(() => undefined));
  await C.runWithAiContext(A, () => G.withAiCall(meta, async () => { throw new ApiError(429, "AI_BUSY", "busy"); }).catch(() => undefined));
  const [r] = await rows();
  t("outcomes are counted: 5 calls: 2 succeeded, 1 failed, 1 timed out, 1 was rate limited by the provider", r.calls === 5 && r.failures === 1 && r.timeouts === 1 && r.rateLimited === 1, String(r.calls));
  t("the same institution, purpose, provider, model and feature share one row (a daily aggregate, not one row per call)", (await rows()).length === 1);
  t("durations are summed so an average can be shown", r.totalMs >= BigInt(0));

  await setLim("PROVIDER", "GROQ", 5); // 5 already used
  let ran = false, err: unknown = null;
  await C.runWithAiContext(A, () => G.withAiCall(meta, async () => { ran = true; return 1; }).catch((e) => { err = e; }));
  t("a call refused by a limit never reaches the provider", !ran);
  t("the refusal is 429 AI_LIMIT_REACHED with a neutral message", err instanceof ApiError && err.status === 429 && err.code === "AI_LIMIT_REACHED" && !/GROQ|TEXT|[0-9a-f]{8}-/.test(err.message), String((err as Error)?.message));
  const [r2] = await rows();
  t("a refused call is recorded as blocked and is not counted as a call", r2.blocked === 1 && r2.calls === 5);

  await setLim("PROVIDER", "GROQ", null);
  await G.withAiCall(meta, async () => 1);
  await C.runWithAiContext(B, () => G.withAiCall({ ...meta, feature: "other_feature" }, async () => 1));
  await C.runWithAiContext("not-a-uuid", () => G.withAiCall({ ...meta, feature: "odd_context" }, async () => 1));
  t("a call made outside any request is counted for the platform, not for an institution", (await db.aiUsageDaily.count({ where: { collegeKey: "platform", feature: "unit_test" } })) === 1);
  t("a call inside another institution's request is counted for that institution only", (await db.aiUsageDaily.count({ where: { collegeKey: B, feature: "other_feature" } })) === 1 && (await db.aiUsageDaily.count({ where: { collegeKey: A, feature: "other_feature" } })) === 0);
  t("a context that is not a valid institution id is counted as the platform (it can never reach a key)", (await db.aiUsageDaily.count({ where: { collegeKey: "platform", feature: "odd_context" } })) === 1);
}

// ---- nothing but safe names reaches the table
await clean();
{
  await U.recordUsage({ collegeKey: A, purpose: "TEXT", provider: "GROQ", model: "m'; DROP TABLE \"AiUsageDaily\"; --", feature: "Student answer: my secret essay text that is far too long to be a feature name ".repeat(3) }, "success", 10);
  const [r] = await db.aiUsageDaily.findMany();
  t("a model or feature value that is not a plain name is replaced, so nothing odd can be stored", r.model === "unknown" && r.feature === "other");
  const cols = Object.keys(r).sort().join(",");
  t("the table holds only counts, times and names: no user, prompt, answer or document column", cols === "blocked,calls,collegeKey,day,failures,feature,id,model,provider,purpose,rateLimited,timeouts,totalMs,updatedAt", cols);
}

// ---- reading
await clean();
{
  const real = await db.college.findFirst({ select: { id: true, name: true } });
  const ids = [A, B, D, ...(real ? [real.id] : [])];
  let n = 1;
  for (const id of ids) { for (let i = 0; i < n; i++) await U.recordUsage({ collegeKey: id, purpose: "TEXT", provider: "GROQ", model: "m1", feature: "f1" }, i % 3 === 0 ? "failure" : "success", 50); n += 2; }
  await U.recordUsage({ collegeKey: A, purpose: "INTERVIEW", provider: "ANTHROPIC", model: "m2", feature: "f2" }, "success", 100);
  const s = await U.usageSummary(7);
  t("the summary adds up: total calls equal the sum of the purposes", s.totals.calls === s.byPurpose.reduce((a, b) => a + b.calls, 0) && s.totals.calls > 0);
  t("the summary breaks down by provider, model and feature, busiest first", s.byProvider[0].key === "GROQ" && s.byModel.length === 2 && s.byFeature.length === 2 && s.byFeature[0].calls >= s.byFeature[1].calls);
  t("the daily trend has an entry for today", s.trend.some((d) => d.day === L.dayOf()));
  t("a window above 90 days is clamped to 90; a window below 1 is clamped to 1; nonsense falls back to 7", U.clampDays(1000) === 90 && U.clampDays(0) === 1 && U.clampDays(Number.NaN) === 7 && (await U.usageSummary(100000)).days === 90);
  const p1 = await U.usageByCollege(7, 1, 2), p2 = await U.usageByCollege(7, 2, 2);
  t("per-institution usage is paginated: 2 per page, busiest first, no overlap", p1.rows.length === 2 && p1.total === ids.length && p2.rows.length === Math.min(2, ids.length - 2) && !p1.rows.some((r) => p2.rows.some((q) => q.collegeKey === r.collegeKey)) && p1.rows[0].calls >= p1.rows[1].calls);
  t("the page size is capped at 50", (await U.usageByCollege(7, 1, 100000)).pageSize === 50);
  t("an institution that is not in the college table is shown as unknown, not by its id", (await U.usageByCollege(7, 1, 50)).rows.some((r) => r.name === "Unknown institution"));
  if (real) t("a real institution is shown by name", (await U.usageByCollege(7, 1, 50)).rows.some((r) => r.collegeKey === real.id && r.name === real.name));
}

// ---- retention
await clean();
{
  const old = new Date(Date.now() - 100 * 86_400_000), mid = new Date(Date.now() - 60 * 86_400_000);
  await U.recordUsage({ collegeKey: A, purpose: "TEXT", provider: "GROQ", model: "m", feature: "f" }, "success", 1, old);
  await U.recordUsage({ collegeKey: A, purpose: "TEXT", provider: "GROQ", model: "m", feature: "f" }, "success", 1, mid);
  await U.recordUsage({ collegeKey: A, purpose: "TEXT", provider: "GROQ", model: "m", feature: "f" }, "success", 1);
  await L.reserve({ collegeKey: A, provider: "GROQ", purpose: "TEXT" }, new Date(Date.now() - 5 * 86_400_000));
  await L.reserve({ collegeKey: A, provider: "GROQ", purpose: "TEXT" });
  const r = { ...(await U.pruneAiUsage()), counters: await U.pruneAiQuotaCounters() };
  t("usage older than 90 days is removed; 60-day-old and current usage is kept", r.usage === 1 && (await db.aiUsageDaily.count()) === 2, JSON.stringify(r));
  t("quota counters older than 3 days are removed; today's are kept", r.counters >= 3 && (await db.aiQuotaCounter.count({ where: { day: { lt: new Date(Date.now() - 3 * 86_400_000) } } })) === 0);
  t("pruning an already-clean table removes nothing and does not fail", (await U.pruneAiUsage()).usage === 0);
}

// ---- the consumption view
await clean();
{
  await setLim("PROVIDER", "GROQ", 10);
  await setLim("COLLEGE_DEFAULT", "*", 4);
  for (let i = 0; i < 3; i++) await res(A);
  const c = await L.consumption();
  const col = c.find((x) => x.scope === `college:${A}`), prov = c.find((x) => x.scope === "provider:GROQ");
  t("consumption shows used and the limit that applies to each scope (the default for an institution without its own)", col?.used === 3 && col.limit === 4 && prov?.used === 3 && prov.limit === 10 && Math.abs((col.ratio ?? 0) - 0.75) < 1e-9);
}

// ---- no secrets or request text anywhere in what the suite printed
t("nothing the suite printed contains an institution id", !printed.some((l) => l.includes(A) || l.includes(B)));

await clean();
await db.$disconnect();
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);

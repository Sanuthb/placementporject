// Retention safeguards (Gate 4 review of A-18) against the ISOLATED LOCAL Docker PostgreSQL only.   npm run test:retention:db
// Real database, real constraints, real concurrency, no HTTP. Synthetic rows are tagged and removed at the end; the platform policy row is restored.
import { randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { loadEnvFiles } from "../../scripts/lib/envFiles";
import { assertLocalTargets } from "../../lib/localOnly";

loadEnvFiles();
assertLocalTargets(process.env, { strict: true, what: "run the retention database tests" });
process.env.REQUIRE_LOCAL_DB = "true";
let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };

const { db } = await import("../../lib/db");
const { runCleanup, setRetention, policyView } = await import("../../lib/platformPolicyAdmin");
const { invalidatePolicy, RETENTION } = await import("../../lib/platformPolicy");
const { pruneAiQuotaCounters } = await import("../../lib/ai/usage");
const { dayOf } = await import("../../lib/ai/limits");
const { ApiError } = await import("../../lib/api/errors");

const tag = randomUUID().slice(0, 8);
const admin = { adminId: randomUUID(), email: `retention-${tag}@example.test`, name: "Retention Test", token: "", mfa: {} } as unknown as import("../../lib/auth/platform").PlatformSession;
const DAY = 86_400_000, now = Date.now();
const ago = (days: number, extraMs = 0) => new Date(now - days * DAY + extraMs);
const THREE = ["JobRun", "MonitorEvent", "AiUsageDaily"];

// ---------- helpers ----------
async function tableCounts(): Promise<Record<string, number>> {
  const names = (await db.$queryRawUnsafe<{ table_name: string }[]>(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`)).map((r) => r.table_name);
  const out: Record<string, number> = {};
  for (const n of names) out[n] = Number((await db.$queryRawUnsafe<{ c: bigint }[]>(`select count(*) c from "${n}"`))[0].c);
  return out;
}
const seedJobs = (n: number, daysAgo: number, label: string) => db.$executeRawUnsafe(`INSERT INTO "JobRun" (id, job, trigger, "slotAt", "startedAt", "lastStartedAt") SELECT gen_random_uuid(), $1, 'test', ($2::timestamptz - (g * interval '1 minute')), now(), now() FROM generate_series(1, $3) g`, `rt-${tag}-${label}`, new Date(now - daysAgo * DAY).toISOString(), n);
const seedEvents = (n: number, daysAgo: number, label: string) => db.$executeRawUnsafe(`INSERT INTO "MonitorEvent" (id, at, service, code, message) SELECT gen_random_uuid(), ($2::timestamptz - (g * interval '1 second')), $1, 'TEST', 'synthetic' FROM generate_series(1, $3) g`, `rt-${tag}-${label}`, new Date(now - daysAgo * DAY).toISOString(), n);
const seedAi = (n: number, daysAgo: number, label: string) => db.$executeRawUnsafe(`INSERT INTO "AiUsageDaily" (id, day, "collegeKey", purpose, provider, model, feature, "updatedAt") SELECT gen_random_uuid(), $2::date, $1 || '-' || g, 'TEXT', 'GROQ', 'm', 'f', now() FROM generate_series(1, $3) g`, `rt-${tag}-${label}`, dayOf(new Date(now - daysAgo * DAY)), n);
const mine = async () => ({
  job: await db.jobRun.count({ where: { job: { startsWith: `rt-${tag}-` } } }),
  ev: await db.monitorEvent.count({ where: { service: { startsWith: `rt-${tag}-` } } }),
  ai: await db.aiUsageDaily.count({ where: { collegeKey: { startsWith: `rt-${tag}-` } } }),
});
const policyRow = () => db.$queryRawUnsafe<Record<string, unknown>[]>(`select * from "PlatformPolicy"`);
const rejects = async (sql: string) => { try { await db.$executeRawUnsafe(sql); return false; } catch (e) { return /check|violat|23514/i.test(inspect(e)); } };
const audits = () => db.platformAuditLog.findMany({ where: { OR: [{ email: admin.email }, { email: "system" }], createdAt: { gte: new Date(now - 2000) } }, orderBy: { createdAt: "asc" } });

const savedPolicy = await policyRow();
await db.platformPolicy.deleteMany(); invalidatePolicy();
try {
  // ================= 1. the database itself enforces the approved ranges =================
  await db.platformPolicy.create({ data: { id: "platform" } });
  const bad = [["retentionJobRunDays", 29], ["retentionJobRunDays", 366], ["retentionJobRunDays", 0], ["retentionJobRunDays", -5], ["retentionMonitorEventDays", 6], ["retentionMonitorEventDays", 91], ["retentionAiUsageDays", 29], ["retentionAiUsageDays", 366]] as const;
  const results = await Promise.all(bad.map(([c, v]) => rejects(`UPDATE "PlatformPolicy" SET "${c}" = ${v}`)));
  t("DATABASE: every value outside the approved ranges is rejected by a check constraint, even when written directly in SQL (29/366/0/-5 days job history, 6/91 monitoring, 29/366 AI usage)", results.every(Boolean), JSON.stringify(results));
  const edges = [["retentionJobRunDays", 30], ["retentionJobRunDays", 365], ["retentionMonitorEventDays", 7], ["retentionMonitorEventDays", 90], ["retentionAiUsageDays", 30], ["retentionAiUsageDays", 365]] as const;
  let edgesOk = true; for (const [c, v] of edges) { try { await db.$executeRawUnsafe(`UPDATE "PlatformPolicy" SET "${c}" = ${v}`); } catch { edgesOk = false; } }
  t("DATABASE: the boundary values themselves (30/365, 7/90, 30/365) are accepted", edgesOk);
  t("DATABASE: only one policy row can exist", await rejects(`INSERT INTO "PlatformPolicy" (id, "updatedAt") VALUES ('second', now())`));
  await db.$executeRawUnsafe(`UPDATE "PlatformPolicy" SET "retentionJobRunDays"=NULL, "retentionMonitorEventDays"=NULL, "retentionAiUsageDays"=NULL`); invalidatePolicy();
  t("the built-in defaults are inside the approved ranges", (Object.values(RETENTION)).every((r) => r.defaultDays >= r.min && r.defaultDays <= r.max));

  // ================= 2. shortening needs explicit confirmation (nothing is deleted by saving) =================
  await seedJobs(40, 60, "confirm"); await seedEvents(25, 10, "confirm"); await seedAi(30, 50, "confirm");
  const before2 = await mine(); const polBefore = JSON.stringify(await policyRow());
  let err: InstanceType<typeof ApiError> | null = null;
  try { await setRetention(admin, { jobRunDays: 30, monitorEventDays: 7, aiUsageDays: 30 }); } catch (e) { err = e as InstanceType<typeof ApiError>; }
  const wd = (err as unknown as { details?: { wouldDelete?: Record<string, number> } } | null)?.details?.wouldDelete ?? (err as unknown as { extra?: { wouldDelete?: Record<string, number> } } | null)?.extra?.wouldDelete;
  t("shortening without confirm is refused (409 CONFIRMATION_REQUIRED)", err?.status === 409 && err.code === "CONFIRMATION_REQUIRED", inspect(err));
  t("the refusal reports how many records would be deleted (at least the seeded ones), and changed nothing", !!wd && (wd.jobRun ?? 0) >= 40 && (wd.monitorEvent ?? 0) >= 25 && (wd.aiUsage ?? 0) >= 30 && JSON.stringify(await policyRow()) === polBefore && JSON.stringify(await mine()) === JSON.stringify(before2), JSON.stringify(wd));
  const confirmed = await setRetention(admin, { jobRunDays: 30, monitorEventDays: 7, aiUsageDays: 30, confirm: true });
  t("with confirm: true the change is saved, and saving itself deletes nothing", confirmed.changed === true && JSON.stringify(await mine()) === JSON.stringify(before2));
  const a1 = (await audits()).filter((a) => a.action === "policy.retention.update");
  const d1 = a1[0]?.detail as { before?: Record<string, number>; after?: Record<string, number>; confirmed?: boolean } | undefined;
  t("the configuration change is audited: who, before, after, confirmed", a1.length === 1 && a1[0].email === admin.email && d1?.before?.jobRun === 90 && d1?.after?.jobRun === 30 && d1?.after?.monitorEvent === 7 && d1?.confirmed === true, inspect(a1));
  const lengthen = await setRetention(admin, { jobRunDays: 60 });
  t("lengthening needs no confirmation and is audited too", lengthen.changed === true && (await audits()).filter((a) => a.action === "policy.retention.update").length === 2);
  await setRetention(admin, { jobRunDays: null, monitorEventDays: null, aiUsageDays: null, confirm: true }); // back to the built-in defaults 90/14/90
  invalidatePolicy();
  await db.jobRun.deleteMany({ where: { job: { startsWith: `rt-${tag}-confirm` } } }); await db.monitorEvent.deleteMany({ where: { service: { startsWith: `rt-${tag}-confirm` } } }); await db.aiUsageDaily.deleteMany({ where: { collegeKey: { startsWith: `rt-${tag}-confirm` } } });

  // ================= 3. the cleanup touches ONLY the three tables =================
  // defaults are in force (90 / 14 / 90). Rows just outside and just inside each period, plus an old rate-limit counter that must NOT be touched by the retention cleanup.
  await seedJobs(7, 90, "edge-old");    await db.$executeRawUnsafe(`UPDATE "JobRun" SET "slotAt" = "slotAt" - interval '2 hours' WHERE job = $1`, `rt-${tag}-edge-old`);
  await seedJobs(7, 90, "edge-new");    await db.$executeRawUnsafe(`UPDATE "JobRun" SET "slotAt" = "slotAt" + interval '2 hours' WHERE job = $1`, `rt-${tag}-edge-new`);
  await seedEvents(9, 14, "edge-old");  await db.$executeRawUnsafe(`UPDATE "MonitorEvent" SET at = at - interval '2 hours' WHERE service = $1`, `rt-${tag}-edge-old`);
  await seedEvents(9, 14, "edge-new");  await db.$executeRawUnsafe(`UPDATE "MonitorEvent" SET at = at + interval '2 hours' WHERE service = $1`, `rt-${tag}-edge-new`);
  await seedAi(11, 92, "edge-old"); await seedAi(11, 88, "edge-new");
  const cutoffDay = dayOf(new Date(now - 90 * DAY));
  await db.$executeRawUnsafe(`INSERT INTO "AiUsageDaily" (id, day, "collegeKey", purpose, provider, model, feature, "updatedAt") VALUES (gen_random_uuid(), $1::date, $2, 'TEXT', 'GROQ', 'm', 'f', now())`, cutoffDay, `rt-${tag}-edge-cutoffday`);
  await db.$executeRawUnsafe(`INSERT INTO "AiQuotaCounter" (id, day, scope, used, "updatedAt") VALUES (gen_random_uuid(), $1::date, $2, 1, now())`, dayOf(new Date(now - 10 * DAY)), `rt-${tag}-oldcounter`);
  const seeded = await mine();
  const all0 = await tableCounts(); const auditBefore = await db.platformAuditLog.count();
  const inWindow0 = { job: await db.jobRun.count({ where: { slotAt: { gte: ago(90) } } }), ev: await db.monitorEvent.count({ where: { at: { gte: ago(14) } } }), ai: await db.aiUsageDaily.count({ where: { day: { gte: new Date(`${cutoffDay}T00:00:00Z`) } } }) };
  const run1 = await runCleanup(admin);
  const all1 = await tableCounts();
  const changed = Object.keys(all1).filter((n) => all1[n] !== all0[n]);
  t("TABLE ISOLATION: comparing the row count of EVERY table before and after a cleanup run, only JobRun, MonitorEvent, AiUsageDaily (and the platform audit trail, which gains rows) changed", changed.every((n) => [...THREE, "PlatformAuditLog"].includes(n)) && THREE.every((n) => all1[n] <= all0[n]) && all1.PlatformAuditLog === all0.PlatformAuditLog + 1, JSON.stringify(changed.map((n) => [n, all0[n], all1[n]])));
  const protectedTables = Object.keys(all0).filter((n) => ![...THREE, "PlatformAuditLog"].includes(n));
  t(`no student, institution, user, document, audit or other business table lost or gained a row (${protectedTables.length} other tables compared; includes Student, College, User, Notification, AuditLog)`, protectedTables.length > 50 && protectedTables.every((n) => all1[n] === all0[n]) && ["Student", "College", "User"].every((n) => n in all0));
  t("the old rate-limit counter was NOT touched by the retention cleanup (it has its own housekeeping)", (await db.aiQuotaCounter.count({ where: { scope: `rt-${tag}-oldcounter` } })) === 1 && !("aiQuotaCounters" in run1));
  const after = await mine();
  t("rows just outside each period were removed; rows just inside (and the boundary day itself) were kept", after.job === 7 && after.ev === 9 && after.ai === 11 + 1 && (await db.aiUsageDaily.count({ where: { collegeKey: `rt-${tag}-edge-cutoffday` } })) === 1, JSON.stringify({ seeded, after }));
  t("the run reports what was removed (at least the seeded rows; older local test rows may add to it) and is not capped", run1.jobRuns >= 7 && run1.monitorEvents >= 9 && run1.aiUsageDays >= 11 && run1.capped === false && run1.error === null, JSON.stringify(run1));
  const inWindow1 = { job: await db.jobRun.count({ where: { slotAt: { gte: ago(90) } } }), ev: await db.monitorEvent.count({ where: { at: { gte: ago(14) } } }), ai: await db.aiUsageDaily.count({ where: { day: { gte: new Date(`${cutoffDay}T00:00:00Z`) } } }) };
  t("every record INSIDE its retention period (all rows, not only the seeded ones) is intact", JSON.stringify(inWindow1) === JSON.stringify(inWindow0), JSON.stringify({ inWindow0, inWindow1 }));
  t("a cleanup run by an administrator is audited with the administrator, what was removed and the periods used", await (async () => { const r = (await audits()).filter((a) => a.action === "retention.cleanup"); const d = r[0]?.detail as { jobRuns?: number; trigger?: string; days?: { jobRun: number } } | undefined; return r.length === 1 && r[0].email === admin.email && d?.jobRuns === run1.jobRuns && d?.trigger === "administrator" && d?.days?.jobRun === 90; })());
  t("the separate rate-limit counter housekeeping removes only counters older than 3 days", (await pruneAiQuotaCounters()) >= 1 && (await db.aiQuotaCounter.count({ where: { scope: `rt-${tag}-oldcounter` } })) === 0);
  await db.jobRun.deleteMany({ where: { job: { startsWith: `rt-${tag}-` } } }); await db.monitorEvent.deleteMany({ where: { service: { startsWith: `rt-${tag}-` } } }); await db.aiUsageDaily.deleteMany({ where: { collegeKey: { startsWith: `rt-${tag}-` } } });

  // ================= 4. bounded =================
  for (let k = 0; k < 20; k++) if (!(await runCleanup(admin)).capped) break; // start from a clean slate: drain any older local test rows first
  await seedJobs(6200, 400, "bulk"); await seedEvents(5300, 200, "bulk"); await seedAi(5100, 500, "bulk");
  const b1 = await runCleanup(admin); const m1 = await mine();
  t("BOUNDED: with 6,200 / 5,300 / 5,100 expired rows ONE run removes exactly 5 batches of 1,000 per table (5,000 each), leaves the rest, and reports 'capped'", b1.capped === true && b1.jobRuns === 5000 && b1.monitorEvents === 5000 && b1.aiUsageDays === 5000 && m1.job === 1200 && m1.ev === 300 && m1.ai === 100, JSON.stringify({ b1, m1 }));
  const b2 = await runCleanup(admin); const m2 = await mine();
  t("the next run removes the remainder (1,200 / 300 / 100), leaves nothing expired and is not capped", b2.jobRuns === 1200 && b2.monitorEvents === 300 && b2.aiUsageDays === 100 && b2.capped === false && m2.job === 0 && m2.ev === 0 && m2.ai === 0, JSON.stringify({ b2, m2 }));
  const b3 = await runCleanup(admin);
  t("a run with nothing left to remove removes zero and is not capped", b3.jobRuns === 0 && b3.monitorEvents === 0 && b3.aiUsageDays === 0 && b3.capped === false);

  // ================= 5. safe under concurrent execution =================
  await seedJobs(3000, 400, "conc"); await seedEvents(2500, 200, "conc"); await seedAi(2600, 500, "conc");
  const preOld = await mine();
  const [c1, c2, c3] = await Promise.all([runCleanup(admin), runCleanup(admin), runCleanup(null)]);
  const post = await mine();
  t("CONCURRENCY: three cleanups started at the same moment all finish without error", [c1, c2, c3].every((r) => r.error === null), JSON.stringify([c1, c2, c3]));
  t("CONCURRENCY: every expired row is removed exactly once (the three runs' counts add up to EXACTLY the seeded rows 3,000 / 2,500 / 2,600: nothing is double-deleted or double-counted), none are left", post.job === 0 && post.ev === 0 && post.ai === 0 && c1.jobRuns + c2.jobRuns + c3.jobRuns === preOld.job && c1.monitorEvents + c2.monitorEvents + c3.monitorEvents === preOld.ev && c1.aiUsageDays + c2.aiUsageDays + c3.aiUsageDays === preOld.ai, JSON.stringify({ preOld, post }));
  const conc = (await audits()).filter((a) => a.action === "retention.cleanup");
  t("CONCURRENCY: each run is audited (administrator runs always; the scheduled run when it removed something) and no run is lost", conc.length >= 7 && conc.filter((a) => a.email === admin.email).length >= 6);
  const fresh = await db.jobRun.count({ where: { slotAt: { gte: ago(90) } } });
  t("CONCURRENCY: records inside their period are unaffected", fresh === inWindow1.job - 7 && (await db.monitorEvent.count({ where: { at: { gte: ago(14) } } })) === inWindow1.ev - 9);
} finally {
  await db.jobRun.deleteMany({ where: { job: { startsWith: `rt-${tag}-` } } }); await db.monitorEvent.deleteMany({ where: { service: { startsWith: `rt-${tag}-` } } });
  await db.aiUsageDaily.deleteMany({ where: { collegeKey: { startsWith: `rt-${tag}-` } } }); await db.aiQuotaCounter.deleteMany({ where: { scope: { startsWith: `rt-${tag}-` } } });
  await db.platformAuditLog.deleteMany({ where: { email: admin.email } });
  await db.platformAuditLog.deleteMany({ where: { email: "system", action: "retention.cleanup", createdAt: { gte: new Date(now - 2000) } } }); // this run's scheduled-job rows
  await db.platformPolicy.deleteMany();
  for (const r of savedPolicy) await db.platformPolicy.create({ data: { id: "platform", requireAdminMfa: Boolean(r.requireAdminMfa), retentionJobRunDays: (r.retentionJobRunDays as number | null) ?? null, retentionMonitorEventDays: (r.retentionMonitorEventDays as number | null) ?? null, retentionAiUsageDays: (r.retentionAiUsageDays as number | null) ?? null } });
  invalidatePolicy(); void policyView;
  await db.$disconnect();
}
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);

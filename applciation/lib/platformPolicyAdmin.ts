import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";
import { clientIp } from "@/lib/rateLimit";
import { pruneMonitoring } from "@/lib/monitorRetention";
import { pruneAiUsage } from "@/lib/ai/usage";
import { dayOf } from "@/lib/ai/limits";
import { getPolicy, invalidatePolicy, RETENTION, RETENTION_KEYS, type RetentionKey, type retentionInput as RI } from "@/lib/platformPolicy";
import type { PlatformSession } from "@/lib/auth/platform";
import type { z } from "zod";

/**
 * Reading and changing the platform policy (SA-TC-012). Every change is one transaction with its platform audit row (who, when, before and after).
 * Shortening a retention period never deletes at once: the change is saved, and the bounded cleanup (hourly job, or "run now") removes the rows that fall outside the new period.
 * Because that deletion cannot be undone, a change that would remove rows is refused until the administrator confirms it, and the refusal says how many rows are affected.
 */
type Tx = Prisma.TransactionClient;
const log = (tx: Tx, a: { adminId: string | null; email: string | null } , action: string, detail: Prisma.InputJsonValue, req?: Request) =>
  tx.platformAuditLog.create({ data: { adminId: a.adminId, email: a.email, action, detail, ip: req ? clientIp(req) : null } });
const lockPolicy = (tx: Tx) => tx.$executeRaw`select pg_advisory_xact_lock(hashtext('platform-policy'))`;

/** Rows that lie outside a retention period of `days` (what the cleanup would delete). */
export async function rowsOutside(key: RetentionKey, days: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  if (key === "jobRun") return db.jobRun.count({ where: { slotAt: { lt: cutoff } } });
  if (key === "monitorEvent") return db.monitorEvent.count({ where: { at: { lt: cutoff } } });
  return db.aiUsageDaily.count({ where: { day: { lt: new Date(`${dayOf(cutoff)}T00:00:00Z`) } } });
}

export async function policyView() {
  const p = await getPolicy(true);
  const [admins, inst, strictInst] = await Promise.all([
    db.user.count({ where: { isActive: true, OR: [{ role: "TPO_ADMIN" }, { extraRoles: { has: "TPO_ADMIN" } }], college: { isActive: true } } }),
    db.college.count({ where: { isActive: true } }),
    db.collegeSettings.count({ where: { requireMfaForAdmins: true, college: { isActive: true } } }),
  ]);
  const items = await Promise.all(RETENTION_KEYS.map(async (k) => ({
    key: k, label: RETENTION[k].label, days: p.days[k], defaultDays: RETENTION[k].defaultDays, min: RETENTION[k].min, max: RETENTION[k].max,
    source: p.stored[k] === null ? "default" : "platform setting", rowsOutsidePeriod: await rowsOutside(k, p.days[k]),
  })));
  return {
    mfa: { requireForInstitutionAdmins: p.requireAdminMfa, activeInstitutionAdministrators: admins, activeInstitutions: inst, institutionsAlreadyRequiring: strictInst, platformAdministratorsAlwaysRequireMfa: true, updatedAt: p.updatedAt },
    retention: { items, note: "Operational records only: scheduled job history, monitoring events and AI usage statistics. Student and institution data is not covered and is never deleted by these settings. The allowed ranges are proposed engineering limits, not legal retention requirements; no legal retention requirement has been assessed." },
  };
}

export async function setMfaPolicy(admin: PlatformSession, required: boolean, req?: Request) {
  const r = await db.$transaction(async (tx) => {
    await lockPolicy(tx);
    const before = (await tx.platformPolicy.findUnique({ where: { id: "platform" } }))?.requireAdminMfa ?? false;
    if (before === required) return { requireForInstitutionAdmins: required, changed: false };
    await tx.platformPolicy.upsert({ where: { id: "platform" }, create: { id: "platform", requireAdminMfa: required, updatedBy: admin.adminId }, update: { requireAdminMfa: required, updatedBy: admin.adminId } });
    await log(tx, admin, "policy.mfa.update", { before: { requireAdminMfa: before }, after: { requireAdminMfa: required } }, req);
    return { requireForInstitutionAdmins: required, changed: true };
  });
  invalidatePolicy();
  return r;
}

export async function setRetention(admin: PlatformSession, input: z.infer<typeof RI>, req?: Request) {
  const r = await db.$transaction(async (tx) => {
    await lockPolicy(tx);
    const row = await tx.platformPolicy.findUnique({ where: { id: "platform" } });
    const cur: Record<RetentionKey, number | null> = { jobRun: row?.retentionJobRunDays ?? null, monitorEvent: row?.retentionMonitorEventDays ?? null, aiUsage: row?.retentionAiUsageDays ?? null };
    const inp: Record<RetentionKey, number | null | undefined> = { jobRun: input.jobRunDays, monitorEvent: input.monitorEventDays, aiUsage: input.aiUsageDays };
    const next = { ...cur }; for (const k of RETENTION_KEYS) if (inp[k] !== undefined) next[k] = inp[k]!;
    const eff = (v: Record<RetentionKey, number | null>) => Object.fromEntries(RETENTION_KEYS.map((k) => [k, v[k] ?? RETENTION[k].defaultDays])) as Record<RetentionKey, number>;
    const e0 = eff(cur), e1 = eff(next);
    const changedKeys = RETENTION_KEYS.filter((k) => e0[k] !== e1[k] || cur[k] !== next[k]);
    if (!changedKeys.length) return { changed: false, effective: e1 };
    const wouldDelete: Partial<Record<RetentionKey, number>> = {};
    for (const k of changedKeys) if (e1[k] < e0[k]) { const n = await rowsOutside(k, e1[k]); if (n > 0) wouldDelete[k] = n; }
    if (Object.keys(wouldDelete).length && !input.confirm)
      throw new ApiError(409, "CONFIRMATION_REQUIRED", "This shortens a retention period and the next cleanup will permanently delete the records listed. Send the same request with confirm: true to proceed.", { wouldDelete });
    const data = { retentionJobRunDays: next.jobRun, retentionMonitorEventDays: next.monitorEvent, retentionAiUsageDays: next.aiUsage, updatedBy: admin.adminId };
    await tx.platformPolicy.upsert({ where: { id: "platform" }, create: { id: "platform", ...data }, update: data });
    await log(tx, admin, "policy.retention.update", { before: e0, after: e1, confirmed: !!input.confirm, rowsAffectedAtNextCleanup: wouldDelete }, req);
    return { changed: true, effective: e1, rowsAffectedAtNextCleanup: wouldDelete };
  });
  invalidatePolicy();
  return r;
}

/** Runs the bounded cleanup now (the same code the hourly job runs). Returns what was removed; `capped` means more remains for the next run. Audited as the administrator who ran it. */
export async function runCleanup(admin: PlatformSession | null, req?: Request) {
  const p = await getPolicy(true);
  const mon = await pruneMonitoring({ days: { jobRun: p.days.jobRun, monitorEvent: p.days.monitorEvent } });
  const ai = await pruneAiUsage(new Date(), p.days.aiUsage).catch(() => null);
  const out = { jobRuns: mon.jobRuns, monitorEvents: mon.monitorEvents, aiUsageDays: ai?.usage ?? 0, capped: mon.capped || !!ai?.capped, error: mon.error ?? (ai ? null : "ai usage cleanup failed"), days: p.days };
  if (admin || out.jobRuns + out.monitorEvents + out.aiUsageDays > 0) {
    await db.$transaction((tx) => log(tx, admin ? { adminId: admin.adminId, email: admin.email } : { adminId: null, email: "system" }, "retention.cleanup", { ...out, trigger: admin ? "administrator" : "scheduled job" } as unknown as Prisma.InputJsonValue, req)).catch(() => undefined);
  }
  return out;
}

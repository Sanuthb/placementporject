import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Platform-wide policy (SA-TC-012, 067): a minimum two-step sign-in rule for institution administrators, and retention periods for the platform's own
 * operational records. Both are read with a short cache and fail SAFE: if the policy cannot be read, the last known value is used; with nothing known,
 * no platform minimum is assumed (the institution's own setting still applies) and the built-in retention defaults are used, so a database problem can neither lock
 * people out nor shorten retention.
 *
 * Retention bounds below are PROPOSED engineering limits, not legal requirements. Nothing here governs student or institution data.
 */
export const RETENTION = {
  jobRun: { key: "jobRun", label: "Scheduled job history", field: "retentionJobRunDays", defaultDays: 90, min: 30, max: 365 },
  monitorEvent: { key: "monitorEvent", label: "Monitoring events (durable error records)", field: "retentionMonitorEventDays", defaultDays: 14, min: 7, max: 90 },
  aiUsage: { key: "aiUsage", label: "AI usage statistics (daily counts)", field: "retentionAiUsageDays", defaultDays: 90, min: 30, max: 365 },
} as const;
export type RetentionKey = keyof typeof RETENTION;
export const RETENTION_KEYS = Object.keys(RETENTION) as RetentionKey[];

export type Policy = { requireAdminMfa: boolean; days: Record<RetentionKey, number>; stored: Record<RetentionKey, number | null>; updatedAt: Date | null };
const defaults = (): Policy => ({ requireAdminMfa: false, days: { jobRun: 90, monitorEvent: 14, aiUsage: 90 }, stored: { jobRun: null, monitorEvent: null, aiUsage: null }, updatedAt: null });

const TTL_MS = 30_000;
const g = globalThis as unknown as { __policy?: { at: number; v: Policy } };
export const invalidatePolicy = () => { delete g.__policy; };

export async function getPolicy(fresh = false): Promise<Policy> {
  const c = g.__policy;
  if (!fresh && c && Date.now() - c.at < TTL_MS) return c.v;
  try {
    const r = await db.platformPolicy.findUnique({ where: { id: "platform" } });
    const stored = { jobRun: r?.retentionJobRunDays ?? null, monitorEvent: r?.retentionMonitorEventDays ?? null, aiUsage: r?.retentionAiUsageDays ?? null };
    const v: Policy = { requireAdminMfa: r?.requireAdminMfa ?? false, stored, updatedAt: r?.updatedAt ?? null, days: { jobRun: stored.jobRun ?? RETENTION.jobRun.defaultDays, monitorEvent: stored.monitorEvent ?? RETENTION.monitorEvent.defaultDays, aiUsage: stored.aiUsage ?? RETENTION.aiUsage.defaultDays } };
    g.__policy = { at: Date.now(), v };
    return v;
  } catch {
    return g.__policy?.v ?? defaults(); // fail safe: last known, else no platform minimum and the built-in retention
  }
}

/** Whether the platform requires institution administrators to have two-step sign-in, regardless of the institution's own setting. */
export const platformRequiresAdminMfa = async () => (await getPolicy()).requireAdminMfa;

const days = (k: RetentionKey) => z.number().int().min(RETENTION[k].min, `At least ${RETENTION[k].min} days`).max(RETENTION[k].max, `At most ${RETENTION[k].max} days`).nullable().optional();
/** `null` resets a period to its built-in default; omitted leaves it alone. Unknown fields are refused. */
export const retentionInput = z.object({ jobRunDays: days("jobRun"), monitorEventDays: days("monitorEvent"), aiUsageDays: days("aiUsage"), confirm: z.boolean().optional() }).strict()
  .refine((v) => v.jobRunDays !== undefined || v.monitorEventDays !== undefined || v.aiUsageDays !== undefined, { message: "Nothing to change" });
export const mfaInput = z.object({ required: z.boolean() }).strict();

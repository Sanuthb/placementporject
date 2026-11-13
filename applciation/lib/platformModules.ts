import { z } from "zod";
import { ModuleKey } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { badRequest } from "@/lib/api/errors";
import { platformAudit } from "@/lib/platformAudit";
import { countIncluded, settingStatus } from "@/lib/moduleRollout";
import type { PlatformSession } from "@/lib/auth/platform";

/**
 * Module management (Control Centre, 4.4). Two separate things, kept apart on purpose:
 *  - ENTITLEMENT: an institution has a module switched on (CollegeModule). That is managed per institution and is unchanged.
 *  - EMERGENCY SWITCH: the platform switches one module off for EVERYONE (PlatformModuleSetting). It can only reduce access: switching it
 *    back on does not give any institution a module it had not switched on, and it never grants anyone a permission.
 * Also here: a scheduled launch time and a gradual rollout percentage (both only ever reduce who can use a module), and ADVISORY dependencies between modules.
 * Nothing in this file lets an institution use a module it has not switched on, and nothing grants a permission.
 */
export const MODULE_INFO: Record<ModuleKey, { label: string; description: string }> = {
  ONBOARDING: { label: "Student onboarding", description: "Invitations, profile completion and document verification." },
  PSYCHOMETRICS: { label: "Psychometric assessments", description: "Personality and aptitude instruments for students." },
  DRIVES: { label: "Placement drives", description: "Drives, rounds, applications and offers." },
  ATTENDANCE_BLOCKING: { label: "Attendance and blocking", description: "Drive attendance and rules that block students." },
  ANALYTICS: { label: "Analytics and reports", description: "Institution dashboards and reports." },
  ASSESSMENTS: { label: "Assessments", description: "Tests and assessment scheduling." },
  EMPLOYER_CRM: { label: "Employer relationships", description: "Prospects, follow-ups and company history." },
  STUDENT_PREP: { label: "Student preparation", description: "Campaigns, mock tests, mock interviews and practice." },
  INTERNSHIPS: { label: "Internships", description: "Internship records and mentor feedback." },
  EVENTS: { label: "Events", description: "Placement events and calendar." },
  LEARNING: { label: "Learning", description: "Courses and the resource library." },
  RECRUITER_PORTAL: { label: "Employer portal", description: "Employer sign-in to review candidates and give feedback." },
  TALENT_SHOWCASE: { label: "Talent showcase", description: "Student portfolios shown to employers." },
};
export const MODULE_KEYS = Object.values(ModuleKey) as ModuleKey[];
export const isModuleKey = (v: string): v is ModuleKey => (MODULE_KEYS as string[]).includes(v);
/**
 * Modules that normally work together. This is ADVICE shown to the administrator, not a rule the server enforces: nothing is blocked because of it.
 * It reflects how the modules are used together today and should be confirmed by the product owner.
 */
export const MODULE_DEPENDS_ON: Partial<Record<ModuleKey, ModuleKey[]>> = {
  RECRUITER_PORTAL: ["DRIVES"],
  ATTENDANCE_BLOCKING: ["DRIVES"],
};
export const dependentsOf = (m: ModuleKey) => MODULE_KEYS.filter((k) => MODULE_DEPENDS_ON[k]?.includes(m));

export const switchInput = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().max(300).optional(),
  /** Not available to anyone before this time. Empty means no schedule. */
  availableFrom: z.coerce.date().nullable().optional(),
  /** The share of institutions it is available to, 0 to 100. Empty means everyone. */
  rolloutPercent: z.number().int().min(0).max(100).optional(),
}).strict()
  .refine((v) => v.enabled || (v.reason?.length ?? 0) >= 3, { message: "Say why the module is being switched off", path: ["reason"] });

export async function listModuleSettings(now = new Date()) {
  const [rows, colleges] = await Promise.all([db.platformModuleSetting.findMany(), db.college.findMany({ where: { isActive: true }, select: { id: true }, take: 5000 })]);
  const by = new Map(rows.map((r) => [r.module, r]));
  const ids = colleges.map((c) => c.id);
  return MODULE_KEYS.map((m) => {
    const r = by.get(m);
    const s = r ? { globallyEnabled: r.globallyEnabled, availableFrom: r.availableFrom, rolloutPercent: r.rolloutPercent } : null;
    const status = settingStatus(s, now);
    return {
      module: m, ...MODULE_INFO[m], globallyEnabled: r?.globallyEnabled ?? true, reason: r?.reason ?? null, updatedAt: r?.updatedAt ?? null,
      availableFrom: r?.availableFrom ?? null, rolloutPercent: r?.rolloutPercent ?? 100, status,
      reachedInstitutions: status === "rollout" ? countIncluded(ids, m, r!.rolloutPercent) : null, activeInstitutions: ids.length,
      dependsOn: (MODULE_DEPENDS_ON[m] ?? []).map((d) => ({ module: d, label: MODULE_INFO[d].label })),
      dependents: dependentsOf(m).map((d) => ({ module: d, label: MODULE_INFO[d].label })),
    };
  });
}

export async function setGlobalSwitch(admin: PlatformSession, key: string, input: z.infer<typeof switchInput>) {
  if (!isModuleKey(key)) throw badRequest("Unknown module");
  const reason = input.enabled ? null : input.reason ?? null;
  const availableFrom = input.availableFrom ?? null;
  const rolloutPercent = input.rolloutPercent ?? 100;
  const data = { globallyEnabled: input.enabled, reason, availableFrom, rolloutPercent, updatedBy: admin.adminId };
  await db.platformModuleSetting.upsert({ where: { module: key }, update: data, create: { module: key, ...data } });
  await platformAudit({ adminId: admin.adminId, email: admin.email, action: "module.global_switch", detail: { module: key, enabled: input.enabled, reason, availableFrom: availableFrom ? availableFrom.toISOString() : null, rolloutPercent } });
  return { module: key, globallyEnabled: input.enabled, availableFrom, rolloutPercent };
}

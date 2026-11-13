/**
 * Platform-side availability of a module (pure: no database, no imports). It can only REDUCE access:
 *  - off: the platform switched the module off for everyone;
 *  - not_yet: a scheduled launch time has not arrived;
 *  - rollout: the module is being released gradually and this institution is not in the released share yet.
 * An institution still needs the module switched on for itself, and nothing here grants any permission.
 *
 * Which institutions are in a rollout is a stable function of the module and the institution id, so an institution never drops in and out between requests,
 * and raising the percentage only ever ADDS institutions: those already in stay in.
 */
export type PlatformSetting = { globallyEnabled: boolean; availableFrom: Date | null; rolloutPercent: number };
export type Availability = { available: true } | { available: false; reason: "off" | "not_yet" | "rollout" };

/** A number from 0 to 99, always the same for the same module and institution (32-bit FNV-1a). */
export function bucketOf(collegeId: string, module: string): number {
  let h = 0x811c9dc5;
  const s = `${module}:${collegeId}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0) % 100;
}
const clamp = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, Math.trunc(n))) : 100);

export function platformAvailability(s: PlatformSetting | null | undefined, collegeId: string, module: string, now: Date): Availability {
  if (!s) return { available: true };
  if (!s.globallyEnabled) return { available: false, reason: "off" };
  if (s.availableFrom && s.availableFrom.getTime() > now.getTime()) return { available: false, reason: "not_yet" };
  const pct = clamp(s.rolloutPercent);
  if (pct < 100 && bucketOf(collegeId, module) >= pct) return { available: false, reason: "rollout" };
  return { available: true };
}

/** How many of these institutions a rollout of this size reaches. */
export const countIncluded = (collegeIds: readonly string[], module: string, percent: number) => {
  const pct = clamp(percent);
  return pct >= 100 ? collegeIds.length : collegeIds.filter((id) => bucketOf(id, module) < pct).length;
};

/** What the administrator sees for one module. */
export type SettingStatus = "off" | "scheduled" | "rollout" | "on";
export function settingStatus(s: PlatformSetting | null | undefined, now: Date): SettingStatus {
  if (!s) return "on";
  if (!s.globallyEnabled) return "off";
  if (s.availableFrom && s.availableFrom.getTime() > now.getTime()) return "scheduled";
  return clamp(s.rolloutPercent) < 100 ? "rollout" : "on";
}

export const unavailableMessage = (module: string, reason: "off" | "not_yet" | "rollout") =>
  reason === "off" ? `The ${module} module is temporarily switched off by the platform`
    : reason === "not_yet" ? `The ${module} module is not available yet`
    : `The ${module} module is not yet available to this college`;

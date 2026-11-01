export const titleCase = (s: string) => s.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—")
export const fmtDateTime = (d?: string | Date | null) => (d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—")
export const fmtLpa = (n?: number | string | null) => (n === null || n === undefined ? "—" : `${Number(n)} LPA`)

type Variant = "default" | "secondary" | "outline" | "destructive"
/** One place that decides which badge style a status gets, so a status looks the same on every screen. */
export function statusVariant(status: string): Variant {
  switch (status) {
    case "VERIFIED": case "ONBOARDED": case "ACTIVATED": case "ACCEPTED": case "CLEARED": case "PLACED": case "APPROVED": case "REGISTERED": return "default"
    case "SUBMITTED": case "SENT": case "OFFERED": case "PENDING": case "PROFILE_PENDING": case "SHORTLISTED": return "secondary"
    case "CHANGES_REQUESTED": case "REJECTED": case "DECLINED": case "REVOKED": case "ABSENT": case "OPTED_OUT": case "NOT_ELIGIBLE": return "destructive"
    default: return "outline"
  }
}

/** "2 days left", "5 hours left", or "closed". */
export function countdown(deadline: string | Date, now: number) {
  const ms = new Date(deadline).getTime() - now
  if (ms <= 0) return "closed"
  const h = Math.floor(ms / 3_600_000)
  return h >= 48 ? `${Math.floor(h / 24)} days left` : h >= 1 ? `${h} hours left` : "closing within the hour"
}

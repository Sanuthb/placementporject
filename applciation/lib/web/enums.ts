import { titleCase } from "@/lib/web/format"

const opts = (xs: string[]) => xs.map((v) => ({ value: v, label: titleCase(v) }))
export const TIERS = opts(["DREAM", "SUPER_DREAM", "CORE", "REGULAR"])
export const RELATIONSHIP = opts(["ACTIVE", "DORMANT", "BLACKLISTED"])
export const JOB_TYPES = opts(["FULL_TIME", "INTERNSHIP", "INTERNSHIP_WITH_OFFER"])
export const ROUND_TYPES = opts(["APTITUDE", "CODING", "GROUP_DISCUSSION", "TECHNICAL", "HR", "OTHER"])
export const DRIVE_STATUS = opts(["DRAFT", "PUBLISHED", "CLOSED", "CANCELLED"])
export const OFFER_STATUS = opts(["OFFERED", "ACCEPTED", "DECLINED", "REVOKED"])
export const ROUND_RESULT = opts(["ATTENDED", "ABSENT", "CLEARED", "REJECTED"])

/** `datetime-local` input value (local time) to an ISO string the API accepts. */
export const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined)

/** Labels for the onboarding and invitation statuses, worded as the placement cell talks about them. */
export const ONBOARDING_LABEL: Record<string, string> = {
  INVITATION_PENDING: "Invitation Pending", INVITATION_SENT: "Invitation Sent", INVITATION_ACCEPTED: "Invitation Accepted", PROFILE_IN_PROGRESS: "Profile In Progress",
  SUBMITTED: "Submitted for Verification", VERIFICATION_IN_PROGRESS: "Verification in Progress", CHANGES_REQUESTED: "Changes Requested", VERIFIED: "Verified", REJECTED: "Rejected", INVITATION_EXPIRED: "Invitation Expired",
}
export const INVITATION_LABEL: Record<string, string> = { PENDING: "Pending", SENT: "Sent", ACCEPTED: "Accepted", EXPIRED: "Expired", REVOKED: "Revoked" }
export const VERIFICATION_LABEL: Record<string, string> = { NOT_SUBMITTED: "Not submitted", IN_REVIEW: "In review", CHANGES_REQUESTED: "Changes requested", VERIFIED: "Verified", REJECTED: "Rejected" }

/** The review state shown in the Verification column, derived from the onboarding status. */
export function verificationOf(status: string): keyof typeof VERIFICATION_LABEL {
  if (status === "VERIFIED") return "VERIFIED"
  if (status === "REJECTED") return "REJECTED"
  if (status === "CHANGES_REQUESTED") return "CHANGES_REQUESTED"
  if (status === "SUBMITTED" || status === "VERIFICATION_IN_PROGRESS") return "IN_REVIEW"
  return "NOT_SUBMITTED"
}
export const REVIEWABLE = ["SUBMITTED", "VERIFICATION_IN_PROGRESS"]
export const CAN_REQUEST_CHANGES = ["SUBMITTED", "VERIFICATION_IN_PROGRESS", "REJECTED"]

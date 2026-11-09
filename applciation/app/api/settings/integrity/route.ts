import { route } from "@/lib/api/handler";
import { findIntegrityViolations } from "@/lib/academicIntegrity";

/** Read-only report of academic-structure rows whose references disagree. Reports only; nothing is changed. */
export const GET = route({ roles: ["TPO_ADMIN"] }, async (_req, s) => {
  const violations = await findIntegrityViolations(s.collegeId);
  return { ok: violations.length === 0, violations };
});

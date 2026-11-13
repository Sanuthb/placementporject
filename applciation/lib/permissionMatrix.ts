import { z } from "zod";
import data from "@/lib/permissionMatrix.data.json";

/**
 * The read-only role and permission matrix. The data file is generated from the authorization rules written in the route files (scripts/gen-permissions.mjs, `npm run docs:permissions`);
 * tests/unit/permissions.test.mts fails if it no longer matches the code. Roles are fixed in code and cannot be edited anywhere.
 *
 * WHAT IT IS: the ROUTE-LEVEL rule, i.e. which staff roles the route wrapper lets through at all (the outer boundary). WHAT IT IS NOT: the full set of effective permissions. Many handlers narrow access further after that gate
 * (a department coordinator sees only their own department; a student sees only their own record; a second role check; ownership of a record). Those rules are written in handler or shared library code, not in a declarative rule, so they cannot be
 * listed exhaustively here. Each staff row carries `narrowing`: "handler" (the handler's own source contains such a check), "shared" (it imports a library module that contains such checks; it MAY narrow) or "none-detected"
 * (a source scan found none; this is a heuristic and is NOT proof that nothing narrows access). Student, recruiter, platform, public and scheduler routes carry no classification (their scoping depends on the caller's identity, not a staff role); the matrix makes no claim about it.
 */
type Row = { method: string; path: string; audience: "staff" | "student" | "recruiter" | "platform" | "public" | "scheduler"; roles: string[] | null; facultyOk: boolean; principalOk: boolean; module: string | null; mfaExempt: boolean; allowed: string[]; handlerChecks?: boolean; sharedChecks?: boolean };
export type Narrowing = "handler" | "shared" | "none-detected";
const narrowingOf = (r: Row): Narrowing | null => (r.audience !== "staff" ? null : r.handlerChecks ? "handler" : r.sharedChecks ? "shared" : "none-detected");
const M = data as { roles: string[]; count: number; routes: Row[] };

export const matrixQuery = z.object({
  role: z.enum(["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY", "PRINCIPAL"]).optional(),
  audience: z.enum(["staff", "student", "recruiter", "platform", "public", "scheduler"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

export function permissionMatrix(q: z.infer<typeof matrixQuery>) {
  const staff = M.routes.filter((r) => r.audience === "staff");
  const perRole = Object.fromEntries(M.roles.map((r) => [r, { allowed: staff.filter((x) => x.allowed.includes(r)).length, refused: staff.filter((x) => !x.allowed.includes(r)).length }]));
  const needle = q.q?.toLowerCase();
  let rows = M.routes.filter((r) => (!q.audience || r.audience === q.audience) && (!q.role || (r.audience === "staff" && r.allowed.includes(q.role))) && (!needle || r.path.toLowerCase().includes(needle)));
  const total = rows.length;
  rows = rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  return {
    readOnly: true, roles: M.roles, endpointCount: M.count,
    audiences: Object.fromEntries(["staff", "student", "recruiter", "platform", "public", "scheduler"].map((a) => [a, M.routes.filter((r) => r.audience === a).length])),
    perRole,
    scope: {
      kind: "route-level",
      statement: "This matrix shows the route-level rule: which staff roles a route lets through. It is NOT the complete set of effective permissions. Handlers and shared code narrow access further (for example a department coordinator sees only their own department, a student only their own record), and those rules are not listed here.",
      staffRoutes: staff.length,
      narrowing: { handler: staff.filter((r) => narrowingOf(r) === "handler").length, shared: staff.filter((r) => narrowingOf(r) === "shared").length, noneDetected: staff.filter((r) => narrowingOf(r) === "none-detected").length },
      narrowingNote: "handler = the handler's own source contains a department-scope, ownership or second role check. shared = it uses a library module that contains such checks (it may narrow). none-detected = a source scan found none; this is a heuristic and does not prove that nothing narrows access.",
    },
    note: "Generated from the route authorization rules in the code. Roles are fixed; permissions cannot be edited. Route-level rules only: handlers narrow access further (department scope, own records), so this is the outer boundary, not every effective permission.",
    items: rows.map((r) => ({ method: r.method, path: r.path, audience: r.audience, allowedRoles: r.audience === "staff" ? r.allowed : null, anyStaffRole: r.audience === "staff" && !r.roles, narrowing: narrowingOf(r), module: r.module, mfaExempt: r.mfaExempt })),
    page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

// Unit tests: the read-only role and permission matrix is generated from the route files and cannot drift from them. No network, no database.
import { readFileSync } from "node:fs";
import { buildMatrix, scanRoutes, staffAllowed, STAFF_ROLES } from "../../scripts/lib/routeScan.mjs";
import { permissionMatrix, matrixQuery } from "../../lib/permissionMatrix";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };

const fresh = buildMatrix();
const committed = JSON.parse(readFileSync("lib/permissionMatrix.data.json", "utf8"));
t("the committed matrix equals one freshly generated from the route files (run `npm run docs:permissions` if this fails)", JSON.stringify(fresh) === JSON.stringify(committed), `committed ${committed.count} endpoints vs code ${fresh.count}`);
t("every route file endpoint is covered (more than 700 endpoints found)", fresh.count > 700, String(fresh.count));
const find = (m: string, p: string) => fresh.routes.find((r: { method: string; path: string }) => r.method === m && r.path === p);

const inv = find("POST", "/api/settings/staff")!;
t("staff invitation is listed as Head TPO only", JSON.stringify(inv.allowed) === JSON.stringify(["TPO_ADMIN"]), JSON.stringify(inv));
const open = fresh.routes.find((r: { audience: string; roles: unknown; facultyOk: boolean; principalOk: boolean }) => r.audience === "staff" && !r.roles && !r.facultyOk && !r.principalOk)!;
t("a staff route with no role list allows the three placement roles but refuses faculty-only and principal-only sessions (handler default)", JSON.stringify(open.allowed) === JSON.stringify(["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR"]), JSON.stringify(open));
const prin = fresh.routes.find((r: { audience: string; principalOk: boolean; roles: unknown }) => r.audience === "staff" && r.principalOk && !r.roles)!;
t("a route that sets principalOk includes the principal role", prin.allowed.includes("PRINCIPAL"));
const fac = fresh.routes.find((r: { audience: string; facultyOk: boolean; roles: unknown }) => r.audience === "staff" && r.facultyOk && !r.roles)!;
t("a route that sets facultyOk includes the faculty role", fac.allowed.includes("FACULTY"));
t("a route that names FACULTY in its roles allows faculty", fresh.routes.some((r: { roles: string[] | null; allowed: string[] }) => r.roles?.includes("FACULTY") && r.allowed.includes("FACULTY")));
t("only the five fixed roles ever appear", fresh.routes.every((r: { allowed: string[] }) => r.allowed.every((x) => STAFF_ROLES.includes(x))));
t("student, recruiter and platform routes carry no staff roles", fresh.routes.filter((r: { audience: string }) => r.audience !== "staff").every((r: { allowed: string[] }) => r.allowed.length === 0));
t("the new platform routes are classified as platform-administrator routes", ["/api/platform/roles", "/api/platform/admins", "/api/platform/system", "/api/platform/integrations", "/api/platform/policy"].every((p) => scanRoutes().some((r: { path: string; audience: string }) => r.path === p && r.audience === "platform")));
t("staffAllowed: an explicit role list wins over the faculty / principal defaults", JSON.stringify(staffAllowed({ audience: "staff", roles: ["PRINCIPAL", "TPO_ADMIN"], facultyOk: false, principalOk: false })) === JSON.stringify(["TPO_ADMIN", "PRINCIPAL"]));

const m = permissionMatrix(matrixQuery.parse({}));
t("the view is read-only and reports the five roles with allowed and refused counts that add up to the staff endpoints", m.readOnly === true && m.roles.length === 5 && Object.values(m.perRole).every((x) => x.allowed + x.refused === m.audiences.staff));
const onlyOfficer = permissionMatrix(matrixQuery.parse({ role: "PLACEMENT_OFFICER", pageSize: "200" }));
t("filtering by role lists only routes that role may call", onlyOfficer.items.length > 0 && onlyOfficer.items.every((x) => x.allowedRoles?.includes("PLACEMENT_OFFICER")));
t("filtering by path text works and paging is bounded", permissionMatrix(matrixQuery.parse({ q: "settings/staff" })).items.every((x) => x.path.includes("settings/staff")) && matrixQuery.safeParse({ pageSize: 201 }).success === false);
t("unknown query fields are refused", matrixQuery.safeParse({ role: "SUPERUSER" }).success === false && matrixQuery.safeParse({ editable: "true" }).success === false);
t("the matrix exposes no secrets or personal data: only methods, paths, roles and modules", !/secret|password|token|email|key/i.test(JSON.stringify(m.items.map((x) => ({ ...x, path: "" })))));

// ---- scope: route-level rule versus rules enforced inside handlers (Gate 4 review) ----
t("the response states plainly that it is the route-level rule and NOT every effective permission", m.scope.kind === "route-level" && /route-level/i.test(m.scope.statement) && /NOT the complete set of effective permissions/.test(m.scope.statement) && /not every effective permission/i.test(m.note));
t("every staff row carries a narrowing classification and the three counts add up to the staff endpoints", m.scope.narrowing.handler + m.scope.narrowing.shared + m.scope.narrowing.noneDetected === m.scope.staffRoutes && permissionMatrix(matrixQuery.parse({ audience: "staff", pageSize: "200" })).items.every((x) => ["handler", "shared", "none-detected"].includes(x.narrowing as string)));
t("non-staff rows carry no narrowing classification", permissionMatrix(matrixQuery.parse({ audience: "student", pageSize: "200" })).items.every((x) => x.narrowing === null));
const approvals = find("GET", "/api/approvals")!;
t("a handler that re-checks the role in its own code (GET /api/approvals uses hasRole) is classified 'handler', and the route-level list alone would not show that", approvals.handlerChecks === true && permissionMatrix(matrixQuery.parse({ q: "/api/approvals", pageSize: "200" })).items.find((x) => x.method === "GET" && x.path === "/api/approvals")?.narrowing === "handler");
t("the scan is a heuristic and says so: 'none-detected' is never described as 'no restriction'", /heuristic/i.test(m.scope.narrowingNote) && /does not prove/i.test(m.scope.narrowingNote) && !/no restriction|unrestricted/i.test(JSON.stringify(m.scope)));
t("some routes ARE narrowed beyond their route-level list (the matrix therefore cannot be the effective permission set)", m.scope.narrowing.handler > 0 && m.scope.narrowing.shared > 0);
t("DEC-01: the platform has no route that creates, invites or re-enables a platform administrator (only list and deactivate)", !fresh.routes.some((r: { method: string; path: string }) => r.path.startsWith("/api/platform/admins") && ["POST", "PUT", "PATCH"].includes(r.method)) && fresh.routes.some((r: { method: string; path: string }) => r.method === "DELETE" && r.path === "/api/platform/admins/:id"));
// ---- Gate 4 WP-02: option constants imported from service files are resolved (a live check found the matrix wrong for them)
t("every route's options were resolved (none silently defaulted to 'any staff role')", fresh.routes.every((r: { optionsResolved?: boolean }) => r.optionsResolved === true), JSON.stringify(fresh.routes.filter((r: { optionsResolved?: boolean }) => r.optionsResolved !== true).map((r: { method: string; path: string }) => r.method + " " + r.path).slice(0, 5)));
const camp = find("POST", "/api/campaigns")!;
t("campaign administration (options imported as CAMP_ADMIN) is Head TPO and Placement Officer only: a department coordinator is NOT allowed", JSON.stringify(camp.allowed) === JSON.stringify(["TPO_ADMIN", "PLACEMENT_OFFICER"]), JSON.stringify(camp.allowed));
const campGet = find("GET", "/api/campaigns")!;
t("the campaign list (options imported as CAMP_TRAINER, facultyOk) is open to a faculty session", campGet.allowed.includes("FACULTY"), JSON.stringify(campGet.allowed));
const match = find("GET", "/api/jds/:id/matches")!;
t("candidate matching (options spread from MATCH_ADMIN) is Head TPO and Placement Officer only", JSON.stringify(match.allowed) === JSON.stringify(["TPO_ADMIN", "PLACEMENT_OFFICER"]), JSON.stringify(match.allowed));
process.exit(fails ? 1 : 0);

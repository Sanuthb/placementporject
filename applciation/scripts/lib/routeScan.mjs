// Reads app/api/**/route.ts and extracts each endpoint's authorization rule from the code itself (the options passed to route / studentRoute / recruiterRoute / platformRoute).
// Used by scripts/gen-permissions.mjs (writes lib/permissionMatrix.data.json) and by tests/unit/permissions.test.mts (proves the file matches the code).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const STAFF_ROLES = ["TPO_ADMIN", "PLACEMENT_OFFICER", "DEPARTMENT_COORDINATOR", "FACULTY", "PRINCIPAL"];

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (n === "route.ts") out.push(p); }
  return out;
}

/**
 * HEURISTIC, not a proof. A staff handler that, in its own source, narrows access beyond the route-level role list: department scope (departmentScope / isCoordinatorOnly / assertDepartment / the session's departmentId)
 * or a second role check (hasRole / requireRole / the session's role or roles). Checks that live in shared library code called by the handler are NOT detected, so "false" does not mean "no further restriction".
 */
export const HANDLER_TERMS = ["departmentScope", "isCoordinatorOnly", "assertDepartment", "hasRole(", "requireRole(", "s.roles", "s.role ", "s.role)", "s.role,", "s.departmentId"];
export const HANDLER_CHECKS = { test: (text) => HANDLER_TERMS.some((t) => text.includes(t)) };

const libCache = new Map();
/** Does the library module "@/lib/<name>" contain the same kinds of check? (one level only; a module may hold many functions, so this means "may narrow", not "does narrow".) */
function libHasChecks(name) {
  if (name.startsWith("auth/") || name.startsWith("api/") || name === "db" || name === "audit") return false;
  if (!libCache.has(name)) {
    let hit = false;
    for (const ext of [".ts", "/index.ts"]) { try { hit = HANDLER_CHECKS.test(readFileSync(join("lib", name + ext), "utf8")); break; } catch { /* not this one */ } }
    libCache.set(name, hit);
  }
  return libCache.get(name);
}
function importsCheckingLib(src) {
  const marker = 'from "@/lib/';
  let i = src.indexOf(marker);
  while (i >= 0) { const end = src.indexOf('"', i + marker.length); const name = src.slice(i + marker.length, end); if (libHasChecks(name)) return true; i = src.indexOf(marker, end); }
  return false;
}

// ---- option resolution -------------------------------------------------------------------------------------------------------------------------------------------
// A route's options are an object literal, a constant in the same file, or a constant IMPORTED from a service file (for example CAMP_ADMIN, MATCH_ADMIN), possibly with spreads
// ({ ...MATCH_ADMIN, limit: {...} }). Gate 4 WP-02 found that treating an imported constant as "no options" made the matrix claim "any staff role" for those routes, so they are resolved here and
// a route whose options cannot be resolved is flagged (optionsResolved: false) and fails the unit test instead of silently defaulting.
const srcCache = new Map(), constCache = new Map();
const readSrc = (f) => { if (!srcCache.has(f)) srcCache.set(f, readFileSync(f, "utf8")); return srcCache.get(f); };
/** Object literals bound to a name: `const NAME = {...}` and `const NAME: Type = {...}` (balanced braces; the type annotation may itself contain braces). */
function constsIn(file) {
  if (constCache.has(file)) return constCache.get(file);
  const src = readSrc(file), out = new Map();
  for (const m of src.matchAll(/(?:export )?const (\w+)\b/g)) {
    const from = m.index + m[0].length; let depth = 0, eq = -1;
    for (let j = from; j < src.length && j < from + 400; j++) {
      const c = src[j];
      if (c === "{" || c === "(" || c === "[" || c === "<") depth++;
      else if (c === "}" || c === ")" || c === "]" || (c === ">" && src[j - 1] !== "=")) depth--;
      else if (c === "=" && depth <= 0 && src[j + 1] !== ">" && src[j + 1] !== "=") { eq = j; break; }
      else if (c === ";" && depth <= 0) break;
    }
    if (eq < 0) continue;
    let k = eq + 1; while (/\s/.test(src[k] ?? "x")) k++;
    if (src[k] !== "{") continue;
    let d = 0, e = k; do { if (src[e] === "{") d++; else if (src[e] === "}") d--; e++; } while (d > 0 && e < src.length);
    out.set(m[1], src.slice(k, e));
  }
  constCache.set(file, out); return out;
}
function importFile(file, id) {
  const src = readSrc(file);
  for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const names = m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).at(-1));
    if (!names.includes(id)) continue;
    const base = m[2].startsWith("@/") ? resolve(m[2].slice(2)) : m[2].startsWith(".") ? resolve(dirname(file), m[2]) : null;
    if (!base) return null;
    for (const cand of [base + ".ts", base + ".tsx", join(base, "index.ts")]) if (existsSync(cand)) return cand;
  }
  return null;
}
function optionText(file, expr, depth = 0) {
  if (depth > 6) return { text: "", ok: false };
  const body = expr.trim();
  if (body.startsWith("{")) {
    const parts = []; let ok = true;
    for (const sp of body.matchAll(/\.\.\.(\w+)/g)) { const r = identText(file, sp[1], depth + 1); parts.push(r.text); ok = ok && r.ok; }
    return { text: parts.join("\n") + "\n" + body, ok }; // the literal's own keys come last, so they win over a spread
  }
  if (/^\w+$/.test(body)) return identText(file, body, depth + 1);
  return { text: "", ok: false };
}
function identText(file, id, depth) {
  const local = constsIn(file).get(id);
  if (local) return optionText(file, local, depth);
  const target = importFile(file, id); if (!target) return { text: "", ok: false };
  const obj = constsIn(target).get(id);
  return obj ? optionText(target, obj, depth) : { text: "", ok: false };
}
const lastRoles = (text) => { const m = [...text.matchAll(/roles:\s*\[([^\]]*)\]/g)].at(-1); return m ? m[1].replace(/["\s]/g, "").split(",").filter(Boolean) : null; };

export function scanRoutes(root = "app/api") {
  const rows = [];
  for (const f of walk(root).sort()) {
    const src = readFileSync(f, "utf8");
    const path = "/" + relative("app", f).split(sep).slice(0, -1).join("/").replace(/\[(\w+)\]/g, ":$1");
    const seen = new Set();
    const fileImportsChecks = importsCheckingLib(src);
    const starts = [...src.matchAll(/(?:export )?const (?:GET|POST|PUT|PATCH|DELETE|adminRun) = (?:route|studentRoute|recruiterRoute|platformRoute)(?:<[^>]*>)?\(/g)].map((x) => x.index);
    for (const m of src.matchAll(/(?:export )?const (GET|POST|PUT|PATCH|DELETE|adminRun) = (route|studentRoute|recruiterRoute|platformRoute)(?:<[^>]*>)?\(\s*/g)) {
      const [, name, wrapper] = m;
      const at = m.index + m[0].length;
      let raw = "";
      if (src[at] === "{") { let depth = 0, i = at; do { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; } while (depth > 0 && i < src.length); raw = src.slice(at, i); }
      else raw = /^\w+/.exec(src.slice(at))?.[0] ?? "";
      const { text: opts, ok: optionsResolved } = raw && raw !== "async" ? optionText(f, raw) : { text: "", ok: wrapper !== "route" }; // no options object is normal for student, recruiter and platform handlers, never for a staff route
      const end = starts.find((x) => x > m.index) ?? src.length;
      const handlerChecks = wrapper === "route" && HANDLER_CHECKS.test(src.slice(m.index, end));
      const sharedChecks = wrapper === "route" && !handlerChecks && fileImportsChecks;
      const roles = lastRoles(opts);
      const method = name === "adminRun" ? "POST" : name;
      seen.add(method);
      const audience = wrapper === "studentRoute" ? "student" : wrapper === "recruiterRoute" ? "recruiter" : wrapper === "platformRoute" ? "platform" : "staff";
      rows.push({ optionsResolved, handlerChecks, sharedChecks, method, path, audience, roles: audience === "staff" ? roles : null, facultyOk: /facultyOk:\s*true/.test(opts), principalOk: /principalOk:\s*true/.test(opts), module: /module:\s*"(\w+)"/.exec(opts)?.[1] ?? null, mfaExempt: /skipMfa:\s*true|allowUnverified:\s*true/.test(opts) });
    }
    for (const m of src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)) {
      const method = m[1]; const cron = /isCronRequest/.test(src);
      if (seen.has(method) && !cron) continue;
      rows.push({ optionsResolved: true, handlerChecks: false, sharedChecks: false, method, path, audience: cron ? "scheduler" : "public", roles: null, facultyOk: false, principalOk: false, module: null, mfaExempt: false });
    }
  }
  rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return rows;
}

/** Which staff roles may call a staff endpoint, applying the handler's rules (lib/api/handler.ts): a listed `roles` array decides; with no list any staff role may, except a faculty-only or principal-only session is refused unless the route opts in. */
export function staffAllowed(r) {
  if (r.audience !== "staff") return [];
  if (r.roles?.length) return STAFF_ROLES.filter((x) => r.roles.includes(x));
  return STAFF_ROLES.filter((x) => (x !== "FACULTY" || r.facultyOk) && (x !== "PRINCIPAL" || r.principalOk));
}

export function buildMatrix(root = "app/api") {
  const routes = scanRoutes(root).map((r) => ({ ...r, allowed: staffAllowed(r) }));
  return { roles: STAFF_ROLES, count: routes.length, routes };
}

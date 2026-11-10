import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { notFound } from "@/lib/api/errors";
import { escapeLike } from "@/lib/platformList";

/**
 * Read-only view over the two existing trails, shown as one timeline for platform administrators:
 *  - PLATFORM: PlatformAuditLog, the administrators' own security events (sign-in protection, MFA, account creation).
 *  - INSTITUTION: AuditLog rows written with platformActorId, i.e. what a platform administrator did to an institution
 *    (register, activate, suspend). Institution staff's own actions are NOT included and stay in each college's log.
 * Nothing here writes. No new audit system: both tables are the ones the app already writes to.
 */
export const SORTS = ["createdAt", "action", "actor", "institution", "source"] as const;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const day = (end: boolean) => (v: unknown) => (typeof v === "string" && dateOnly.test(v) ? new Date(v + (end ? "T23:59:59.999Z" : "T00:00:00.000Z")) : v);
export const auditQuery = z.object({
  q: z.string().trim().max(100).optional(),
  action: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9_.:-]+$/, "Use the event type as listed").optional(),
  admin: z.uuid().optional(),
  institution: z.uuid().optional(),
  source: z.enum(["PLATFORM", "INSTITUTION"]).optional(),
  outcome: z.enum(["success", "failure"]).optional(),
  from: z.preprocess(day(false), z.coerce.date()).optional(),
  to: z.preprocess(day(true), z.coerce.date()).optional(),
  sort: z.enum(SORTS).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must not be after the end date", path: ["from"] });
export type AuditQuery = z.infer<typeof auditQuery>;

/** Failure is recorded in the action name ("..._failed"). Everything else that was written was a completed action. */
export const outcomeOf = (action: string): "success" | "failure" => (/_failed$/.test(action) ? "failure" : "success");

const SENSITIVE_KEY = /pass(word|wd)?|secret|token|api[-_]?key|apikey|authorization|cookie|session|otp|totp|mfa[-_]?code|^code$|hash|private|credential|bearer|signature/i;
const SECRET_VALUE = /^(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*|(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}|Bearer\s+\S+|[A-Za-z0-9+/_-]{40,}={0,2})$/;
/** Hides anything that looks like a credential, by key name or by value shape, however deep it sits. Returns a copy. */
export function redact(v: unknown, depth = 0): unknown {
  if (depth > 8) return "[too deep]";
  if (Array.isArray(v)) return v.slice(0, 100).map((x) => redact(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 100).map(([k, x]) => [k, SENSITIVE_KEY.test(k) ? "[hidden]" : redact(x, depth + 1)]));
  if (typeof v === "string") return SECRET_VALUE.test(v.trim()) ? "[hidden]" : v.length > 500 ? v.slice(0, 500) + "…" : v;
  return v;
}

type Row = { id: string; source: "PLATFORM" | "INSTITUTION"; at: Date; action: string; actorId: string | null; actorEmail: string | null; actorName: string | null; collegeId: string | null; institutionName: string | null; entity: string | null; entityId: string | null; ip: string | null; total: number };
const EVENTS = Prisma.sql`
  select p.id, 'PLATFORM'::text as source, p."createdAt" as at, p.action, p."adminId" as "actorId", p.email as "actorEmail", pa.name as "actorName",
         null::uuid as "collegeId", null::text as entity, null::text as "entityId", p.ip
  from "PlatformAuditLog" p left join "PlatformAdmin" pa on pa.id = p."adminId"
  union all
  select a.id, 'INSTITUTION'::text, a."createdAt", a.action, a."platformActorId", pa.email, pa.name, a."collegeId", a.entity, a."entityId", null::text
  from "AuditLog" a left join "PlatformAdmin" pa on pa.id = a."platformActorId" where a."platformActorId" is not null`;
/** Fixed sort fragments; no client text reaches the SQL. */
const ORDER: Record<(typeof SORTS)[number], string> = { createdAt: `ev.at`, action: `ev.action`, actor: `ev."actorEmail"`, institution: `c.name`, source: `ev.source` };

const shape = (r: Row) => ({
  id: r.id, source: r.source, at: r.at, action: r.action, outcome: outcomeOf(r.action),
  actor: r.actorId || r.actorEmail ? { id: r.actorId, email: r.actorEmail, name: r.actorName } : null,
  institution: r.collegeId ? { id: r.collegeId, name: r.institutionName } : null,
  target: r.entity ? { entity: r.entity, id: r.entityId } : null, ip: r.ip,
});

export async function listAudit(q: AuditQuery) {
  const w: Prisma.Sql[] = [];
  if (q.q) { const like = `%${escapeLike(q.q)}%`; w.push(Prisma.sql`(ev.action ilike ${like} escape '\\' or ev."actorEmail" ilike ${like} escape '\\' or c.name ilike ${like} escape '\\' or ev."entityId" ilike ${like} escape '\\' or ev.id::text ilike ${like} escape '\\')`); }
  if (q.action) w.push(Prisma.sql`ev.action = ${q.action}`);
  if (q.admin) w.push(Prisma.sql`ev."actorId" = ${q.admin}::uuid`);
  if (q.institution) w.push(Prisma.sql`ev."collegeId" = ${q.institution}::uuid`);
  if (q.source) w.push(Prisma.sql`ev.source = ${q.source}`);
  if (q.outcome) w.push(q.outcome === "failure" ? Prisma.sql`ev.action like '%\\_failed' escape '\\'` : Prisma.sql`ev.action not like '%\\_failed' escape '\\'`);
  if (q.from) w.push(Prisma.sql`ev.at >= ${q.from}`);
  if (q.to) w.push(Prisma.sql`ev.at <= ${q.to}`);
  const where = w.length ? Prisma.sql`where ${Prisma.join(w, " and ")}` : Prisma.empty;
  const dir = q.order === "asc" ? "asc" : "desc";
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    with ev as (${EVENTS})
    select ev.*, c.name as "institutionName", (count(*) over())::int as total
    from ev left join "College" c on c.id = ev."collegeId"
    ${where}
    order by ${Prisma.raw(ORDER[q.sort])} ${Prisma.raw(dir)} nulls last, ev.at desc, ev.id asc
    limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`);
  // An empty page past the end still needs an accurate total.
  let total = rows[0]?.total ?? 0;
  if (!rows.length && q.page > 1) total = (await db.$queryRaw<{ n: number }[]>(Prisma.sql`with ev as (${EVENTS}) select count(*)::int as n from ev left join "College" c on c.id = ev."collegeId" ${where}`))[0]?.n ?? 0;
  return { items: rows.map(shape), page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), sort: q.sort, order: q.order };
}

/** One event in full, with credentials hidden. The id is looked up in both trails. */
export async function auditDetail(id: string) {
  const p = await db.platformAuditLog.findUnique({ where: { id } });
  if (p) {
    const admin = p.adminId ? await db.platformAdmin.findUnique({ where: { id: p.adminId }, select: { name: true } }) : null;
    return { id: p.id, source: "PLATFORM" as const, at: p.createdAt, action: p.action, outcome: outcomeOf(p.action), actor: p.adminId || p.email ? { id: p.adminId, email: p.email, name: admin?.name ?? null } : null, institution: null, target: null, ip: p.ip, detail: redact(p.detail ?? null), before: null, after: null, reason: null };
  }
  const a = await db.auditLog.findFirst({ where: { id, platformActorId: { not: null } }, include: { college: { select: { id: true, name: true } } } });
  if (!a) throw notFound("Event not found");
  const admin = await db.platformAdmin.findUnique({ where: { id: a.platformActorId! }, select: { email: true, name: true } });
  return { id: a.id, source: "INSTITUTION" as const, at: a.createdAt, action: a.action, outcome: outcomeOf(a.action), actor: { id: a.platformActorId, email: admin?.email ?? null, name: admin?.name ?? null }, institution: a.college, target: { entity: a.entity, id: a.entityId }, ip: null, detail: null, before: redact(a.before ?? null), after: redact(a.after ?? null), reason: a.reason ?? null };
}

/** Choices for the filter drop-downs: event types and administrators that actually appear in the trails. */
export async function auditFacets() {
  const [a, b, admins] = await Promise.all([
    db.platformAuditLog.findMany({ distinct: ["action"], select: { action: true } }),
    db.auditLog.findMany({ where: { platformActorId: { not: null } }, distinct: ["action"], select: { action: true } }),
    db.platformAdmin.findMany({ select: { id: true, email: true, name: true }, orderBy: { email: "asc" } }),
  ]);
  return { actions: [...new Set([...a, ...b].map((x) => x.action))].sort(), admins };
}

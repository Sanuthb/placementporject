import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { escapeLike } from "@/lib/platformList";
import { listAudit } from "@/lib/platformAuditView";

/**
 * Platform-wide analytics. Every number is an aggregate computed by the database from the tables that already hold the data;
 * nothing is stored or duplicated, and no student, staff or recruiter record leaves (counts only). See docs/PLATFORM_ANALYTICS.md for the
 * definition of each metric.
 *
 * Two kinds of figure, kept apart on purpose:
 *  - SNAPSHOTS (institutions, students, staff, recruiters, administrators) describe the platform as it is now. A date range does not change them.
 *  - FLOWS (registrations, drives, applications, offers, placements, sign-ins) happen at a time, so they follow the date range.
 * All dates are UTC days. A date-only "to" includes the whole day. Filters: date range, one institution, institution status.
 */
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const day = (end: boolean) => (v: unknown) => (typeof v === "string" && dateOnly.test(v) ? new Date(v + (end ? "T23:59:59.999Z" : "T00:00:00.000Z")) : v);
const filters = z.object({
  from: z.preprocess(day(false), z.coerce.date()).optional(),
  to: z.preprocess(day(true), z.coerce.date()).optional(),
  institution: z.uuid().optional(),
  status: z.enum(["all", "active", "suspended"]).default("all"),
});
export const analyticsQuery = filters.refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must not be after the end date", path: ["from"] });
export const TABLE_SORTS = ["name", "status", "createdAt", "students", "staff", "recruiters", "placed", "rate", "drives", "applications", "offers"] as const;
export const institutionTableQuery = filters.extend({
  q: z.string().trim().max(100).optional(),
  sort: z.enum(TABLE_SORTS).default("students"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
}).refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must not be after the end date", path: ["from"] });
export type AnalyticsFilters = z.infer<typeof analyticsQuery>;
export type TableQuery = z.infer<typeof institutionTableQuery>;

/** The percentage with one decimal, or null when there is nobody to divide by (never 0% for an empty population). */
export const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
/** "day" buckets for ranges up to 92 days, otherwise "month". */
export const bucketFor = (from?: Date, to?: Date) => (from && to && to.getTime() - from.getTime() <= 92 * 86_400_000 ? "day" : "month");
/** Every bucket label from `from` to `to` (UTC), so a quiet period shows as 0 instead of a gap. */
export function bucketKeys(from: Date, to: Date, unit: "day" | "month") {
  const out: string[] = []; const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), unit === "day" ? from.getUTCDate() : 1));
  while (d <= to && out.length < 400) { out.push(unit === "day" ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7)); if (unit === "day") d.setUTCDate(d.getUTCDate() + 1); else d.setUTCMonth(d.getUTCMonth() + 1); }
  return out;
}

const fcWhere = (f: Pick<AnalyticsFilters, "institution" | "status">, q?: string) => {
  const w: Prisma.Sql[] = [];
  if (f.institution) w.push(Prisma.sql`c.id = ${f.institution}::uuid`);
  if (f.status !== "all") w.push(f.status === "active" ? Prisma.sql`c."isActive"` : Prisma.sql`not c."isActive"`);
  if (q) { const like = `%${escapeLike(q)}%`; w.push(Prisma.sql`(c.name ilike ${like} escape '\\' or c.slug ilike ${like} escape '\\')`); }
  return w.length ? Prisma.sql`where ${Prisma.join(w, " and ")}` : Prisma.empty;
};
const FC = (f: Pick<AnalyticsFilters, "institution" | "status">, q?: string) => Prisma.sql`fc as (select c.id, c.name, c.slug, c."isActive", c."createdAt" from "College" c ${fcWhere(f, q)})`;
const rangeOf = (col: Prisma.Sql, f: { from?: Date; to?: Date }) => Prisma.sql`${f.from ? Prisma.sql`and ${col} >= ${f.from}` : Prisma.empty} ${f.to ? Prisma.sql`and ${col} <= ${f.to}` : Prisma.empty}`;
const ST_REG = Prisma.sql`s."isActive" and not s."isArchived" and s."participationStatus" = 'REGISTERED'`;
const hasRange = (f: { from?: Date; to?: Date }) => !!(f.from || f.to);
/** Placed students. No date range: students flagged placed (kept up to date from accepted offers). With a range: distinct registered students whose offer was accepted in it. */
const placedSql = (f: { from?: Date; to?: Date }) => hasRange(f)
  ? Prisma.sql`select o."collegeId" as id, count(distinct o."studentId") as n from "Offer" o join "Student" s on s.id = o."studentId" where o."collegeId" in (select id from fc) and o.status = 'ACCEPTED' and ${ST_REG} ${rangeOf(Prisma.sql`coalesce(o."respondedAt", o."offeredAt")`, f)} group by 1`
  : Prisma.sql`select s."collegeId" as id, count(*) as n from "Student" s where s."collegeId" in (select id from fc) and ${ST_REG} and s."isPlaced" group by 1`;

export async function platformSummary(f: AnalyticsFilters, now = new Date()) {
  const col = Prisma.sql`(select id from fc)`;
  const [r] = await db.$queryRaw<Record<string, number>[]>(Prisma.sql`
    with ${FC(f)}, pl as (${placedSql(f)})
    select
      (select count(*) from fc)::int as "inst_total",
      (select count(*) from fc where "isActive")::int as "inst_active",
      (select count(*) from fc where not "isActive")::int as "inst_suspended",
      (select count(*) from fc where "createdAt" > ${new Date(now.getTime() - 30 * 86_400_000)})::int as "inst_last30",
      (select count(*) from fc where true ${rangeOf(Prisma.sql`"createdAt"`, f)})::int as "inst_in_range",
      (select count(*) from "Student" where "collegeId" in ${col})::int as "stu_total",
      (select count(*) from "Student" s where s."collegeId" in ${col} and s."isActive" and not s."isArchived")::int as "stu_active",
      (select count(*) from "Student" s where s."collegeId" in ${col} and s."isActive" and not s."isArchived" and s."inviteStatus" = 'ACTIVATED')::int as "stu_activated",
      (select count(*) from "User" where "collegeId" in ${col})::int as "staff_total",
      (select count(*) from "User" where "collegeId" in ${col} and "isActive")::int as "staff_active",
      (select count(*) from "Recruiter" where "collegeId" in ${col})::int as "rec_total",
      (select count(*) from "Recruiter" where "collegeId" in ${col} and "isActive")::int as "rec_active",
      (select count(*) from "PlatformAdmin")::int as "adm_total",
      (select count(*) from "PlatformAdmin" where "isActive")::int as "adm_active",
      (select count(*) from "Drive" d where d."collegeId" in ${col} and d.status <> 'DRAFT' ${rangeOf(Prisma.sql`d."driveDate"`, f)})::int as "drives",
      (select count(*) from "Drive" d where d."collegeId" in ${col} and d.status = 'PUBLISHED' ${rangeOf(Prisma.sql`d."driveDate"`, f)})::int as "drives_published",
      (select count(*) from "Drive" d where d."collegeId" in ${col} and d.status = 'CLOSED' ${rangeOf(Prisma.sql`d."driveDate"`, f)})::int as "drives_closed",
      (select count(*) from "Drive" d where d."collegeId" in ${col} and d.status = 'CANCELLED' ${rangeOf(Prisma.sql`d."driveDate"`, f)})::int as "drives_cancelled",
      (select count(*) from "Application" a where a."collegeId" in ${col} ${rangeOf(Prisma.sql`a."appliedAt"`, f)})::int as "apps",
      (select count(*) from "Application" a where a."collegeId" in ${col} and a.status = 'WITHDRAWN' ${rangeOf(Prisma.sql`a."appliedAt"`, f)})::int as "apps_withdrawn",
      (select count(*) from "Application" a where a."collegeId" in ${col} and a.status = 'SHORTLISTED' ${rangeOf(Prisma.sql`a."appliedAt"`, f)})::int as "apps_shortlisted",
      (select count(*) from "Offer" o where o."collegeId" in ${col} and o.status <> 'REVOKED' ${rangeOf(Prisma.sql`o."offeredAt"`, f)})::int as "offers",
      (select count(*) from "Offer" o where o."collegeId" in ${col} and o.status = 'ACCEPTED' ${rangeOf(Prisma.sql`o."offeredAt"`, f)})::int as "offers_accepted",
      (select count(*) from "Offer" o where o."collegeId" in ${col} and o.status = 'DECLINED' ${rangeOf(Prisma.sql`o."offeredAt"`, f)})::int as "offers_declined",
      (select count(*) from "Offer" o where o."collegeId" in ${col} and o.status = 'REVOKED' ${rangeOf(Prisma.sql`o."offeredAt"`, f)})::int as "offers_revoked",
      (select count(*) from "Offer" o where o."collegeId" in ${col} and o.status <> 'REVOKED' and o."isHistorical" ${rangeOf(Prisma.sql`o."offeredAt"`, f)})::int as "offers_historical",
      (select coalesce(sum(n),0) from pl)::int as "placed",
      (select count(*) from "Student" s where s."collegeId" in ${col} and ${ST_REG})::int as "registered"`);
  // Sign-ins: one LoginEvent per sign-in session (staff, students, recruiters; platform administrators have no college and are not recorded there).
  // With no range the window is the last 30 days, and the answer says so.
  const win = { from: f.from ?? new Date(now.getTime() - 30 * 86_400_000), to: f.to ?? now };
  const [u] = await db.$queryRaw<{ sign_ins: number; users: number; staff: number; students: number; recruiters: number }[]>(Prisma.sql`
    with ${FC(f)}
    select count(*)::int as sign_ins, count(distinct "userId")::int as users,
           count(distinct "userId") filter (where kind = 'staff')::int as staff, count(distinct "userId") filter (where kind = 'student')::int as students, count(distinct "userId") filter (where kind = 'recruiter')::int as recruiters
    from "LoginEvent" where "collegeId" in (select id from fc) and "createdAt" >= ${win.from} and "createdAt" <= ${win.to}`);
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    filters: { from: f.from ?? null, to: f.to ?? null, institution: f.institution ?? null, status: f.status },
    generatedAt: now,
    institutions: { total: n("inst_total"), active: n("inst_active"), suspended: n("inst_suspended"), registeredLast30Days: n("inst_last30"), registeredInRange: hasRange(f) ? n("inst_in_range") : null },
    users: {
      students: { total: n("stu_total"), active: n("stu_active"), withLogin: n("stu_activated") },
      staff: { total: n("staff_total"), active: n("staff_active") },
      recruiters: { total: n("rec_total"), active: n("rec_active") },
      platformAdministrators: { total: n("adm_total"), active: n("adm_active"), note: "Platform-level: not filtered by institution" },
      activeUsers: { window: { from: win.from, to: win.to, defaulted: !hasRange(f) }, distinctUsers: u.users, signIns: u.sign_ins, staff: u.staff, students: u.students, recruiters: u.recruiters, basis: "Distinct people with at least one recorded sign-in session in the window" },
    },
    placement: {
      drives: { total: n("drives"), published: n("drives_published"), closed: n("drives_closed"), cancelled: n("drives_cancelled") },
      applications: { total: n("apps"), shortlisted: n("apps_shortlisted"), withdrawn: n("apps_withdrawn") },
      offers: { made: n("offers"), accepted: n("offers_accepted"), declined: n("offers_declined"), revoked: n("offers_revoked"), historicalImported: n("offers_historical") },
      placedStudents: n("placed"), registeredForPlacement: n("registered"),
      placementRate: rate(n("placed"), n("registered")),
      rateDefinition: hasRange(f) ? "Registered students with an offer accepted in the range, divided by all students registered for placement (active, not archived)" : "Students placed, divided by all students registered for placement (active, not archived)",
    },
  };
}

/** Time series for the charts: institutions registered, sign-ins, applications and offers per day or month, zero-filled. */
export async function platformSeries(f: AnalyticsFilters, now = new Date()) {
  const to = f.to ?? now;
  // No range: the last 12 whole-or-partial months ending now (a fixed, stated window). With a range: exactly that range.
  const from = f.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
  const unit = bucketFor(from, to), fmt = unit === "day" ? "YYYY-MM-DD" : "YYYY-MM";
  const trunc = Prisma.raw(`'${unit}'`), fmtRaw = Prisma.raw(`'${fmt}'`); // constants chosen in code, never from the request
  const series = (table: string, ts: string, extra: Prisma.Sql) => db.$queryRaw<{ k: string; n: number }[]>(Prisma.sql`
    with ${FC(f)} select to_char(date_trunc(${trunc}, ${Prisma.raw(ts)} at time zone 'UTC'), ${fmtRaw}) as k, count(*)::int as n
    from ${Prisma.raw(table)} t where ${extra} and t."collegeId" in (select id from fc) and ${Prisma.raw(ts)} >= ${from} and ${Prisma.raw(ts)} <= ${to} group by 1`);
  const [reg, ins, apps, offs] = await Promise.all([
    db.$queryRaw<{ k: string; n: number }[]>(Prisma.sql`with ${FC(f)} select to_char(date_trunc(${trunc}, fc."createdAt" at time zone 'UTC'), ${fmtRaw}) as k, count(*)::int as n from fc where fc."createdAt" >= ${from} and fc."createdAt" <= ${to} group by 1`),
    series(`"LoginEvent"`, `t."createdAt"`, Prisma.sql`true`),
    series(`"Application"`, `t."appliedAt"`, Prisma.sql`true`),
    series(`"Offer"`, `t."offeredAt"`, Prisma.sql`t.status <> 'REVOKED'`),
  ]);
  const keys = bucketKeys(from, to, unit);
  const map = (rows: { k: string; n: number }[]) => new Map(rows.map((x) => [x.k, Number(x.n)]));
  const [m1, m2, m3, m4] = [map(reg), map(ins), map(apps), map(offs)];
  return { unit, from, to, points: keys.map((k) => ({ period: k, institutionsRegistered: m1.get(k) ?? 0, signIns: m2.get(k) ?? 0, applications: m3.get(k) ?? 0, offers: m4.get(k) ?? 0 })) };
}

const ORDER: Record<(typeof TABLE_SORTS)[number], string> = { name: `fc.name`, status: `fc."isActive"`, createdAt: `fc."createdAt"`, students: `students`, staff: `staff`, recruiters: `recruiters`, placed: `placed`, rate: `rate`, drives: `drives`, applications: `applications`, offers: `offers` };

/** One row per institution, aggregated in the database and paged. Each measure is aggregated in its own sub-query and joined on the institution id, so no join can multiply counts. */
export async function institutionTable(q: TableQuery) {
  const range = (col: string) => rangeOf(Prisma.raw(col), q);
  const dir = Prisma.raw(q.order === "asc" ? "asc" : "desc");
  const rows = await db.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    with ${FC(q, q.q)},
    pl as (${placedSql(q)}),
    st as (select s."collegeId" as id, count(*) as total, count(*) filter (where s."isActive" and not s."isArchived") as active, count(*) filter (where ${ST_REG}) as registered from "Student" s where s."collegeId" in (select id from fc) group by 1),
    us as (select "collegeId" as id, count(*) as total, count(*) filter (where "isActive") as active from "User" where "collegeId" in (select id from fc) group by 1),
    rc as (select "collegeId" as id, count(*) as total, count(*) filter (where "isActive") as active from "Recruiter" where "collegeId" in (select id from fc) group by 1),
    dr as (select d."collegeId" as id, count(*) as n from "Drive" d where d."collegeId" in (select id from fc) and d.status <> 'DRAFT' ${range(`d."driveDate"`)} group by 1),
    ap as (select a."collegeId" as id, count(*) as n from "Application" a where a."collegeId" in (select id from fc) ${range(`a."appliedAt"`)} group by 1),
    ofr as (select o."collegeId" as id, count(*) as n from "Offer" o where o."collegeId" in (select id from fc) and o.status <> 'REVOKED' ${range(`o."offeredAt"`)} group by 1),
    t as (
      select fc.id, fc.name, fc.slug, fc."isActive", fc."createdAt",
        coalesce(st.total,0)::int as students, coalesce(st.active,0)::int as "studentsActive", coalesce(st.registered,0)::int as registered,
        coalesce(us.total,0)::int as staff, coalesce(us.active,0)::int as "staffActive",
        coalesce(rc.total,0)::int as recruiters, coalesce(rc.active,0)::int as "recruitersActive",
        coalesce(pl.n,0)::int as placed, coalesce(dr.n,0)::int as drives, coalesce(ap.n,0)::int as applications, coalesce(ofr.n,0)::int as offers,
        case when coalesce(st.registered,0) > 0 then round(coalesce(pl.n,0)::numeric * 100 / st.registered, 1) end as rate
      from fc left join st using (id) left join us using (id) left join rc using (id) left join pl using (id) left join dr using (id) left join ap using (id) left join ofr using (id))
    select fc.*, (count(*) over())::int as total from t as fc
    order by ${Prisma.raw(ORDER[q.sort])} ${dir} nulls last, fc."createdAt" desc, fc.id asc
    limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`);
  let total = Number(rows[0]?.total ?? 0);
  if (!rows.length && q.page > 1) total = Number((await db.$queryRaw<{ n: number }[]>(Prisma.sql`with ${FC(q, q.q)} select count(*)::int as n from fc`))[0]?.n ?? 0);
  return {
    items: rows.map((row) => { const r = { ...row }; delete r.total; return { ...r, rate: r.rate == null ? null : Number(r.rate) }; }),
    page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), sort: q.sort, order: q.order,
  };
}

/** Latest registrations (institutions) and latest platform administrator activity, for the dashboard's activity tables. Reuses the audit viewer's read. */
export async function recentActivity(f: AnalyticsFilters) {
  const registrations = await db.$queryRaw<{ id: string; name: string; isActive: boolean; createdAt: Date }[]>(Prisma.sql`
    with ${FC(f)} select id, name, "isActive", "createdAt" from fc where true ${rangeOf(Prisma.sql`"createdAt"`, f)} order by "createdAt" desc, id asc limit 10`);
  const admin = await listAudit({ sort: "createdAt", order: "desc", page: 1, pageSize: 10, from: f.from, to: f.to, institution: f.institution });
  return { registrations, adminActivity: admin.items };
}

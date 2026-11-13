import { z } from "zod";
import { ModuleKey, type Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest, notFound } from "@/lib/api/errors";
import { assertRenameAllowed, cleanName, logoUrlSchema } from "@/lib/institutionName";
import { usageForCollege } from "@/lib/ai/usage";
import type { PlatformSession } from "@/lib/auth/platform";

/**
 * Institution detail, editing and usage for platform administrators (SA-TC-043, 044, 046).
 * Detail and usage return counts and dates only: no student, staff or recruiter record leaves. The one person shown is the institution's first
 * administrator (name and e-mail), because the platform team needs a contact. Editing changes the institution's own settings only: removing a
 * module switches it off (CollegeModule.enabled = false, the row and all data stay); nothing is deleted. Every edit is one transaction with its audit row.
 */
export const idSchema = z.uuid();
export const parseId = (id: string) => { if (!idSchema.safeParse(id).success) throw notFound("Institution not found"); return id; };

export const editInput = z.object({
  name: z.string().trim().min(3).max(200).transform(cleanName).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1a73e8").nullable().optional(),
  logoUrl: logoUrlSchema.nullable().optional(),
  modules: z.array(z.enum(ModuleKey)).max(40).optional(),
  isActive: z.boolean().optional(),
  /** The `updatedAt` the editor saw. When given and the institution has changed since, the edit is refused with 409 STALE instead of overwriting. */
  expectedUpdatedAt: z.iso.datetime().optional(),
}).strict().refine((v) => v.name !== undefined || v.brandColor !== undefined || v.logoUrl !== undefined || v.modules !== undefined || v.isActive !== undefined, { message: "Nothing to change" });

const ALL = Object.values(ModuleKey);

export async function institutionDetail(id: string) {
  const c = await db.college.findUnique({ where: { id }, select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true, isActive: true, createdAt: true, updatedAt: true } });
  if (!c) throw notFound("Institution not found");
  const [mods, admin, roles, students, activeStudents, departments, programs, batches, lastLogin, lastAction, history, settings] = await Promise.all([
    db.collegeModule.findMany({ where: { collegeId: id }, select: { module: true, enabled: true } }),
    db.user.findFirst({ where: { collegeId: id, role: "TPO_ADMIN" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { name: true, email: true, isActive: true, createdAt: true } }),
    db.user.groupBy({ by: ["role"], where: { collegeId: id }, _count: { _all: true } }),
    db.student.count({ where: { collegeId: id } }),
    db.student.count({ where: { collegeId: id, isActive: true, isArchived: false } }),
    db.department.count({ where: { collegeId: id } }), db.program.count({ where: { collegeId: id } }), db.batch.count({ where: { collegeId: id } }),
    db.loginEvent.aggregate({ where: { collegeId: id }, _max: { createdAt: true } }),
    db.auditLog.aggregate({ where: { collegeId: id, actorId: { not: null } }, _max: { createdAt: true } }),
    db.auditLog.findMany({ where: { collegeId: id, entity: "College", entityId: id, platformActorId: { not: null } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 25, select: { id: true, action: true, before: true, after: true, createdAt: true, platformActorId: true } }),
    db.collegeSettings.findUnique({ where: { collegeId: id }, select: { requireMfaForAdmins: true } }),
  ]);
  const admins = history.length ? await db.platformAdmin.findMany({ where: { id: { in: [...new Set(history.map((h) => h.platformActorId!))] } }, select: { id: true, name: true, email: true } }) : [];
  const enabled = new Map(mods.map((m) => [m.module, m.enabled]));
  const lastActivity = [lastLogin._max.createdAt, lastAction._max.createdAt].filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    ...c,
    registrationStatus: c.isActive ? "ACTIVE" : "SUSPENDED",
    modules: ALL.map((m) => ({ module: m, enabled: enabled.get(m) === true })),
    firstAdministrator: admin,
    counts: { staff: roles.reduce((a, r) => a + r._count._all, 0), staffByRole: Object.fromEntries(roles.map((r) => [r.role, r._count._all])), students, activeStudents, departments, programs, batches },
    lastActivity,
    security: { requireMfaForAdmins: settings?.requireMfaForAdmins ?? false },
    history: history.map(({ platformActorId, ...h }) => { const a = admins.find((x) => x.id === platformActorId); return { ...h, by: a ? { name: a.name, email: a.email } : null }; }),
  };
}

type Input = z.infer<typeof editInput>;
export async function editInstitution(admin: PlatformSession, id: string, input: Input) {
  try {
    return await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`select id from "College" where id = ${id}::uuid for update`; // one editor at a time per institution
      if (!rows.length) throw notFound("Institution not found");
      const before = await tx.college.findUniqueOrThrow({ where: { id } });
      if (input.expectedUpdatedAt && new Date(input.expectedUpdatedAt).getTime() !== before.updatedAt.getTime()) throw new ApiError(409, "STALE", "This institution was changed by someone else since you opened it. Reload and try again.", { updatedAt: before.updatedAt });
      const data: Prisma.CollegeUpdateInput = {}; const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
      if (input.name !== undefined && input.name !== before.name) {
        await assertRenameAllowed(tx, id, input.name);
        data.name = input.name; b.name = before.name; a.name = input.name;
      }
      if (input.brandColor !== undefined && input.brandColor !== before.brandColor) { data.brandColor = input.brandColor; b.brandColor = before.brandColor; a.brandColor = input.brandColor; }
      if (input.logoUrl !== undefined && input.logoUrl !== before.logoUrl) { data.logoUrl = input.logoUrl; b.logoUrl = before.logoUrl; a.logoUrl = input.logoUrl; }
      const actor = { collegeId: id, userId: null, platformActorId: admin.adminId };
      if (input.modules) {
        const want = new Set(input.modules);
        const cur = await tx.collegeModule.findMany({ where: { collegeId: id } });
        const was = cur.filter((m) => m.enabled).map((m) => m.module).sort();
        const will = [...want].sort();
        if (was.join() !== will.join()) {
          for (const m of ALL) {
            const row = cur.find((r) => r.module === m);
            if (want.has(m) && !row) await tx.collegeModule.create({ data: { collegeId: id, module: m, enabled: true } });
            else if (row && row.enabled !== want.has(m)) await tx.collegeModule.update({ where: { collegeId_module: { collegeId: id, module: m } }, data: { enabled: want.has(m) } }); // switched off, never deleted
          }
          b.modules = was; a.modules = will;
        }
      }
      if (Object.keys(a).length > 0) {
        data.updatedAt = new Date();
        await tx.college.update({ where: { id }, data });
        await audit(actor, { action: "institution.update", entity: "College", entityId: id, before: b as Prisma.InputJsonValue, after: a as Prisma.InputJsonValue }, tx);
      }
      if (input.isActive !== undefined && input.isActive !== before.isActive) {
        await tx.college.update({ where: { id }, data: { isActive: input.isActive, updatedAt: new Date() } });
        await audit(actor, { action: input.isActive ? "institution.activate" : "institution.deactivate", entity: "College", entityId: id, before: { isActive: before.isActive }, after: { isActive: input.isActive } }, tx);
      }
      return tx.college.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true, isActive: true, updatedAt: true } });
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") throw new ApiError(409, "DUPLICATE_INSTITUTION", "An institution with this name is already registered. Use a different name.");
    throw e;
  }
}

// ---------------- usage ----------------
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const day = (end: boolean) => (v: unknown) => (typeof v === "string" && dateOnly.test(v) ? new Date(v + (end ? "T23:59:59.999Z" : "T00:00:00.000Z")) : v);
export const usageQuery = z.object({
  from: z.preprocess(day(false), z.date({ error: "from must be a date (YYYY-MM-DD)" })).optional(),
  to: z.preprocess(day(true), z.date({ error: "to must be a date (YYYY-MM-DD)" })).optional(),
}).refine((v) => !v.from || !v.to || v.from <= v.to, { message: "The start date must not be after the end date", path: ["from"] })
  .refine((v) => !v.from || !v.to || v.to.getTime() - v.from.getTime() < 366 * 86_400_000, { message: "Choose a period of at most 366 days", path: ["to"] });

const dayStart = (d: Date) => new Date(d.toISOString().slice(0, 10) + "T00:00:00.000Z");
/** Defaults to the last 30 UTC days including today. A date-only `to` covers that whole day. */
export async function institutionUsage(id: string, q: z.infer<typeof usageQuery>) {
  const c = await db.college.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!c) throw notFound("Institution not found");
  const to = q.to ?? new Date(new Date().toISOString().slice(0, 10) + "T23:59:59.999Z");
  const from = q.from ?? new Date(dayStart(to).getTime() - 29 * 86_400_000);
  if (from > to) throw badRequest("The start date must not be after the end date");
  const w = { gte: from, lte: to };
  const [users, activeUsers, students, activeStudents, docsLive, docNew, signIns, distinct, ai, newUsers, newStudents] = await Promise.all([
    db.user.count({ where: { collegeId: id } }), db.user.count({ where: { collegeId: id, isActive: true } }),
    db.student.count({ where: { collegeId: id } }), db.student.count({ where: { collegeId: id, isActive: true, isArchived: false } }),
    db.studentDocument.aggregate({ where: { collegeId: id, archivedAt: null }, _count: { _all: true }, _sum: { sizeBytes: true } }),
    db.studentDocument.aggregate({ where: { collegeId: id, createdAt: w }, _count: { _all: true }, _sum: { sizeBytes: true } }),
    db.loginEvent.count({ where: { collegeId: id, createdAt: w } }),
    db.loginEvent.findMany({ where: { collegeId: id, createdAt: w }, distinct: ["userId"], select: { userId: true } }),
    usageForCollege(id, dayStart(from), dayStart(to)),
    db.user.count({ where: { collegeId: id, createdAt: w } }), db.student.count({ where: { collegeId: id, createdAt: w } }),
  ]);
  return {
    institution: c, period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), defaulted: !q.from && !q.to },
    snapshot: { users, activeUsers, students, activeStudents, documents: docsLive._count._all, storageBytes: docsLive._sum.sizeBytes ?? 0 },
    activity: { signIns, distinctSignedInUsers: distinct.length, newUsers, newStudents, uploads: docNew._count._all, uploadBytes: docNew._sum.sizeBytes ?? 0, ai },
    basis: "Snapshot figures are as of now. Period figures count events whose time falls inside the period (UTC days, both ends included). Uploads are student documents (a replaced file is counted when uploaded, and is not in the stored total once archived). AI figures come from the platform's daily AI usage statistics.",
  };
}

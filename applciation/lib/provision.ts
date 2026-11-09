import { z } from "zod";
import { ModuleKey, type Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/api/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PlatformSession } from "@/lib/auth/platform";

const code = z.string().trim().toUpperCase().min(1).max(20);

export const provisionInput = z.object({
  name: z.string().trim().min(3).max(200),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case letters, numbers and hyphens").min(3).max(60).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  logoUrl: z.url().nullable().optional(),
  admin: z.object({ name: z.string().trim().min(2).max(120), email: z.email().transform((e) => e.toLowerCase()) }),
  /** Modules to switch on. Omitted means all of them, which is what the first seeded college gets. */
  modules: z.array(z.enum(ModuleKey)).optional(),
  /** Only when the institution wants a head start; otherwise its administrator builds the structure in Settings. */
  departments: z.array(z.object({ name: z.string().trim().min(2).max(120), code })).max(50).optional(),
  academicYear: z.object({ name: z.string().trim().min(3).max(40), startDate: z.coerce.date(), endDate: z.coerce.date() }).refine((y) => y.endDate > y.startDate, "The academic year must end after it starts").optional(),
});
export type ProvisionInput = z.infer<typeof provisionInput>;

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "institution";

/**
 * Creates one institution end to end: the college, its settings, its modules, an optional starting structure and its first TPO
 * administrator. Everything written carries the new collegeId, and the whole database part is one transaction with its audit entries,
 * so a failure leaves no half-built institution. The administrator is invited by email through the same Supabase flow as staff invitations;
 * if the database part fails the invited auth user is removed again.
 */
export async function provisionInstitution(platform: PlatformSession, input: ProvisionInput) {
  const slug = input.slug ?? slugify(input.name);
  if (await db.college.findUnique({ where: { slug } })) throw new ApiError(409, "CONFLICT", `An institution with the address "${slug}" already exists`);
  const dup = new Set<string>();
  for (const d of input.departments ?? []) { if (dup.has(d.code)) throw badRequest(`Department code ${d.code} is used twice`); dup.add(d.code); }

  const { data: invited, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(input.admin.email, {
    redirectTo: process.env.APP_URL ? `${process.env.APP_URL}/auth/accept-invite` : undefined,
  });
  if (error || !invited.user) throw badRequest(error?.message ?? "Could not send the invitation to the administrator");

  try {
    return await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const college = await tx.college.create({ data: { name: input.name, slug, brandColor: input.brandColor ?? null, logoUrl: input.logoUrl ?? null } });
      const actor = { collegeId: college.id, userId: null, platformActorId: platform.adminId };
      await tx.collegeSettings.create({ data: { collegeId: college.id } });
      const modules = input.modules ?? Object.values(ModuleKey);
      await tx.collegeModule.createMany({ data: modules.map((module) => ({ collegeId: college.id, module })) });
      const tpo = await tx.user.create({ data: { id: invited.user.id, collegeId: college.id, email: input.admin.email, name: input.admin.name, role: "TPO_ADMIN" }, select: { id: true, email: true, name: true } });
      if (input.departments?.length) await tx.department.createMany({ data: input.departments.map((d) => ({ ...d, collegeId: college.id })) });
      if (input.academicYear) await tx.academicYear.create({ data: { ...input.academicYear, collegeId: college.id, isCurrent: true, status: "ACTIVE" } });
      await audit(actor, { action: "institution.provision", entity: "College", entityId: college.id, after: { name: college.name, slug, modules, departments: input.departments?.map((d) => d.code) ?? [], academicYear: input.academicYear?.name ?? null, admin: tpo.email, by: platform.email } }, tx);
      return { college: { id: college.id, name: college.name, slug }, admin: tpo, modules };
    });
  } catch (e) {
    await supabaseAdmin().auth.admin.deleteUser(invited.user.id);
    throw e;
  }
}

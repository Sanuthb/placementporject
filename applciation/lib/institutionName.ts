import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";

/**
 * One institution name, one institution. Two names are the same when they match after trimming, collapsing runs of spaces and
 * ignoring letter case ("St. Joseph College", "  st. joseph   COLLEGE "). Nothing fuzzier is assumed: the SRS only lists
 * "Institution registration" and "Duplicate detection", and approved decision 1 asks for an exact (case-insensitive) match.
 * Inactive institutions count, because a suspended institution still owns its name.
 */
export const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");
export const nameKey = (s: string) => cleanName(s).toLowerCase();

const DUPLICATE = () => new ApiError(409, "DUPLICATE_INSTITUTION", "An institution with this name is already registered. Use a different name, or contact the existing institution.");

type Client = Prisma.TransactionClient | typeof db;
/** Compares in the database (lower + whitespace collapse on both sides) so it matches rows saved before this rule existed. */
export async function assertNameAvailable(c: Client, name: string) {
  const rows = await c.$queryRaw<{ id: string }[]>`select id from "College" where lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = ${nameKey(name)} limit 1`;
  if (rows.length) throw DUPLICATE();
}

/** Serialises concurrent registrations of the same name for the rest of the transaction: the second one waits, then finds the first and is refused. */
export async function lockName(tx: Prisma.TransactionClient, name: string) {
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${"institution-name:" + nameKey(name)}))`;
}
export const duplicateInstitution = DUPLICATE;

/**
 * The same rule for a rename. Takes the same per-name lock as registration (so concurrent renames and registrations of one name queue), then refuses the
 * name when ANOTHER institution already has it. The institution's own row is excluded, so keeping its name, or changing only its letter case or spacing, is allowed.
 */
export async function assertRenameAllowed(tx: Prisma.TransactionClient, collegeId: string, name: string) {
  await lockName(tx, name);
  const rows = await tx.$queryRaw<{ id: string }[]>`select id from "College" where id <> ${collegeId}::uuid and lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = ${nameKey(name)} limit 1`;
  if (rows.length) throw DUPLICATE();
}

/** The one rule for an institution logo address, used by the platform edit and the institution's own settings: an http or https URL, nothing else (no javascript:, data:, file: or ftp:). */
export const logoUrlSchema = z.url().refine((u) => /^https?:\/\//i.test(u), "Use an http or https address").refine((u) => u.length <= 2000, "Address too long");

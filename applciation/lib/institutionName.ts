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

import { z } from "zod";

/** Same rule the onboarding wizard applies to a mobile number (`computeMissing`), so both entry points accept and refuse the same input. */
export const MOBILE = /^\+?[\d\s-]{7,16}$/;
const POSTAL = /^[A-Za-z0-9][A-Za-z0-9 -]{1,10}[A-Za-z0-9]$/;

/** A blank is allowed (a field the student left empty); anything typed must be valid. */
const blank = (v: unknown) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v);
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blank, schema.optional());

// JavaScript reads 2003-02-31 as 3 March, so the date must also survive a round trip to be a day that exists.
const isRealDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

/**
 * The PERSONAL profile section. Only the fields the platform understands are checked; other keys are kept as they are (looseObject),
 * so data written by earlier versions of the wizard and editor is never rejected for carrying an extra key.
 */
export const personalSection = z.looseObject({
  fullName: opt(z.string().trim().min(2, "Enter the full name").max(120)),
  dob: opt(z.string().trim().refine(isRealDate, "Enter a valid date of birth").refine((s) => Date.parse(s) <= Date.now(), "Date of birth cannot be in the future").refine((s) => Date.parse(s) >= Date.parse("1950-01-01"), "Date of birth is too far in the past")),
  gender: opt(z.string().trim().max(30)),
  phone: opt(z.string().trim().regex(MOBILE, "Enter a valid mobile number (7 to 16 digits, optional +)")),
  alternatePhone: opt(z.string().trim().regex(MOBILE, "Enter a valid alternate phone number")),
  alternateEmail: opt(z.email("Enter a valid alternate email address").max(200)),
  address: opt(z.string().trim().max(500)),
  city: opt(z.string().trim().max(80)),
  state: opt(z.string().trim().max(80)),
  pincode: opt(z.string().trim().regex(POSTAL, "Enter a valid postal code")),
  linkedin: opt(z.url("Enter the LinkedIn address as a full link").max(300)),
});

/** The postal address as the Student record keeps it: one line, same joining the onboarding submit uses. */
export function joinAddress(p: { address?: unknown; city?: unknown; state?: unknown; pincode?: unknown }) {
  return [p.address, p.city, p.state, p.pincode].filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()).join(", ");
}

export type StudentContact = { phone?: string; dateOfBirth?: Date; gender?: string; address?: string };

/**
 * What approving a PERSONAL section writes onto the Student record. Only values that are present change the record: a blank never
 * erases what is on file. Name is deliberately absent, because the name is institution-controlled and has its own review.
 */
export function studentFieldsFromPersonal(data: Record<string, unknown>): StudentContact {
  const out: StudentContact = {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
  const phone = str(data.phone), gender = str(data.gender), dob = str(data.dob), address = joinAddress(data);
  if (phone) out.phone = phone;
  if (gender) out.gender = gender;
  if (dob && isRealDate(dob)) out.dateOfBirth = new Date(dob);
  if (address) out.address = address;
  return out;
}
